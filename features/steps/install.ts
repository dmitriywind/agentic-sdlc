// The installer: init, validate and doctor against a package fixture, plus the vcs push refusal.
// The CLI runs as a process on a project whose binding the scenario does not write (init makes it); the doctor checks
// run in-process on a fake exec. A package fixture is a temp dir that AGENTIC_SDLC_PACKAGE points at.
// State on w.state: pkg (package dir), d (doctor: rules, calls, tokens, env, lines), noted (file -> text), launch
// (launcher: env, log), vcs (error of the last push).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseYaml, stringify } from 'yaml';
import { skillRegression } from '../../src/gates.ts';
import { cli, cliPin, deliveryWorkflow, implementerToken, probeFailure, selfHostedRunner, trunkProtection, unpinnedActions, validate } from '../../src/install.ts';
import { isInstallable, shippedHashes } from '../../src/pristine.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { BIN, Outcome, REPO, merge, splitArgs, type World } from '../support/world.ts';
import { capture } from './ledger.ts';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const nl = (s: string) => s.replace(/\\n/g, '\n');
const put = (dir: string, rel: string, text: string) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
const pkgOf = (w: World): string => w.state.pkg;

// ---- the package fixture ----
const fm = (name: string, meta: string, extra = '') => `---\nname: ${name}\ndescription: d\n${extra}metadata:\n${meta}---\nbody\n`;
const pack = (): Record<string, string> => ({
  'sdlc/SKILL.md': fm('sdlc', '  tier: fast\n'),
  'plan/SKILL.md': fm('plan', '  steps:\n    triage: { tier: fast }\n    groom: { tier: balanced }\n    shape: { tier: deep }\n') + 'see [the contract](../sdlc/references/contract.md)\n',
  'plan/steps/triage.md': 'triage\n',
  'plan/steps/groom.md': 'groom\n',
  'plan/steps/shape.md': 'shape, then [escalate](../../escalate/SKILL.md)\n',
  'build/SKILL.md': fm('build', '  tier: deep\n'),
  'review/SKILL.md': fm('review', '  steps:\n    review: { tier: balanced }\n    verify: { tier: balanced }\n'),
  'review/steps/review.md': 'review\n',
  'review/steps/verify.md': 'verify\n',
  'ship/SKILL.md': fm('ship', '  tier: balanced\n', 'disable-model-invocation: true\n'),
  'learn/SKILL.md': fm('learn', '  steps:\n    judge: { tier: fast }\n    improve: { tier: deep }\n'),
  'learn/steps/judge.md': 'judge\n',
  'learn/steps/improve.md': 'improve\n',
  'escalate/SKILL.md': fm('escalate', '  tier: fast\n'),
  'sdlc/references/contract.md': 'contract\n',
});

Given('an installable package at version {string}', (w, version: string) => {
  const pkg = mkdtempSync(join(tmpdir(), 'pkg-'));
  w.onCleanup(() => rmSync(pkg, { recursive: true, force: true }));
  put(pkg, 'package.json', JSON.stringify({ name: 'agentic-sdlc', version }));
  for (const [p, t] of Object.entries(pack())) put(pkg, `skills/${p}`, t);
  put(pkg, 'templates/binding.yml', '# doc\nversion: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git }\nmodels: { fast: claude-haiku-4-5, balanced: your-balanced-model-id }\n');
  put(pkg, 'templates/gates/github/gate.yml', 'on: push\n');
  put(pkg, 'templates/gates/hooks/pre-push', '#!/bin/sh\n');
  for (const n of ['cycle-prompt.md', 'review-prompt.md']) put(pkg, `templates/runner/${n}`, n);
  cpSync(join(REPO, 'templates/mcp'), join(pkg, 'templates/mcp'), { recursive: true });
  cpSync(join(REPO, 'templates/bin'), join(pkg, 'templates/bin'), { recursive: true });
  cpSync(join(REPO, 'templates/gates/github/ruleset.trunk.json'), join(pkg, 'templates/gates/github/ruleset.trunk.json'));
  w.state.pkg = pkg;
  w.env.AGENTIC_SDLC_PACKAGE = pkg;
});
Given('the package has no templates', (w) => { w.env.AGENTIC_SDLC_PACKAGE = w.path('nowhere'); });
Given('the package file {string} holds {string}', (w, rel: string, text: string) => put(pkgOf(w), rel, nl(text)));
Given('the package ships the stock file {string}', (w, rel: string) => { mkdirSync(dirname(join(pkgOf(w), rel)), { recursive: true }); cpSync(join(REPO, rel), join(pkgOf(w), rel)); });
Given('the package no longer ships {string}', (w, rel: string) => rmSync(join(pkgOf(w), rel), { recursive: true, force: true }));
Given('the package is at version {string}', (w, version: string) => put(pkgOf(w), 'package.json', JSON.stringify({ name: 'agentic-sdlc', version })));
Given('the package binding template also sets vcs.trunk and slo', (w) => {
  const f = join(pkgOf(w), 'templates/binding.yml');
  writeFileSync(f, readFileSync(f, 'utf8').replace('vcs: { adapter: git }', 'vcs: { adapter: git, trunk: main }') + 'slo: { target: 99 }\n');
});

// ---- the project ----
Given('the project has the file {string} holding {string}', (w, rel: string, text: string) => w.write(rel, nl(text)));
Given('the adopter appends {string} to the installed file {string}', (w, text: string, rel: string) => w.write(rel, w.read(rel) + nl(text)));
Given('the project is a git repository with the origin {string}', (w, url: string) => { w.git(['init', '-q']); w.git(['remote', 'add', 'origin', url]); });
Given('the installed binding also runs the executors {string}', (w, names: string) => {
  const b = parseYaml(w.read('.agents/binding.yml'));
  for (const n of names.split(',').map((s) => s.trim())) b.executors[n] = { kind: 'harness' };
  w.write('.agents/binding.yml', JSON.stringify(b));
});
Given('the installed binding is complete and runs a bot that is assigned work', (w) => {
  w.write('.agents/binding.yml', stringify({
    version: 2, profile: 'individual', owners: { product: 'a', factory: 'b', bots: ['bot'] },
    board: { adapter: 'local', options: {}, statuses: ['Ideas', 'Signals', 'Backlog', 'Ready', 'In progress', 'In review', 'Done', 'Cancelled'] },
    forge: { adapter: 'github' }, vcs: { adapter: 'git', change_pattern: 'ticket/<ticket>', trunk: 'main', release_prefix: 'release/', factory_change_pattern: 'factory/<name>', tag_prefix: 'v' },
    models: { fast: 'f', balanced: 'b', deep: 'd' }, commands: {}, paths: { factory: ['.agents/**'] }, sizes: ['S', 'M'], ready_size_limit: 'M', fast_lane_max_size: 'S',
    priorities: [], p0_setters: [], max_subissue_depth: 1, spec_marker: 'spec.md', stall_minutes: 60, parallel_agents: 1,
    cycle: {}, heartbeat: { ticket: '1' }, learning: {}, product: { environments: ['staging', 'production'], proofs: ['test'] },
    executors: { default: { kind: 'harness' }, bot: { kind: 'assign', user: 'coding-bot' } },
  }));
});
Given('the installed binding is the shipped template on a local board with the heartbeat ticket {string}', (w, ticket: string) => {
  w.write('.agents/binding.yml', readFileSync(join(REPO, 'templates/binding.yml'), 'utf8')
    .replace(/^(\s*adapter:\s*)github(\s*#.*)?$/m, '$1local').replace(/^(\s*ticket:\s*)""/m, `$1"${ticket}"`));
});
Given('I note the installed file {string}', (w, rel: string) => { (w.state.noted ??= {})[rel] = w.read(rel); });

// ---- the install lock ----
const lockFile = '.agents/install.lock.json';
const lockOf = (w: World): Record<string, string> => JSON.parse(w.read(lockFile));
Given('the install lock is emptied', (w) => w.write(lockFile, '{}\n'));

// ---- running the install commands as a process ----
When('I run the install command {string}', (w, line: string) => { w.last = w.spawn([BIN, '--root', w.root, ...splitArgs(line)], undefined, w.root); });

// ---- the installed files ----
Then('the installed file {string} exists', (w, rel: string) => assert.ok(w.exists(rel), `${rel} is missing`));
Then('the installed file {string} is absent', (w, rel: string) => assert.ok(!w.exists(rel), `${rel} exists`));
Then('the installed file {string} holds {string}', (w, rel: string, text: string) => assert.equal(w.read(rel), nl(text)));
Then('the installed file {string} is as noted', (w, rel: string) => assert.equal(w.read(rel), w.state.noted[rel]));
Then('the installed file {string} contains {string}', (w, rel: string, text: string) => assert.ok(w.read(rel).includes(nl(text)), `${rel}:\n${w.read(rel)}`));
Then('the installed file {string} contains {string} exactly {int} times', (w, rel: string, text: string, n: number) => assert.equal(w.read(rel).split(nl(text)).length - 1, n, w.read(rel)));
Then('the installed file {string} matches {string}', (w, rel: string, re: string) => assert.match(w.read(rel), new RegExp(re, 'm')));
Then('the installed file {string} does not match {string}', (w, rel: string, re: string) => assert.doesNotMatch(w.read(rel), new RegExp(re, 'm')));
Then('the installed file {string} is executable', (w, rel: string) => assert.ok(statSync(w.path(rel)).mode & 0o100, `${rel} is not executable`));
Then('the installed folder {string} holds exactly {string}', (w, rel: string, names: string) =>
  assert.deepEqual(readdirSync(w.path(rel)).sort(), names.split(',').map((s) => s.trim()).sort()));

/** The values at a dotted path of parsed JSON or YAML: `*` maps over a list, `k=v` picks the entry whose k is v. */
const walk = (v: any, segs: string[]): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!segs.length) return v;
  const [s, ...rest] = segs;
  if (s === '*') return (v as unknown[]).map((x) => walk(x, rest));
  const eq = s.indexOf('=');
  if (eq > 0 && Array.isArray(v)) return walk(v.find((x) => String(x?.[s.slice(0, eq)]) === s.slice(eq + 1)), rest);
  return v == null ? undefined : walk(v[s], rest);
};
const valueAt = (w: World, rel: string, path: string) => walk(parseYaml(w.read(rel)), path.split('.'));
const expected = (s: string) => { try { return JSON.parse(s); } catch { return s; } };
Then('the installed file {string} sets {string} to {string}', (w, rel: string, path: string, value: string) => assert.deepEqual(valueAt(w, rel, path), expected(value)));
Then('the installed file {string} sets {string} to a value', (w, rel: string, path: string) => assert.ok(valueAt(w, rel, path), `${rel} has no ${path}`));
Then('the installed file {string} sets no {string}', (w, rel: string, path: string) => assert.equal(valueAt(w, rel, path), undefined));
Then('every value at {string} in the installed file {string} is {string}', (w, path: string, rel: string, value: string) => {
  const vs = valueAt(w, rel, path) as unknown[];
  assert.ok(vs.length > 0 && vs.every((v) => v === expected(value)), JSON.stringify(vs));
});

// ---- the install lock, read back ----
Then('the install lock records {string}', (w, rel: string) => assert.ok(lockOf(w)[rel], `no entry for ${rel}`));
Then('the install lock does not record {string}', (w, rel: string) => assert.equal(lockOf(w)[rel], undefined));

// ---- the output lines ----
const lines = (w: World) => w.last.output.split('\n');
Then('the output has the line {string}', (w, line: string) => assert.ok(lines(w).includes(line), w.last.output));
Then('no line of the output matches {string}', (w, re: string) => assert.ok(!lines(w).some((l) => new RegExp(re).test(l)), w.last.output));
Then('a line of the output matches {string}', (w, re: string) => assert.ok(lines(w).some((l) => new RegExp(re).test(l)), w.last.output));

// ---- the installed skills ----
Then('the installed skill pack has no skill problems', (w) => assert.deepEqual(validate(w.root).filter((m) => m.startsWith('skill ')), []));
Then('the skill regression gate finds no errors', (w) => assert.deepEqual(skillRegression(w.root).errors, []));

// ---- the packaged files ----
const walkDir = (rel: string): string[] => readdirSync(join(REPO, rel)).flatMap((n) =>
  statSync(join(REPO, rel, n)).isDirectory() ? walkDir(`${rel}/${n}`) : [`${rel}/${n}`]);
Then('the known hashes of the package cover every installable file it ships', () => {
  const have = new Set(JSON.parse(readFileSync(join(REPO, 'templates/known-hashes.json'), 'utf8')) as string[]);
  const missing = ['skills', 'scorers', 'templates'].flatMap(walkDir).filter(isInstallable)
    .filter((p) => shippedHashes(p, readFileSync(join(REPO, p))).some((h) => !have.has(h)));
  assert.deepEqual(missing, [], 'run npm run hashes before committing a change to these files');
});

// ---- the launcher ----
Given('a project with the launcher and the pin {string} at {string}', (w, pkg: string, ref: string) => {
  const launcher = '.agents/bin/agentic-sdlc';
  w.write(launcher, readFileSync(join(REPO, 'templates/bin/agentic-sdlc'), 'utf8'));
  chmodSync(w.path(launcher), 0o755);
  w.write('.agents/cli.json', JSON.stringify({ package: pkg, ref }));
});
Given('the pin is changed to {string} at {string}', (w, pkg: string, ref: string) => w.write('.agents/cli.json', JSON.stringify({ package: pkg, ref })));
Given('an npm that lays out a CLI printing its arguments', (w) => {
  const fake = mkdtempSync(join(tmpdir(), 'fakenpm-'));
  w.onCleanup(() => rmSync(fake, { recursive: true, force: true }));
  const log = join(fake, 'npm.log');
  // The stub records its arguments and lays out what npm would: <prefix>/node_modules/agentic-sdlc/dist/bin.js
  put(fake, 'npm', `#!/bin/sh
echo "$*" >> "${log}"
while [ $# -gt 0 ]; do [ "$1" = --prefix ] && prefix="$2"; shift; done
mkdir -p "$prefix/node_modules/agentic-sdlc/dist"
echo 'console.log(JSON.stringify(process.argv.slice(2)))' > "$prefix/node_modules/agentic-sdlc/dist/bin.js"
`);
  chmodSync(join(fake, 'npm'), 0o755);
  w.state.launch = { log, env: { PATH: `${fake}:${dirname(process.execPath)}:/usr/bin:/bin` } };
});
When('I run the launcher with {string}', (w, line: string) => {
  const r = spawnSync(w.path('.agents/bin/agentic-sdlc'), splitArgs(line), { cwd: tmpdir(), env: w.state.launch.env, encoding: 'utf8' });
  w.last = new Outcome(r.status ?? -1, r.stdout ?? '', r.stderr ?? '');
});
const npmCalls = (w: World): string[] => (existsSync(w.state.launch.log) ? readFileSync(w.state.launch.log, 'utf8').trim().split('\n').filter(Boolean) : []);
Then('npm ran {int} times', (w, n: number) => assert.equal(npmCalls(w).length, n, npmCalls(w).join('\n')));
Then('npm call {int} installed {string} at {string} beside the final folder, without scripts', (w, n: number, pkg: string, ref: string) => {
  const c = npmCalls(w)[n - 1];
  assert.ok(c.startsWith(`i --prefix ${w.root}/.agents/.cli/${ref}.tmp`), c);
  assert.ok(c.endsWith(`--ignore-scripts --allow-git=root --no-save --no-audit --no-fund ${pkg}#${ref}`), c);
});

// ---- the stock templates ----
const stockFiles = () => {
  const files = ['gates/github', 'runner'].flatMap((d) => readdirSync(join(REPO, 'templates', d)).filter((n) => /\.(yml|sh|md)$/.test(n)).map((n) => join(REPO, 'templates', d, n)));
  return [...files, join(REPO, 'templates/gates/hooks/pre-push')];
};
Then('no stock workflow, runner or hook file contains {string}', (w, text: string) => {
  for (const p of stockFiles()) assert.ok(!readFileSync(p, 'utf8').includes(text), p);
});
Then('no stock workflow calls agentic-sdlc gate or vcs except through the launcher', () => {
  const dir = join(REPO, 'templates/gates/github');
  const calls = readdirSync(dir).filter((n) => n.endsWith('.yml')).map((n) => readFileSync(join(dir, n), 'utf8').match(/(?<![\w./-])agentic-sdlc (?:gate|vcs) /g) ?? []);
  assert.deepEqual(calls.flat(), []);
});
Then('every job of the stock workflow {string} that runs the launcher checks out the base', (w, rel: string) => {
  const wf = parseYaml(readFileSync(join(REPO, rel), 'utf8'));
  const jobs = Object.entries<Obj>(wf.jobs).filter(([, j]) => j.steps.some((s: Obj) => /\.agents\/bin\/agentic-sdlc/.test(s.run ?? '')));
  assert.ok(jobs.length > 0);
  for (const [name, job] of jobs) {
    const co = job.steps.find((s: Obj) => /^actions\/checkout@/.test(s.uses ?? ''));
    assert.match(String(co?.with?.ref), /base\.ref|default_branch/, `${name} checks out the base`);
  }
});

// ---- doctor: fake exec, in-process checks ----
type Doctor = { rules: [RegExp, string | Error][]; calls: string[]; tokens: (string | undefined)[]; env: Record<string, string | undefined>; lines: string[] };
const doc = (w: World): Doctor => (w.state.d ??= { rules: [], calls: [], tokens: [], env: {}, lines: [] });
const find = (d: Doctor, call: string) => d.rules.find(([re]) => re.test(call))?.[1];
const fakeExec = (d: Doctor) => (cmd: string, args: string[], o: Obj = {}) => {
  const c = [cmd, ...args].join(' ');
  d.calls.push(c); d.tokens.push(o.env?.GH_TOKEN);
  const r = find(d, c);
  if (r instanceof Error) throw r;
  return r ?? '';
};
const fakeHttp = (d: Doctor) => async (method: string, url: string, o?: Obj) => {
  const c = `${method} ${url} ${o?.body ? JSON.stringify(o.body) : ''}`;
  d.calls.push(c);
  const r = find(d, c);
  if (r instanceof Error) throw r;
  return r ? JSON.parse(r) : {};
};
const ctxOf = (w: World) => { const d = doc(w); return { root: w.root, binding: {} as any, options: {}, env: d.env, exec: fakeExec(d), http: fakeHttp(d) }; }; // eslint-disable-line @typescript-eslint/no-explicit-any
/** The binding of the scenario as the doctor checks read it: a GitHub forge on trunk main, plus what the scenario set. */
const bound = (w: World): any => merge({ forge: { adapter: 'github', options: {} }, board: { adapter: 'github' }, vcs: { trunk: 'main' }, product: {} }, w.bindingPatch); // eslint-disable-line @typescript-eslint/no-explicit-any
const answer = (w: World, re: RegExp, text: string | Error) => doc(w).rules.push([re, text]);
const shown = (w: World, ...ls: (string | undefined)[]) => { doc(w).lines = ls.filter((l): l is string => l !== undefined); };

Given('the environment variable {string} is {string}', (w, name: string, value: string) => { doc(w).env[name] = value; });
Given('the trunk rules require the checks:', (w, t: DataTable) => answer(w, /rules\/branches/, JSON.stringify([{
  type: 'required_status_checks',
  parameters: { required_status_checks: t.hashes().map((r) => (r.integration_id ? { context: r.context, integration_id: Number(r.integration_id) } : { context: r.context })) },
}])));
Given('the user read at GitHub answers with the token scopes {string}', (w, scopes: string) => answer(w, /^gh api -i user/, `HTTP/2.0 200 OK\nX-Oauth-Scopes: ${scopes}\n\n{}`));
Given('the repo variable {string} is {string}', (w, name: string, value: string) => {
  const d = doc(w);
  const vars: Record<string, string> = (d as Obj).vars ?? ((d as Obj).vars = {});
  if (value !== '') vars[name] = value;
  d.rules = d.rules.filter(([re]) => re.source !== 'variable list');
  answer(w, /variable list/, JSON.stringify(Object.entries(vars).map(([n, v]) => ({ name: n, value: v }))));
});
Given('the repo is {string}', (w, visibility: string) => answer(w, /--jq \.visibility/, `${visibility}\n`));
Given('the delivery workflow pushes on the branches {string} and sets the env:', (w, branches: string, t: DataTable) => {
  const env = Object.fromEntries(t.raw().map((r) => [r[0], r[1]]));
  w.write('.github/workflows/agentic-sdlc-delivery.yml', stringify({ on: { push: { branches: branches.split(',').map((s) => s.trim()) } }, env }));
});
Given('the forge lists one pull request but refuses check data', (w) => {
  const row = { number: 1, title: 't', html_url: 'u', state: 'open', body: '', head: { ref: 'x', sha: 's1' }, base: { ref: 'main', sha: 'b1' } };
  answer(w, /check-runs/, new Error('HTTP 403: Resource not accessible by personal access token'));
  answer(w, /pulls\?/, JSON.stringify([row]));
  answer(w, /pulls\/1/, JSON.stringify(row));
});

When('doctor checks the trunk protection', (w) => shown(w, ...trunkProtection(bound(w), ctxOf(w))));
When('doctor checks the implementer token', (w) => shown(w, implementerToken(bound(w), ctxOf(w))));
When('doctor checks the self-hosted runner', (w) => shown(w, selfHostedRunner(bound(w), ctxOf(w))));
When('doctor checks the delivery workflow', (w) => shown(w, deliveryWorkflow(bound(w), w.root)));
When('doctor checks the CLI pin', (w) => shown(w, ...cliPin(w.root)));
When('doctor checks the workflow actions', (w) => shown(w, unpinnedActions(w.root)));
When('a probe fails with the message {string}', (w, msg: string) => shown(w, probeFailure(nl(msg), doc(w).env, bound(w))));
When('doctor runs against the fake forge', async (w) => { await capture(w, () => cli(['doctor'], ctxOf(w))); });

Then('doctor prints no line', (w) => assert.deepEqual(doc(w).lines, []));
Then('doctor line {int} matches {string}', (w, n: number, re: string) => assert.match(doc(w).lines[n - 1] ?? '', new RegExp(re), doc(w).lines.join('\n')));
Then('doctor line {int} is {string}', (w, n: number, text: string) => assert.equal(doc(w).lines[n - 1], text));
Then('the forge was asked for check runs', (w) => assert.ok(doc(w).calls.some((c) => /check-runs/.test(c)), doc(w).calls.join('\n')));

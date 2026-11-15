// The bench, driven in-process: cases are built from a fake board and forge, runs go through a fake exec and a fake vcs
// whose trees the scenario describes; compare and report read result files through the CLI.
// State on w.state.bench: board (tickets, spec comments), forge (change requests, diffs, the lists it was asked for),
// trees (files by revision), agent (what the fake agent does), seen (what the fake exec observed), made (every tree dir).
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { BENCH_STEP, agentCommand, benchStepFile, buildCases, diverse, quote, resolveExecutor, runBench, shell, stratify, fill, wilsonLower } from '../../src/bench.ts';
import type { BenchCase } from '../../src/bench.ts';
import { exec } from '../../src/exec.ts';
import type { Board, CR, Forge, Item, Vcs } from '../../src/ports.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { Outcome, type World } from '../support/world.ts';
import { capture } from './ledger.ts';

type Agent = { edits: { path: string; content: string }[]; minutes: number; failVerify: number[]; clockStep: number };
type Seen = { agentTree?: Record<string, string>; prompt?: string; skillText?: string; verifies: { cwd: string; files: Record<string, string> }[]; commands: string[]; agentDir?: string; verifyRuns: number };
type B = {
  items: Item[]; specs: { ticket: string; author: string; body: string }[]; crs: CR[]; diffs: Map<string, string>; asked: Record<string, unknown>[]; mergedRows: number;
  trees: Record<string, Record<string, string>>; agent: Agent; seen: Seen; made: string[]; cases: BenchCase[];
};
const bench = (w: World): B => (w.state.bench ??= {
  items: [], specs: [], crs: [], diffs: new Map(), asked: [], mergedRows: 0, trees: {}, made: [], cases: [],
  agent: { edits: [], minutes: 0, failVerify: [], clockStep: 0 }, seen: { verifies: [], commands: [], verifyRuns: 0 },
} satisfies B);

const done = (w: World, value: unknown) => { w.last = new Outcome(0, JSON.stringify(value), ''); };
const failed = (w: World, e: unknown) => { w.last = new Outcome(1, '', (e as Error).message); };

// ---- the project ----
Given('a project that benches with the agent command {string}', (w, command: string) => w.binding({
  board: { done_statuses: ['Done'] }, paths: {}, spec_marker: '<!-- spec -->', agent_command: command,
  commands: { fast_check: 'npm run check', verify: 'npm test' }, learning: { bench_size: 10 },
  owners: { product: 'po', factory: 'fo', bots: ['factory-bot'] }, vcs: { adapter: 'git' },
}));
Given('the bench demands {int} shared cases and {int} trials', (w, cases: number, trials: number) => w.binding({ learning: { bench_min_cases: cases, bench_trials: trials } }));
Given('the bench budget allows {int} runs', (w, n: number) => w.binding({ learning: { bench_budget: { max_runs: n } } }));
Given('the bench budget allows {int} minutes', (w, n: number) => w.binding({ learning: { bench_budget: { max_minutes: n } } }));
Given('the executors:', (w, t: DataTable) => w.binding({
  executors: Object.fromEntries(t.hashes().map((r) => [r.name, { kind: r.kind, ...(r.run ? { run: r.run } : {}), ...(r.url_env ? { url_env: r.url_env } : {}), ...(r.max_turns ? { max_turns: Number(r.max_turns) } : {}) }])),
}));

// ---- the board and the forge that cases are built from ----
Given('these Done tickets:', (w, t: DataTable) => {
  for (const r of t.hashes()) bench(w).items.push({ id: r.id, title: `T${r.id}`, updatedAt: r.updated, ...(r.body ? { body: r.body } : {}), ...(r.size ? { fields: { size: r.size } } : {}) } as Item);
});
Given('{string} commented the spec {string} on ticket {string}', (w, author: string, spec: string, ticket: string) => bench(w).specs.push({ ticket, author, body: `<!-- spec -->\n${spec}` }));
Given('the forge has these change requests:', (w, t: DataTable) => {
  for (const r of t.hashes()) bench(w).crs.push({ n: r.cr, closes: [r.closes], state: r.state || 'merged', baseSha: `b${r.cr}`, headSha: `h${r.cr}` } as CR);
});
Given('the forge lists {int} merged change requests that close no ticket', (w, n: number) => {
  bench(w).crs = Array.from({ length: n }, (_, i) => ({ n: String(i), state: 'merged', closes: [] }) as unknown as CR);
});

const diffText = (changes: string[], adds: string[]) => [
  ...changes.flatMap((p) => [`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, '@@ -1 +1 @@', '-x', '+y']),
  ...adds.flatMap((p) => [`diff --git a/${p} b/${p}`, 'new file mode 100644', '--- /dev/null', `+++ b/${p}`, '@@ -0,0 +1 @@', '+t']),
].join('\n');
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
Given('the diff of CR {string} changes {string} and adds {string}', (w, cr: string, changes: string, adds: string) => bench(w).diffs.set(cr, diffText(list(changes), list(adds))));

const fakes = (w: World) => {
  const b = bench(w);
  const board = {
    list: async (q: { status?: string[] }) => (assert.deepEqual(q.status, ['Done']), b.items),
    comments: async (id: string) => b.specs.filter((s) => s.ticket === id),
    get: async (id: string) => b.items.find((i) => i.id === id) ?? ({ id } as Item),
  } as unknown as Board;
  const forge = {
    list: async (q: Record<string, unknown>) => (b.asked.push(q), b.crs),
    diff: async (n: string) => b.diffs.get(n) ?? '',
  } as unknown as Forge;
  return { board, forge };
};

const num = (s: string) => (s === 'all' ? Infinity : Number(s));
When('the bench builds cases with limit {string}, per-size {string}, paths {string}, merged-limit {string} and since {string}', async (w, limit: string, perSize: string, paths: string, merged: string, since: string) => {
  const { board, forge } = fakes(w);
  const binding = w.adapterContext().binding;
  await capture(w, async () => {
    const o = { ...(paths ? { paths: list(paths) } : {}), ...(perSize ? { perSize: num(perSize) } : {}), ...(merged ? { mergedLimit: Number(merged) } : {}), ...(since ? { since } : {}) };
    bench(w).cases = await buildCases(board, forge, binding, limit ? num(limit) : 5, o);
    console.log(JSON.stringify(bench(w).cases));
    return 0;
  });
});
When('the bench builds {int} cases', async (w, n: number) => {
  const { board, forge } = fakes(w);
  const binding = w.adapterContext().binding;
  await capture(w, async () => { console.log(JSON.stringify(bench(w).cases = await buildCases(board, forge, binding, n))); return 0; });
});
Then('the forge was asked for the newest {int} merged change requests since {string}', (w, n: number, since: string) => {
  assert.deepEqual(bench(w).asked.at(-1), { state: 'merged', limit: n, since: since || undefined });
});
Then('the error output has {int} lines', (w, n: number) => assert.equal(w.last.stderr.split('\n').filter(Boolean).length, n));

Given('these bench cases:', (w, t: DataTable) => {
  bench(w).cases = t.hashes().map((r) => ({ id: r.id, ticket: r.id, title: 'T', spec: 's', baseSha: 'base', headSha: 'head', oracleTests: ['test/a.test.ts'], size: r.size, area: r.area, ...(r.merged ? { mergedAt: r.merged } : {}) }));
});
When('the cases are spread to {int} per size over the sizes {string}', (w, n: number, sizes: string) => done(w, stratify(bench(w).cases, n, list(sizes))));
When('{int} cases are picked for diversity', (w, n: number) => done(w, diverse(bench(w).cases, n)));

// ---- running the bench ----
Given('the revision {string} holds the files:', (w, rev: string, t: DataTable) => {
  const files = (bench(w).trees[rev] ??= {});
  for (const r of t.hashes()) files[r.path] = r.content;
});
Given('the revision {string} is a factory whose agent command is {string}', (w, rev: string, command: string) => {
  bench(w).trees[rev] = { '.agents/binding.yml': JSON.stringify({ ...w.adapterContext().binding, agent_command: command }), '.agents/skills/sdlc-build/SKILL.md': 'candidate' };
});
Given('the agent edits the files:', (w, t: DataTable) => { bench(w).agent.edits = t.hashes().map((r) => ({ path: r.path, content: r.content })); });
Given('the agent takes {int} minutes', (w, n: number) => { bench(w).agent.minutes = n; });
Given('the verify run number {int} fails', (w, n: number) => { bench(w).agent.failVerify.push(n); });
Given('the clock moves {int} minutes on every reading', (w, n: number) => { bench(w).agent.clockStep = n; });

const filesIn = (dir: string): Record<string, string> => Object.fromEntries(
  (readdirSync(dir, { recursive: true, withFileTypes: true }) as Dirent[]).filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath, d.name)).replaceAll('\\', '/')).sort().map((p) => [p, readFileSync(join(dir, p), 'utf8')]),
);

const fakeVcs = (b: B): Vcs => ({
  snapshot: async (rev: string) => {
    const workdir = mkdtempSync(join(tmpdir(), 'agentic-bench-'));
    b.made.push(workdir);
    for (const [p, s] of Object.entries(b.trees[rev])) { mkdirSync(dirname(join(workdir, p)), { recursive: true }); writeFileSync(join(workdir, p), s); }
    return {
      workdir,
      changed: async () => {
        const now = Object.keys(filesIn(workdir));
        return [...new Set([...now, ...Object.keys(b.trees[rev])])].filter((p) => !now.includes(p) || b.trees[rev][p] !== readFileSync(join(workdir, p), 'utf8'));
      },
      drop: async () => rmSync(workdir, { recursive: true, force: true }),
    };
  },
}) as unknown as Vcs;

const fakeExec = (b: B, tick: (ms: number) => void) => (_cmd: string, args: string[], o?: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
  const line = o?.env?.AGENTIC_SDLC_CMD ?? args.at(-1)!;
  const cwd = o!.cwd!;
  b.seen.commands.push(line);
  if (/^(fac-)?agent /.test(line)) {
    b.seen.agentDir = cwd;
    b.seen.agentTree = filesIn(cwd);
    const promptFile = /--prompt (['"])(.+?)\1/.exec(line)![2];
    b.seen.prompt = readFileSync(promptFile, 'utf8');
    const skill = /Follow the skill at (.+?), with/.exec(b.seen.prompt)?.[1];
    if (skill && existsSync(skill)) b.seen.skillText = readFileSync(skill, 'utf8');
    for (const e of b.agent.edits) {
      if (e.content === '<deleted>') rmSync(join(cwd, e.path));
      else { mkdirSync(dirname(join(cwd, e.path)), { recursive: true }); writeFileSync(join(cwd, e.path), e.content); }
    }
    tick(b.agent.minutes * 60000);
    return '';
  }
  assert.notEqual(cwd, b.seen.agentDir, 'verify ran in the agent tree');
  b.seen.verifies.push({ cwd, files: filesIn(cwd) });
  if (line === 'npm test' && b.agent.failVerify.includes(++b.seen.verifyRuns)) throw new Error('red');
  return '';
};

const runCases = async (w: World, n: number, opts: Record<string, string>) => {
  const b = bench(w);
  const cases: BenchCase[] = Array.from({ length: n }, (_, i) => ({ id: String(i + 1), ticket: String(i + 1), title: 'T', spec: 'do it', baseSha: 'base', headSha: 'head', oracleTests: ['test/a.test.ts'] }));
  let t = 0;
  const now = () => (b.agent.clockStep ? (t += b.agent.clockStep * 60000) : t);
  const binding = w.adapterContext().binding;
  try {
    const r = await runBench(cases, {
      model: opts.model ?? 'm1', root: w.root, binding, trials: opts.trials ? Number(opts.trials) : undefined, factory: opts.factory, dryRun: opts['dry-run'] === 'true',
      allowOverBudget: opts['allow-over-budget'] === 'true', scorerDir: opts['scorer-dir'] ? join(w.root, opts['scorer-dir']) : undefined,
    }, { exec: fakeExec(b, (ms) => { t += ms; }) as never, vcs: b.trees.base || b.trees.fac ? fakeVcs(b) : ({} as Vcs), now });
    done(w, r);
  } catch (e) { failed(w, e); }
};
When('the bench runs {int} cases', (w, n: number) => runCases(w, n, {}));
When('the bench runs {int} cases with the options:', (w, n: number, t: DataTable) => runCases(w, n, Object.fromEntries(t.raw().map((r) => [r[0], r[1]]))));

Then('the agent saw these files:', (w, t: DataTable) => assert.deepEqual(bench(w).seen.agentTree, Object.fromEntries(t.hashes().map((r) => [r.path, r.content]))));
Then('the agent was told to follow the build skill and to do {string}', (w, spec: string) => assert.match(bench(w).seen.prompt!, new RegExp(`build[\\\\/]SKILL\\.md[\\s\\S]*${spec}`)));
Then('the agent followed the skill whose text is {string}', (w, text: string) => assert.equal(bench(w).seen.skillText, text));
Then('the agent command matches {string}', (w, re: string) => assert.match(bench(w).seen.commands[0], new RegExp(re)));
Then('the commands after the agent are:', (w, t: DataTable) => assert.deepEqual(bench(w).seen.commands.slice(1, 1 + t.raw().length), t.raw().map((r) => r[0])));
Then('verify run {int} saw these files:', (w, n: number, t: DataTable) => {
  const seen = bench(w).seen.verifies[n - 1].files;
  for (const r of t.hashes()) assert.equal(r.content === '<absent>' ? undefined : r.content, seen[r.path], r.path);
});
Then('no tree was made inside the project', (w) => assert.ok(!bench(w).made.some((d) => d.startsWith(w.root))));
Then('every tree was deleted', (w) => assert.deepEqual(bench(w).made.filter((d) => existsSync(d)), []));
Then('the bench made {int} trees', (w, n: number) => assert.equal(bench(w).made.length, n));
Then('the bench started no command', (w) => assert.deepEqual([bench(w).seen.commands, bench(w).made], [[], []]));
Then('the project file {string} matches {string}', (w, file: string, re: string) => assert.match(w.read(file), new RegExp(re)));

// ---- the agent command ----
When('the agent command is built for the executor {string}', (w, executor: string) => {
  const binding = w.adapterContext().binding;
  try { w.state.command = agentCommand(resolveExecutor(executor, binding), binding, { model: 'm', ticket: '7', prompt_file: 'p.md', workdir: 'w' }); done(w, w.state.command); } catch (e) { failed(w, e); }
});
Then('the agent command is {string}', (w, expected: string) => {
  const vars: Record<string, string> = { model: 'm', ticket: '7', prompt_file: 'p.md', workdir: 'w', skill: 'build', max_turns: '40', max_minutes: '' };
  assert.equal(w.state.command, expected.replace(/<(\w+)>/g, (_m, k: string) => quote(vars[k])));
});
/** A table cell cannot hold these characters: <LF> a line feed, <NUL> a NUL, <BS> a backslash, <DQ> a double quote. */
const chars = (s: string) => s.replaceAll('<LF>', '\n').replaceAll('<NUL>', '\0').replaceAll('<BS>', '\\').replaceAll('<DQ>', '"');
When('{string} is quoted for a {word} shell', (w, value: string, shellName: string) => {
  try { w.state.quoted = quote(chars(value), shellName === 'windows'); done(w, w.state.quoted); } catch (e) { failed(w, e); }
});
Then('the quoted value is {string}', (w, expected: string) => assert.equal(w.state.quoted, chars(expected)));
When('a command that prints its arguments is run with the values {string} and {string}', (w, a: string, b: string) => {
  done(w, JSON.parse(shell(exec, `node -e "console.log(JSON.stringify(process.argv.slice(1)))" ${fill('{a} {b}', { a, b })}`, tmpdir())));
});

// ---- results: files the CLI compares and reports ----
const resultFile = (w: World, file: string) => JSON.parse(w.read(file));
Given('a bench result {string} of the model {string} that ran:', (w, file: string, model: string, t: DataTable) => {
  const cases = t.hashes().map((r) => ({ id: r.id, ...(r.trial ? { trial: Number(r.trial) } : {}), pass: r.pass === 'true', minutes: Number(r.minutes), ...(r.skipped ? { skipped: r.skipped } : {}) }));
  w.state.resultFile = file;
  w.write(file, JSON.stringify({ model, executor: 'harness', at: '', passRate: 0, minutes: 0, cases }));
});
const amend = (w: World, patch: Record<string, unknown>) => w.write(w.state.resultFile, JSON.stringify({ ...resultFile(w, w.state.resultFile), ...patch }));
Given('that result is of the suite {string}', (w, suite: string) => amend(w, { suite }));
Given('that result is of the executor {string} of the kind {string}', (w, executor: string, kind: string) => amend(w, { executor, executorKind: kind }));

When('the Wilson lower bound of {int} passes in {int} trials is computed', (w, pass: number, n: number) => done(w, { lower: wilsonLower(pass, n) }));

// ---- the step the bench replays ----
Given('an installed pack whose skills are named with the prefix {string}', (w, prefix: string) => {
  w.write(`.agents/skills/${prefix}build/SKILL.md`, `---\nname: ${prefix}build\ndescription: d\nmetadata:\n  tier: deep\n---\nbody\n`);
});
When('the file of the bench step is looked up in the project', (w) => done(w, { step: BENCH_STEP, file: relative(w.root, benchStepFile(w.root)).replaceAll('\\', '/') }));

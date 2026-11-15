import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cli, probeFailure, cloudBoard, deliveryWorkflow, implementerToken, selfHostedRunner, trunkProtection, unpinnedActions, validate } from '../src/install.ts';
import { parse } from 'yaml';
import { fakeCtx } from './helpers.ts';
import { DEFAULTS, bindWorkflow, isInstallable, releasedHash, sha, shippedHashes } from '../src/pristine.ts';

const w = (p: string, s: string) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };

function fixture() {
  const pkg = mkdtempSync(join(tmpdir(), 'pkg-'));
  w(join(pkg, 'package.json'), '{"name":"agentic-sdlc","version":"9.9.9"}');
  w(join(pkg, 'skills/sdlc/SKILL.md'), '---\nname: sdlc\ndescription: d\nmetadata:\n  tier: fast\n---\n');
  w(join(pkg, 'templates/binding.yml'), '# doc\nversion: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git }\nmodels: { fast: claude-haiku-4-5, balanced: your-balanced-model-id }\n');
  w(join(pkg, 'templates/gates/github/gate.yml'), 'on: push\n');
  w(join(pkg, 'templates/gates/hooks/pre-push'), '#!/bin/sh\n');
  for (const n of ['cycle-prompt.md', 'review-prompt.md']) w(join(pkg, 'templates/runner', n), n);
  cpSync(join(import.meta.dirname, '../templates/mcp'), join(pkg, 'templates/mcp'), { recursive: true });
  cpSync(join(import.meta.dirname, '../templates/gates/github/ruleset.trunk.json'), join(pkg, 'templates/gates/github/ruleset.trunk.json'));
  process.env.AGENTIC_SDLC_PACKAGE = pkg;
  return mkdtempSync(join(tmpdir(), 'proj-'));
}
const quiet = async <T>(f: () => Promise<T>) => {
  const l = console.log, e = console.error;
  console.log = console.error = () => {};
  try { return await f(); } finally { console.log = l; console.error = e; }
};

test('init writes skills, binding, gates, pointer; second run is idempotent and keeps edits', async () => {
  const root = fixture();
  w(join(root, 'AGENTS.md'), '# Mine\n');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--vcs', 'hg'], ctx)), 1, 'v2 is git only');
  assert.equal(await quiet(() => cli(['init', '--forge', 'swarm'], ctx)), 1);
  assert.equal(await quiet(() => cli(['init', '--board', 'jira', '--harness', 'claude'], ctx)), 0);
  assert.ok(existsSync(join(root, '.agents/skills/sdlc/SKILL.md')));
  assert.ok(!existsSync(join(root, '.claude/skills')), 'Claude Code gets the skills from the plugin');
  assert.ok(existsSync(join(root, '.github/workflows/gate.yml')));
  assert.ok(existsSync(join(root, '.agents/cycle-prompt.md')) && existsSync(join(root, '.agents/review-prompt.md')));
  assert.ok(existsSync(join(root, '.agents/hooks/pre-push')));
  if (process.platform !== 'win32') assert.ok(statSync(join(root, '.agents/hooks/pre-push')).mode & 0o100, 'hook is executable');
  const binding = readFileSync(join(root, '.agents/binding.yml'), 'utf8');
  assert.match(binding, /adapter: jira/);
  writeFileSync(join(root, '.agents/binding.yml'), binding + '# edited\n');
  const agents1 = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  await quiet(() => cli(['init'], ctx));
  assert.match(readFileSync(join(root, '.agents/binding.yml'), 'utf8'), /# edited/);
  const agents2 = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.equal(agents1, agents2);
  assert.equal(agents2.match(/agentic-sdlc:start/g)!.length, 1);
  assert.match(agents2, /^# Mine/);
  assert.match(agents2, /\/agentic-sdlc:sdlc/);
});

test('init keeps an edited skill file unless --force, and updates an unedited one', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  const { ctx } = fakeCtx(root, {}, () => ({}));
  w(join(pkg, 'skills/shape/SKILL.md'), 'v1');
  await quiet(() => cli(['init'], ctx));
  const sdlc = join(root, '.agents/skills/sdlc/SKILL.md'), shape = join(root, '.agents/skills/shape/SKILL.md');
  writeFileSync(sdlc, 'mine');
  w(join(pkg, 'skills/shape/SKILL.md'), 'v2');
  const lines: string[] = [];
  const l = console.log; console.log = (m: string) => { lines.push(m); };
  try { await cli(['init'], ctx); } finally { console.log = l; }
  assert.equal(readFileSync(sdlc, 'utf8'), 'mine');
  assert.equal(readFileSync(shape, 'utf8'), 'v2');
  assert.ok(lines.some((m) => m.startsWith('kept .agents/skills/sdlc/SKILL.md')), lines.join('|'));
  await quiet(() => cli(['init', '--force'], ctx));
  assert.notEqual(readFileSync(sdlc, 'utf8'), 'mine');
});

test('init without package templates fails clearly', async () => {
  const root = fixture();
  process.env.AGENTIC_SDLC_PACKAGE = join(root, 'nowhere');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init'], ctx)), 1);
});

test('validate warns on a top-level skill tier, fails when no tier exists or frontmatter is missing', async () => {
  const root = fixture();
  await quiet(() => cli(['init'], fakeCtx(root, {}, () => ({})).ctx));
  w(join(root, '.agents/skills/old/SKILL.md'), '---\nname: old\ndescription: d\ntier: deep\n---\n');
  w(join(root, '.agents/skills/none/SKILL.md'), '---\nname: none\ndescription: d\n---\n');
  const warnings: string[] = [];
  const problems = validate(root, warnings);
  assert.ok(warnings.some((m) => m.includes("skill old: top-level 'tier'")), warnings.join('|'));
  assert.ok(problems.some((m) => /skill none: .*metadata\.tier/.test(m)), problems.join('|'));
  assert.ok(!problems.some((m) => /skill (old|sdlc):/.test(m)), problems.join('|'));
  w(join(root, '.agents/skills/bad/SKILL.md'), 'no frontmatter');
  assert.equal(await quiet(() => cli(['validate'], fakeCtx(root, {}, () => ({})).ctx)), 1);
});

test('init --profile organization writes two identities, traces and a container sandbox; the ruleset asks for an approving review', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--profile', 'organization'], ctx)), 0);
  const b = parse(readFileSync(join(root, '.agents/binding.yml'), 'utf8'));
  assert.equal(b.profile, 'organization');
  assert.equal(b.executors.default.sandbox, 'container');
  assert.equal(b.traces.uri, '.agents/runtime/traces/{run_id}.jsonl');
  assert.ok(b.forge.review_identity);
  assert.deepEqual([b.forge.options.token_env, b.forge.options.review_token_env], ['AGENTIC_FORGE_TOKEN', 'AGENTIC_REVIEW_TOKEN']);
  const pr = JSON.parse(readFileSync(join(root, '.github/rulesets/trunk.json'), 'utf8')).rules.find((r: any) => r.type === 'pull_request');
  assert.equal(pr.parameters.required_approving_review_count, 1);
  assert.equal(await quiet(() => cli(['init', '--profile', 'bogus', '--force'], ctx)), 1);
});

test('init --profile individual and individual-api: one identity; the ruleset asks for no approving review and pins every check to Actions', async () => {
  for (const profile of ['individual', 'individual-api']) {
    const root = fixture();
    const { ctx } = fakeCtx(root, {}, () => ({}));
    assert.equal(await quiet(() => cli(['init', '--profile', profile], ctx)), 0);
    const b = parse(readFileSync(join(root, '.agents/binding.yml'), 'utf8'));
    assert.equal(b.profile, profile);
    assert.ok(!b.forge.review_identity);
    assert.equal(b.forge.options?.review_token_env, undefined);
    const pr = JSON.parse(readFileSync(join(root, '.github/rulesets/trunk.json'), 'utf8')).rules.find((r: any) => r.type === 'pull_request');
    assert.equal(pr.parameters.required_approving_review_count, 0);
    assert.equal(pr.parameters.require_last_push_approval, false);
    const checks = JSON.parse(readFileSync(join(root, '.github/rulesets/trunk.json'), 'utf8')).rules.find((r: any) => r.type === 'required_status_checks').parameters.required_status_checks;
    assert.ok(checks.every((c: any) => c.integration_id === 15368), 'one identity: CI posts every required check');
  }
});

test('validate prints warn: lines and exits 0 when only warnings exist', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const { stringify } = await import('yaml');
  const good = {
    version: 2, profile: 'individual', owners: { product: 'a', factory: 'b', bots: ['bot'] },
    board: { adapter: 'local', options: {}, statuses: ['Ideas', 'Signals', 'Backlog', 'Ready', 'In progress', 'In review', 'Done', 'Cancelled'] },
    forge: { adapter: 'github' }, vcs: { adapter: 'git', change_pattern: 'ticket/<ticket>', trunk: 'main', release_prefix: 'release/', factory_change_pattern: 'factory/<name>', tag_prefix: 'v' },
    models: { fast: 'f', balanced: 'b', deep: 'd' }, commands: {}, paths: { factory: ['.agents/**'] }, sizes: ['S', 'M'], ready_size_limit: 'M', fast_lane_max_size: 'S',
    priorities: [], p0_setters: [], max_subissue_depth: 1, spec_marker: 'spec.md', stall_minutes: 60, parallel_agents: 1,
    cycle: {}, heartbeat: { ticket: '1' }, learning: {}, product: { environments: ['staging', 'production'], proofs: ['test'] },
    executors: { default: { kind: 'harness' }, bot: { kind: 'assign', user: 'coding-bot' } },
  };
  writeFileSync(join(root, '.agents/binding.yml'), stringify(good));
  const errs: string[] = [];
  const e = console.error, l = console.log;
  console.error = (m: string) => { errs.push(m); }; console.log = () => {};
  let code: number;
  try { code = await cli(['validate'], ctx); } finally { console.error = e; console.log = l; }
  assert.deepEqual(errs.filter((m) => m.startsWith('problem:')), []);
  assert.ok(errs.some((m) => m.startsWith('warn: executors.bot')), errs.join('|'));
  assert.equal(code, 0);
});

test('init --harness claude: tier subagents from binding.models, @AGENTS.md import once, no skills copy', async () => {
  const root = fixture();
  w(join(root, 'CLAUDE.md'), '# Mine\n');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--harness', 'claude'], ctx)), 0);
  await quiet(() => cli(['init', '--harness', 'claude'], ctx));
  assert.match(readFileSync(join(root, '.claude/agents/sdlc-fast.md'), 'utf8'), /^model: claude-haiku-4-5$/m);
  assert.match(readFileSync(join(root, '.claude/agents/sdlc-balanced.md'), 'utf8'), /^model: inherit$/m);
  assert.match(readFileSync(join(root, '.claude/agents/sdlc-deep.md'), 'utf8'), /^name: sdlc-deep$/m);
  const md = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
  assert.match(md, /^# Mine/);
  assert.equal(md.match(/^@AGENTS\.md$/gm)!.length, 1);
  assert.ok(!existsSync(join(root, '.claude/skills')));
  const fresh = fixture();
  await quiet(() => cli(['init', '--harness', 'claude'], fakeCtx(fresh, {}, () => ({})).ctx));
  assert.equal(readFileSync(join(fresh, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
});

test('init --harness claude writes no .mcp.json (the plugin serves MCP); --no-plugin merges it and pins npx -y to the Git tag', async () => {
  const plain = fixture();
  await quiet(() => cli(['init', '--harness', 'claude'], fakeCtx(plain, {}, () => ({})).ctx));
  assert.ok(!existsSync(join(plain, '.mcp.json')));
  const root = fixture();
  w(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { type: 'http', url: 'x' } } }));
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--harness', 'claude', '--no-plugin'], ctx)), 0);
  assert.ok(existsSync(join(root, '.claude/skills/sdlc/SKILL.md')));
  const m = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers;
  assert.equal(m.other.url, 'x');
  assert.deepEqual(m['agentic-sdlc'].args, ['-y', '--allow-git=root', 'github:dmitriywind/agentic-sdlc#v9.9.9', 'mcp']);
  assert.equal(m['agentic-sdlc'].type, 'stdio');
});

test('init reads the repo from a GitHub origin, and --no-plugin prints no plugin install hint', async () => {
  const root = fixture();
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/shop.git'], { cwd: root });
  const out: string[] = [];
  const l = console.log, e = console.error;
  console.log = console.error = (s: unknown) => { out.push(String(s)); };
  try { await cli(['init', '--harness', 'claude', '--no-plugin', '--board', 'github-issues'], fakeCtx(root, {}, () => ({})).ctx); }
  finally { console.log = l; console.error = e; }
  const binding = readFileSync(join(root, '.agents/binding.yml'), 'utf8');
  assert.match(binding, /board:[\s\S]*repo: acme\/shop[\s\S]*forge:[\s\S]*repo: acme\/shop/);
  assert.doesNotMatch(out.join('\n'), /install the Claude Code plugin/);
});

test('init pins the CLI as a devDependency when package.json exists, and the MCP entry follows', async () => {
  const root = fixture();
  w(join(root, 'package.json'), '{\n    "name": "p"\n}\n');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--harness', 'cursor'], ctx));
  const pj = readFileSync(join(root, 'package.json'), 'utf8');
  assert.equal(JSON.parse(pj).devDependencies['agentic-sdlc'], 'github:dmitriywind/agentic-sdlc#v9.9.9');
  assert.match(pj, /^ {4}"name"/m, 'keeps the indent');
  assert.equal(readFileSync(join(root, '.npmrc'), 'utf8'), 'allow-git=root\n', 'npm 12 refuses git dependencies by default');
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')).mcpServers['agentic-sdlc'].args, ['--no-install', 'agentic-sdlc', 'mcp']);
});

test('init keeps an existing agentic-sdlc MCP entry unless --force', async () => {
  const root = fixture();
  w(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { 'agentic-sdlc': { command: 'mine' } } }));
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--harness', 'claude', '--no-plugin'], ctx));
  const read = () => JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers['agentic-sdlc'];
  assert.equal(read().command, 'mine');
  await quiet(() => cli(['init', '--harness', 'claude', '--no-plugin', '--force'], ctx));
  assert.notEqual(read().command, 'mine');
});

test('init --harness codex appends the TOML table once and keeps one the adopter wrote', async () => {
  const root = fixture();
  w(join(root, '.codex/config.toml'), 'model = "x"\n');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--harness', 'codex'], ctx));
  await quiet(() => cli(['init', '--harness', 'codex'], ctx));
  const t = readFileSync(join(root, '.codex/config.toml'), 'utf8');
  assert.match(t, /^model = "x"/);
  assert.equal(t.split("[mcp_servers.agentic-sdlc]").length - 1, 1);
  assert.ok(t.includes('args = ["-y","--allow-git=root","github:dmitriywind/agentic-sdlc#v9.9.9","mcp"]'), t);
  assert.ok(!existsSync(join(root, '.claude/skills')));
  const own = fixture();
  const mine = 'x = 1\n[mcp_servers."agentic-sdlc"]\ncommand = "mine"\n';
  w(join(own, '.codex/config.toml'), mine);
  await quiet(() => cli(['init', '--harness', 'codex'], fakeCtx(own, {}, () => ({})).ctx));
  assert.equal(readFileSync(join(own, '.codex/config.toml'), 'utf8'), mine);
});

test('init --harness cursor writes .cursor/mcp.json; unknown harness fails', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--harness', 'cursor'], ctx)), 0);
  assert.ok(JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')).mcpServers['agentic-sdlc']);
  assert.equal(await quiet(() => cli(['init', '--harness', 'nope'], ctx)), 1);
});

test('doctor: unpinned required checks warn; no repo gets a reminder', () => {
  const b = { forge: { adapter: 'github', options: { repo: 'o/r' } }, vcs: { trunk: 'main' } };
  const rules = [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'Required', integration_id: 15368 }, { context: 'review' }] } }];
  const out = trunkProtection(b, { exec: () => JSON.stringify(rules) });
  assert.match(out[0], /^ok/);
  assert.match(out[1], /not pinned.*: review;/);
  assert.ok(trunkProtection({ ...b, forge: { adapter: 'github', options: {} } }, {}).some((m) => m.startsWith('warn: pin')));
});

test('doctor: a trunk with no enforced ruleset or branch protection warns that no gate blocks a merge', () => {
  const b = { forge: { adapter: 'github', options: { repo: 'o/r' } }, vcs: { trunk: 'main' } };
  const free = trunkProtection(b, { exec: () => { throw new Error('Command failed: gh api\ngh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)'); } });
  assert.deepEqual(free, [free[0]]);
  assert.match(free[0], /^warn: trunk protection: main has no enforced ruleset or branch protection, so no gate blocks a merge/);
  const at = (prot: string) => ({ exec: (_c: string, a: string[]) => a[1].includes('/rules/') ? '[]' : prot });
  assert.match(trunkProtection(b, at('false'))[0], /no gate blocks a merge/);
  assert.match(trunkProtection(b, at('true\n'))[0], /classic branch protection is on/);
  assert.match(trunkProtection(b, { exec: () => { throw new Error('network down'); } })[0], /check manually/);
  assert.match(trunkProtection(b, { exec: () => { throw new Error('gh: Resource not accessible by integration (HTTP 403)'); } })[0], /check manually/);
});

test('plugin guard hook blocks trunk pushes and forge approve outside the review role', () => {
  const hook = join(import.meta.dirname, '..', 'hooks', 'guard.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  w(join(dir, '.agents/binding.yml'), 'vcs:\n  adapter: git\n  trunk: trunk\n');
  const run = (command: string, env: Record<string, string> = {}, tool = 'Bash') => {
    const input = JSON.stringify({ tool_name: tool, tool_input: { command }, cwd: dir });
    try { execFileSync('node', [hook], { input, env: { ...process.env, AGENTIC_SDLC_ROLE: '', ...env }, stdio: 'pipe' }); return 0; }
    catch (e: any) { return e.status; }
  };
  assert.equal(run('git push origin trunk'), 2);
  assert.equal(run('git add . && git push -u origin HEAD:refs/heads/trunk'), 2);
  assert.equal(run('git push origin feature/T-1-x'), 0);
  assert.equal(run('npx agentic-sdlc forge approve 12'), 2);
  assert.equal(run('npx agentic-sdlc forge approve 12', { AGENTIC_SDLC_ROLE: 'review' }), 0);
  assert.equal(run('npx agentic-sdlc forge view 12'), 0);
  assert.equal(run('', {}, 'mcp__plugin_agentic-sdlc_agentic-sdlc__forge_approve'), 2);
  // Bypasses found in review: global options, a background &, a nested shell, the bundled bin.
  assert.equal(run('git -C . push origin trunk'), 2);
  assert.equal(run('git push origin trunk&'), 2);
  assert.equal(run("bash -c 'git push origin trunk'"), 2);
  assert.equal(run('node node_modules/agentic-sdlc/dist/bin.js forge approve 3'), 2);
  assert.equal(run('git -c core.x=1 push origin feature/T-1-x'), 0);
});

test('vcs push refuses the trunk and a detached HEAD', async () => {
  const { git } = await import('../src/vcs/git.ts');
  const mk = (ref: string) => git({ root: '.', binding: { vcs: { trunk: 'main', release_prefix: 'release/' } }, exec: (_c: string, a: string[]) => (a[0] === 'rev-parse' ? ref : '') } as any);
  await assert.rejects(mk('main').push(), /trunk 'main'/);
  await assert.rejects(mk('HEAD').push(), /detached HEAD/);
  await mk('T-1-x').push();
});

test('doctor: the delivery workflow must name the trunk and release line', () => {
  const root = mkdtempSync(join(tmpdir(), 'dw-'));
  w(join(root, '.github/workflows/agentic-sdlc-delivery.yml'), `on:
  push:
    branches: [main, "release/**"]
env:
  TRUNK: main
  RELEASE_PREFIX: release/
  DELIVERY: release-line
`);
  const b = (trunk: string) => ({ forge: { adapter: 'github' }, vcs: { trunk, release_prefix: 'release/' } });
  assert.match(deliveryWorkflow(b('master'), root)!, /^fail delivery workflow:.*trunk master/);
  assert.match(deliveryWorkflow(b('main'), root)!, /^ok   delivery workflow: names trunk main/);
  const wf = (trunk: string) => `on:
  push:
    branches: [main, "release/**"]
env:
  TRUNK: ${trunk}
  RELEASE_PREFIX: release/
  DELIVERY: release-line
`;
  w(join(root, '.github/workflows/agentic-sdlc-delivery.yml'), wf('trunk'));
  assert.match(deliveryWorkflow(b('main'), root)!, /^fail delivery workflow: env.TRUNK/);
  w(join(root, '.github/workflows/agentic-sdlc-delivery.yml'), wf('main'));
  assert.match(deliveryWorkflow(b('main'), root)!, /^ok   delivery workflow/);
});

test('init on github installs the release-lines ruleset', async () => {
  const root = fixture();
  w(join(process.env.AGENTIC_SDLC_PACKAGE!, 'templates/gates/github/ruleset.release.json'), '{}');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--forge', 'github'], ctx)), 0);
  assert.ok(existsSync(join(root, '.github/rulesets/release.json')));
});

test('init writes no release workflow or release ruleset when the binding delivers continuously', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  w(join(pkg, 'templates/gates/github/ruleset.release.json'), '{}');
  w(join(pkg, 'templates/gates/github/agentic-sdlc-release.yml'), 'on: workflow_dispatch\n');
  w(join(root, '.agents/binding.yml'), 'version: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git }\nproduct: { delivery: continuous }\n');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--forge', 'github'], ctx));
  assert.ok(existsSync(join(root, '.github/workflows/gate.yml')));
  assert.ok(!existsSync(join(root, '.github/workflows/agentic-sdlc-release.yml')));
  assert.ok(!existsSync(join(root, '.github/rulesets/release.json')));
});

test('doctor: env.DELIVERY must match product.delivery; continuous needs no release prefix', () => {
  const root = mkdtempSync(join(tmpdir(), 'dwd-'));
  w(join(root, '.github/workflows/agentic-sdlc-delivery.yml'), 'on:\n  push:\n    branches: [main]\nenv:\n  TRUNK: main\n  DELIVERY: continuous\n');
  const b = (delivery?: string) => ({ forge: { adapter: 'github' }, vcs: { trunk: 'main' }, product: { delivery } });
  assert.match(deliveryWorkflow(b('continuous'), root)!, /^ok   delivery workflow/);
  assert.match(deliveryWorkflow(b(), root)!, /^fail delivery workflow: env\.DELIVERY/);
});

test('init --board local creates the heartbeat ticket off every route and sets heartbeat.ticket', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--board', 'local'], ctx)), 0);
  const db = JSON.parse(readFileSync(join(root, '.agents/board.json'), 'utf8'));
  assert.deepEqual(db.items.map((i: any) => [i.id, i.title, i.status]), [['1', 'Heartbeat', 'Cancelled']]);
  assert.match(readFileSync(join(root, '.agents/binding.yml'), 'utf8'), /ticket: "?1"?/);
});

test('doctor: a classic implementer token with repo scope warns; a fine-grained one is quiet', () => {
  const b = { forge: { adapter: 'github', options: { token_env: 'IMPL' } } };
  const seen: any[] = [];
  const exec = (scopes?: string) => (_c: string, a: string[], o: any = {}) => { seen.push([a, o.env?.GH_TOKEN]); return `HTTP/2.0 200 OK\n${scopes !== undefined ? `X-Oauth-Scopes: ${scopes}\n` : ''}\n{}`; };
  assert.match(implementerToken(b, { env: { IMPL: 'x' }, exec: exec('read:org, repo, workflow') })!, /^warn: the implementer token \(IMPL\) has scope repo/);
  assert.deepEqual(seen[0], [['api', '-i', 'user'], 'x']);
  assert.match(implementerToken(b, { env: {}, exec: exec('repo:status') })!, /repo:status/);
  assert.equal(implementerToken(b, { env: {}, exec: exec('read:org') }), undefined);
  assert.equal(implementerToken(b, { env: {}, exec: exec() }), undefined);
  assert.equal(implementerToken(b, { env: {}, exec: () => { throw new Error('401'); } }), undefined);
});

test('doctor: a self-hosted runner fails on a public repo and warns when CR code and secrets share it', () => {
  const b = { forge: { adapter: 'github', options: { repo: 'o/r' } } };
  const at = (vars: Record<string, string>, visibility = 'private') => ({ exec: (_c: string, a: string[]) =>
    a[0] === 'variable' ? JSON.stringify(Object.entries(vars).map(([name, value]) => ({ name, value }))) : `${visibility}\n` });
  assert.equal(selfHostedRunner(b, at({})), undefined);
  assert.equal(selfHostedRunner(b, at({ AGENTIC_RUNS_ON: '"ubuntu-latest"' })), undefined);
  assert.match(selfHostedRunner(b, at({ AGENTIC_RUNS_ON: '["self-hosted"]' }, 'public'))!, /^fail runner: .*public repo/);
  assert.match(selfHostedRunner(b, at({ AGENTIC_RUNS_ON: '["self-hosted"]' }))!, /^warn: runner: CR code and the secret jobs share/);
  assert.match(selfHostedRunner(b, at({ AGENTIC_RUNS_ON: '["self-hosted","code"]', AGENTIC_RUNS_ON_TRUSTED: '["self-hosted","trusted"]' }))!, /^ok   runner: self-hosted/);
  assert.equal(selfHostedRunner(b, { exec: () => { throw new Error('403'); } }), undefined);
});

test('doctor: a Claude cloud session fails a GitHub Projects board and names the boards it can reach', () => {
  assert.match(cloudBoard({ board: { adapter: 'github' } }, { CLAUDE_CODE_REMOTE: 'true' })!, /^fail board: .*cannot reach GitHub Projects.*github-issues, jira or linear.*GitHub Actions/);
  assert.equal(cloudBoard({ board: { adapter: 'github' } }, {}), undefined);
  assert.equal(cloudBoard({ board: { adapter: 'jira' } }, { CLAUDE_CODE_REMOTE: 'true' }), undefined);
});

test('init refuses an unknown board, an unknown flag and a package.json that is not JSON, before it writes anything', async () => {
  for (const args of [['--board', 'bogus'], ['--forse']]) {
    const root = fixture();
    assert.equal(await quiet(() => cli(['init', ...args], fakeCtx(root, {}, () => ({})).ctx)), 1);
    assert.ok(!existsSync(join(root, '.agents')));
  }
  const root = fixture();
  w(join(root, 'package.json'), '{ // comment\n}');
  const errs: string[] = [];
  const e = console.error; console.error = (s: string) => errs.push(s);
  try { assert.equal(await cli(['init', '--board', 'local'], fakeCtx(root, {}, () => ({})).ctx), 1); } finally { console.error = e; }
  assert.match(errs.join('\n'), /package\.json is not valid JSON/);
  assert.ok(!existsSync(join(root, '.agents')));
});

test('init moves its own older CLI pin to the package version and keeps a pin the project chose', async () => {
  const run = async (have: string) => {
    const root = fixture();
    w(join(root, 'package.json'), JSON.stringify({ devDependencies: { 'agentic-sdlc': have } }));
    await quiet(() => cli(['init', '--board', 'local'], fakeCtx(root, {}, () => ({})).ctx));
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies['agentic-sdlc'];
  };
  assert.equal(await run('github:dmitriywind/agentic-sdlc#v0.0.1'), 'github:dmitriywind/agentic-sdlc#v9.9.9');
  const sha = 'github:dmitriywind/agentic-sdlc#' + 'a'.repeat(40);
  assert.equal(await run(sha), sha);
  assert.equal(await run('file:../fork'), 'file:../fork');
});

test('doctor: the forge probe reads check data, so a token without checks read scope fails', async () => {
  const root = fixture();
  const row = { number: 1, title: 't', html_url: 'u', state: 'open', body: '', head: { ref: 'x', sha: 's1' }, base: { ref: 'main', sha: 'b1' } };
  const seen: string[] = [];
  const answer = (c: string) => {
    seen.push(c);
    if (/check-runs/.test(c)) throw new Error('HTTP 403: Resource not accessible by personal access token');
    return /pulls\?/.test(c) ? [row] : /pulls\/1/.test(c) ? row : '';
  };
  const { ctx } = fakeCtx(root, {}, answer);
  await quiet(() => cli(['init', '--board', 'local'], ctx));
  const bf = join(root, '.agents/binding.yml');
  writeFileSync(bf, readFileSync(join(import.meta.dirname, '../templates/binding.yml'), 'utf8').replace(/^(\s*adapter:\s*)github(\s*#.*)?$/m, '$1local').replace(/^(\s*ticket:\s*)""/m, '$1"1"'));
  const out: string[] = [];
  const l = console.log, e = console.error; console.log = (m: string) => { out.push(m); }; console.error = (m: string) => { out.push(m); };
  let code: number;
  try { code = await cli(['doctor'], ctx); } finally { console.log = l; console.error = e; }
  assert.ok(seen.some((c) => /check-runs/.test(c)), out.join('\n'));
  assert.equal(code, 1);
  assert.ok(out.some((m) => /^fail forge\.list:/.test(m)), out.join('\n'));
});

test('doctor: a failed probe shows the command\'s first stderr line and hides the value of every env var the binding names', () => {
  const line = probeFailure('Command failed: gh api repos/acme/shop/pulls\nHTTP 403: bad credentials hunter2hunter2\nmore', { GH_PAT_X: 'hunter2hunter2' }, { forge: { options: { token_env: 'GH_PAT_X' } } });
  assert.equal(line, 'Command failed: gh api repos/acme/shop/pulls (HTTP 403: bad credentials ***)');
  assert.equal(probeFailure('plain reason\nsecond line', {}, {}), 'plain reason');
});

test('doctor: an installed workflow action not pinned to a commit SHA is a warning', () => {
  const root = mkdtempSync(join(tmpdir(), 'ua-'));
  assert.equal(unpinnedActions(root), undefined);
  const sha = 'a'.repeat(40);
  w(join(root, '.github/workflows/agentic-sdlc-verify.yml'), `jobs:\n  j:\n    steps:\n      - uses: actions/checkout@${sha} # v7.0.1\n`);
  w(join(root, '.github/workflows/ci.yml'), `jobs:\n  j:\n    steps:\n      - uses: actions/checkout@v4\n`);
  assert.equal(unpinnedActions(root), undefined);
  w(join(root, '.github/workflows/agentic-sdlc-cr.yml'), `jobs:\n  j:\n    steps:\n      - uses: actions/setup-node@v4\n`);
  assert.match(unpinnedActions(root)!, /^warn workflow actions:.*agentic-sdlc-cr\.yml: actions\/setup-node@v4/);
});

const capture = async (f: () => Promise<unknown>) => {
  const lines: string[] = [];
  const l = console.log, e = console.error;
  console.log = (m: string) => { lines.push(String(m)); }; console.error = () => {};
  try { await f(); } finally { console.log = l; console.error = e; }
  return lines;
};

test('init --upgrade updates an unedited workflow, keeps an edited one, and --force overwrites it but never the binding', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const gate = join(root, '.github/workflows/gate.yml'), binding = join(root, '.agents/binding.yml');
  w(join(pkg, 'templates/gates/github/gate.yml'), 'on: pull_request\n');
  const lines = await capture(() => cli(['init', '--upgrade'], ctx));
  assert.equal(readFileSync(gate, 'utf8'), 'on: pull_request\n', 'unedited: follows the package');
  assert.ok(lines.some((m) => m === 'updated .github/workflows/gate.yml'), lines.join('|'));
  assert.ok(lines.some((m) => m.startsWith('upgrade: run npm install')), lines.join('|'));
  writeFileSync(gate, 'mine\n');
  w(join(pkg, 'templates/gates/github/gate.yml'), 'on: schedule\n');
  writeFileSync(binding, readFileSync(binding, 'utf8') + '# mine\n');
  const kept = await capture(() => cli(['init', '--upgrade'], ctx));
  assert.equal(readFileSync(gate, 'utf8'), 'mine\n');
  assert.ok(kept.includes(`kept .github/workflows/gate.yml (differs from every released version; --force overwrites, see ${join(pkg, 'templates/gates/github/gate.yml')})`), kept.join('|'));
  assert.ok(kept.includes('install: nothing to update; 1 kept (differ from every released version)'), kept.join('|'));
  assert.ok(!kept.includes('updated AGENTS.md'), 'AGENTS.md did not change');
  assert.ok(!kept.some((m) => m.startsWith('upgrade:')), kept.join('|'));
  await quiet(() => cli(['init', '--force'], ctx));
  assert.equal(readFileSync(gate, 'utf8'), 'on: schedule\n');
  assert.match(readFileSync(binding, 'utf8'), /# mine/, '--force never rewrites the binding');
});

test('init --force on a local board creates no second heartbeat ticket', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--board', 'local'], ctx));
  await quiet(() => cli(['init', '--board', 'local', '--force'], ctx));
  assert.equal(JSON.parse(readFileSync(join(root, '.agents/board.json'), 'utf8')).items.length, 1);
});

test('init on an install from before the lock adopts an identical file and keeps a differing one', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const lock = join(root, '.agents/install.lock.json');
  writeFileSync(lock, '{}\n');
  writeFileSync(join(root, '.agents/cycle-prompt.md'), 'mine');
  const lines = await capture(() => cli(['init'], ctx));
  assert.equal(readFileSync(join(root, '.agents/cycle-prompt.md'), 'utf8'), 'mine');
  assert.ok(lines.some((m) => m.startsWith('kept .agents/cycle-prompt.md (differs from every released version')), lines.join('|'));
  const l = JSON.parse(readFileSync(lock, 'utf8'));
  assert.ok(l['.github/workflows/gate.yml'], 'the identical file is adopted into the lock');
  assert.equal(l['.agents/cycle-prompt.md'], undefined, 'the differing file is not');
});

test('init honours the skills lock of an install from before the single lock', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const skill = join(root, '.agents/skills/sdlc/SKILL.md');
  const old = JSON.parse(readFileSync(join(root, '.agents/install.lock.json'), 'utf8'));
  writeFileSync(join(root, '.agents/skills.lock.json'), JSON.stringify({ '.agents/skills/sdlc/SKILL.md': old['.agents/skills/sdlc/SKILL.md'] }));
  rmSync(join(root, '.agents/install.lock.json'));
  w(join(pkg, 'skills/sdlc/SKILL.md'), '---\nname: sdlc\ndescription: d2\nmetadata:\n  tier: fast\n---\n');
  await quiet(() => cli(['init'], ctx));
  assert.match(readFileSync(skill, 'utf8'), /description: d2/, 'unedited at the old lock hash: updated');
  assert.ok(existsSync(join(root, '.agents/install.lock.json')));
});

test('init reports a file the package no longer ships and deletes nothing', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  const { ctx } = fakeCtx(root, {}, () => ({}));
  w(join(pkg, 'templates/gates/github/old.yml'), 'x: 1\n');
  await quiet(() => cli(['init'], ctx));
  rmSync(join(pkg, 'templates/gates/github/old.yml'));
  const lines = await capture(() => cli(['init'], ctx));
  assert.ok(lines.includes('stale .github/workflows/old.yml: no longer part of the package'), lines.join('|'));
  assert.ok(existsSync(join(root, '.github/workflows/old.yml')));
});

test('init and validate list template binding keys that the binding does not set', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const tpl = readFileSync(join(pkg, 'templates/binding.yml'), 'utf8');
  w(join(pkg, 'templates/binding.yml'), tpl.replace('vcs: { adapter: git }', 'vcs: { adapter: git, trunk: main }') + 'slo: { target: 99 }\n');
  const want = 'info: binding keys in the template that this binding does not set: vcs.trunk, slo';
  assert.ok((await capture(() => cli(['init'], ctx))).includes(want));
  assert.ok((await capture(() => cli(['validate'], ctx))).includes(want));
  assert.doesNotMatch(readFileSync(join(root, '.agents/binding.yml'), 'utf8'), /slo|trunk: main/, 'the binding is not touched');
});

const known = (pkg: string, ...hashes: string[]) => w(join(pkg, 'templates/known-hashes.json'), JSON.stringify(hashes));

test('init upgrades a pre-lock file that equals a released version and keeps one that differs from every version', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  rmSync(join(root, '.agents/install.lock.json'));
  const gate = join(root, '.github/workflows/gate.yml'), cycle = join(root, '.agents/cycle-prompt.md');
  writeFileSync(gate, 'on: release\n');
  writeFileSync(cycle, 'mine');
  known(pkg, sha('on: release\n'));
  const lines = await capture(() => cli(['init', '--upgrade'], ctx));
  assert.equal(readFileSync(gate, 'utf8'), 'on: push\n');
  assert.ok(lines.includes('updated .github/workflows/gate.yml'), lines.join('|'));
  assert.equal(readFileSync(cycle, 'utf8'), 'mine');
  assert.ok(lines.includes(`kept .agents/cycle-prompt.md (differs from every released version; --force overwrites, see ${join(pkg, 'templates/runner/cycle-prompt.md')})`), lines.join('|'));
  const l = JSON.parse(readFileSync(join(root, '.agents/install.lock.json'), 'utf8'));
  assert.equal(l['.github/workflows/gate.yml'], sha('on: push\n'), 'the updated file is recorded');
});

test('init upgrades a file whose lock entry is stale when its content is a released version', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const lock = join(root, '.agents/install.lock.json'), gate = join(root, '.github/workflows/gate.yml');
  writeFileSync(lock, JSON.stringify({ ...JSON.parse(readFileSync(lock, 'utf8')), '.github/workflows/gate.yml': sha('older') }));
  writeFileSync(gate, 'on: release\n');
  known(pkg, sha('on: release\n'));
  await quiet(() => cli(['init', '--upgrade'], ctx));
  assert.equal(readFileSync(gate, 'utf8'), 'on: push\n');
  assert.equal(JSON.parse(readFileSync(lock, 'utf8'))['.github/workflows/gate.yml'], sha('on: push\n'));
});

test('init writes the delivery workflow values from the binding and upgrades a release that differs only in them', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  const real = readFileSync(join(import.meta.dirname, '../templates/gates/github/agentic-sdlc-delivery.yml'), 'utf8');
  const template = join(pkg, 'templates/gates/github/agentic-sdlc-delivery.yml');
  const older = real + '# older release\n';
  w(template, real);
  w(join(root, '.agents/binding.yml'), 'version: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git, trunk: master, release_prefix: rel/ }\nproduct: { delivery: continuous }\n');
  const wf = join(root, '.github/workflows/agentic-sdlc-delivery.yml');
  w(wf, bindWorkflow('agentic-sdlc-delivery.yml', older, { ...DEFAULTS, trunk: 'trunk', delivery: 'hand-edited' }));
  known(pkg, releasedHash('agentic-sdlc-delivery.yml', Buffer.from(older)));
  const { ctx } = fakeCtx(root, {}, () => ({}));
  const lines = await capture(() => cli(['init', '--upgrade'], ctx));
  assert.ok(lines.includes('updated .github/workflows/agentic-sdlc-delivery.yml'), lines.join('|'));
  const wfs = parse(readFileSync(wf, 'utf8'));
  assert.deepEqual([wfs.env.TRUNK, wfs.env.RELEASE_PREFIX, wfs.env.DELIVERY, wfs.on.push.branches], ['master', 'rel/', 'continuous', ['master']]);
  assert.ok(!readFileSync(wf, 'utf8').includes('# older release'), 'the file follows the package');
  assert.match(deliveryWorkflow({ forge: { adapter: 'github' }, vcs: { trunk: 'master', release_prefix: 'rel/' }, product: { delivery: 'continuous' } }, root)!, /^ok   delivery workflow/);
});

test('init writes the verify workflow commands from the binding', async () => {
  const root = fixture();
  const pkg = process.env.AGENTIC_SDLC_PACKAGE!;
  w(join(pkg, 'templates/gates/github/agentic-sdlc-verify.yml'), readFileSync(join(import.meta.dirname, '../templates/gates/github/agentic-sdlc-verify.yml'), 'utf8'));
  w(join(root, '.agents/binding.yml'), 'version: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git, trunk: main }\ncommands: { install: pnpm i --frozen-lockfile, verify: "pnpm test: all" }\n');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const text = readFileSync(join(root, '.github/workflows/agentic-sdlc-verify.yml'), 'utf8');
  assert.match(text, /run: pnpm i --frozen-lockfile +# set: the binding's commands\.install\n/);
  assert.match(text, /run: "pnpm test: all" +# set: the binding's commands\.verify\n/);
  assert.doesNotMatch(text, /run: npm (ci|test) /);
  assert.equal(releasedHash('agentic-sdlc-verify.yml', Buffer.from(text)), releasedHash('agentic-sdlc-verify.yml', readFileSync(join(import.meta.dirname, '../templates/gates/github/agentic-sdlc-verify.yml'))));
});

test('init leaves the mode of a kept pre-push hook alone', { skip: process.platform === 'win32' }, async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const hook = join(root, '.agents/hooks/pre-push');
  writeFileSync(hook, '#!/bin/sh\necho mine\n');
  execFileSync('chmod', ['644', hook]);
  const lines = await capture(() => cli(['init'], ctx));
  assert.ok(lines.some((m) => m.startsWith('kept .agents/hooks/pre-push')), lines.join('|'));
  assert.equal(statSync(hook).mode & 0o777, 0o644);
});

test('templates/known-hashes.json lists every installable file the package ships (run npm run hashes)', () => {
  const have = new Set(JSON.parse(readFileSync(join(import.meta.dirname, '../templates/known-hashes.json'), 'utf8')) as string[]);
  const root = join(import.meta.dirname, '..');
  const walk = (rel: string): string[] => readdirSync(join(root, rel)).flatMap((n) =>
    statSync(join(root, rel, n)).isDirectory() ? walk(`${rel}/${n}`) : [`${rel}/${n}`]);
  const missing = ['skills', 'scorers', 'templates'].flatMap(walk).filter(isInstallable)
    .filter((p) => shippedHashes(p, readFileSync(join(root, p))).some((h) => !have.has(h)));
  assert.deepEqual(missing, [], 'run npm run hashes before committing a change to these files');
});

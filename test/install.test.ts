import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cli, trunkProtection, validate } from '../src/install.ts';
import { fakeCtx } from './helpers.ts';

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

test('validate fails on a skill without frontmatter', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  w(join(root, '.agents/skills/bad/SKILL.md'), 'no frontmatter');
  assert.equal(await quiet(() => cli(['validate'], ctx)), 1);
});

test('validate warns on a top-level skill tier and fails when no tier exists', async () => {
  const root = fixture();
  await quiet(() => cli(['init'], fakeCtx(root, {}, () => ({})).ctx));
  w(join(root, '.agents/skills/old/SKILL.md'), '---\nname: old\ndescription: d\ntier: deep\n---\n');
  w(join(root, '.agents/skills/none/SKILL.md'), '---\nname: none\ndescription: d\n---\n');
  const warnings: string[] = [];
  const problems = validate(root, warnings);
  assert.ok(warnings.some((m) => m.includes("skill old: top-level 'tier'")), warnings.join('|'));
  assert.ok(problems.some((m) => /skill none: .*metadata\.tier/.test(m)), problems.join('|'));
  assert.ok(!problems.some((m) => /skill (old|sdlc):/.test(m)), problems.join('|'));
});

test('init --profile enterprise writes traces and container sandbox; warnings keep validate at 0', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--profile', 'enterprise'], ctx)), 0);
  const b = readFileSync(join(root, '.agents/binding.yml'), 'utf8');
  assert.match(b, /profile: enterprise/);
  assert.match(b, /sandbox: container/);
  assert.match(b, /\.agents\/runtime\/traces\/\{run_id\}\.jsonl/);
  assert.match(b, /human_sample: 5/);
  assert.equal(await quiet(() => cli(['init', '--profile', 'bogus', '--force'], ctx)), 1);
});

test('validate prints warn: lines and exits 0 when only warnings exist', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init'], ctx));
  const { stringify } = await import('yaml');
  const good = {
    version: 2, profile: 'individual', owners: { product: 'a', factory: 'b', bots: ['bot'] },
    board: { adapter: 'local', options: {}, statuses: ['Ideas', 'Signals', 'Backlog', 'Ready', 'In progress', 'In review', 'Done', 'Cancelled'] },
    forge: { adapter: 'github' }, vcs: { adapter: 'git', change_pattern: 'ticket/<ticket>' },
    models: { fast: 'f', balanced: 'b', deep: 'd' }, commands: {}, paths: {}, sizes: ['S', 'M'], ready_size_limit: 'M', fast_lane_max_size: 'S',
    priorities: [], p0_setters: [], max_subissue_depth: 1, spec_marker: 'spec.md', stall_minutes: 60, parallel_agents: 1,
    cycle: {}, heartbeat: {}, learning: {}, product: { environments: ['staging', 'production'], proofs: ['test'] },
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
  assert.deepEqual(m['agentic-sdlc'].args, ['-y', 'github:dmitriywind/agentic-sdlc#v9.9.9', 'mcp']);
  assert.equal(m['agentic-sdlc'].type, 'stdio');
});

test('init pins the CLI as a devDependency when package.json exists, and the MCP entry follows', async () => {
  const root = fixture();
  w(join(root, 'package.json'), '{\n    "name": "p"\n}\n');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--harness', 'cursor'], ctx));
  const pj = readFileSync(join(root, 'package.json'), 'utf8');
  assert.equal(JSON.parse(pj).devDependencies['agentic-sdlc'], 'github:dmitriywind/agentic-sdlc#v9.9.9');
  assert.match(pj, /^ {4}"name"/m, 'keeps the indent');
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

test('init --harness codex keeps a quoted TOML table', async () => {
  const root = fixture();
  const mine = 'x = 1\n[mcp_servers."agentic-sdlc"]\ncommand = "mine"\n';
  w(join(root, '.codex/config.toml'), mine);
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--harness', 'codex'], ctx));
  assert.equal(readFileSync(join(root, '.codex/config.toml'), 'utf8'), mine);
});

test('init --harness codex appends the TOML table once', async () => {
  const root = fixture();
  w(join(root, '.codex/config.toml'), 'model = "x"\n');
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--harness', 'codex'], ctx));
  await quiet(() => cli(['init', '--harness', 'codex'], ctx));
  const t = readFileSync(join(root, '.codex/config.toml'), 'utf8');
  assert.match(t, /^model = "x"/);
  assert.equal(t.split("[mcp_servers.agentic-sdlc]").length - 1, 1);
  assert.ok(t.includes('args = ["-y","github:dmitriywind/agentic-sdlc#v9.9.9","mcp"]'), t);
  assert.ok(!existsSync(join(root, '.claude/skills')));
});

test('init --harness cursor writes .cursor/mcp.json; unknown harness fails', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--harness', 'cursor'], ctx)), 0);
  assert.ok(JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')).mcpServers['agentic-sdlc']);
  assert.equal(await quiet(() => cli(['init', '--harness', 'nope'], ctx)), 1);
});

test('doctor: unpinned required checks warn; non-GitHub gets a reminder', () => {
  const b = { forge: { adapter: 'github', options: { repo: 'o/r' } }, vcs: { trunk: 'main' } };
  const rules = [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'Required', integration_id: 15368 }, { context: 'review' }] } }];
  const out = trunkProtection(b, { exec: () => JSON.stringify(rules) });
  assert.match(out[0], /^ok/);
  assert.match(out[1], /not pinned.*: review;/);
  assert.ok(trunkProtection({ ...b, forge: { adapter: 'gitlab', options: {} } }, {}).some((m) => m.startsWith('warn: pin')));
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

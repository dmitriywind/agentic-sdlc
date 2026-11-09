import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cpSync } from 'node:fs';
import { cli } from '../src/install.ts';
import { fakeCtx } from './helpers.ts';

const w = (p: string, s: string) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };

function fixture() {
  const pkg = mkdtempSync(join(tmpdir(), 'pkg-'));
  w(join(pkg, 'skills/sdlc/SKILL.md'), '---\nname: sdlc\ndescription: d\ntier: fast\n---\n');
  w(join(pkg, 'templates/binding.yml'), '# doc\nversion: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git }\n');
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
  assert.equal(await quiet(() => cli(['init', '--board', 'jira', '--vcs', 'hg', '--harness', 'claude'], ctx)), 0);
  assert.ok(existsSync(join(root, '.agents/skills/sdlc/SKILL.md')));
  assert.ok(existsSync(join(root, '.claude/skills/sdlc/SKILL.md')));
  assert.ok(existsSync(join(root, '.github/workflows/gate.yml')));
  assert.ok(existsSync(join(root, '.agents/cycle-prompt.md')) && existsSync(join(root, '.agents/review-prompt.md')));
  assert.ok(!existsSync(join(root, '.agents/hooks/pre-push')), 'hg gets only its own hook');
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
    cycle: {}, heartbeat: {}, learning: {}, product: { kind: 'web', environments: ['staging', 'production'], proofs: ['test'] },
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

test('init --harness claude writes .claude/skills and merges .mcp.json', async () => {
  const root = fixture();
  w(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { type: 'http', url: 'x' } } }));
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--harness', 'claude'], ctx)), 0);
  assert.ok(existsSync(join(root, '.claude/skills/sdlc/SKILL.md')));
  const m = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers;
  assert.equal(m.other.url, 'x');
  assert.deepEqual(m['agentic-sdlc'].args, ['--no-install', 'agentic-sdlc', 'mcp']);
  assert.equal(m['agentic-sdlc'].type, 'stdio');
});

test('init keeps an existing agentic-sdlc MCP entry unless --force', async () => {
  const root = fixture();
  w(join(root, '.mcp.json'), JSON.stringify({ mcpServers: { 'agentic-sdlc': { command: 'mine' } } }));
  const { ctx } = fakeCtx(root, {}, () => ({}));
  await quiet(() => cli(['init', '--harness', 'claude'], ctx));
  const read = () => JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8')).mcpServers['agentic-sdlc'];
  assert.equal(read().command, 'mine');
  await quiet(() => cli(['init', '--harness', 'claude', '--force'], ctx));
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
  assert.ok(!existsSync(join(root, '.claude/skills')));
});

test('init --harness cursor writes .cursor/mcp.json; unknown harness fails', async () => {
  const root = fixture();
  const { ctx } = fakeCtx(root, {}, () => ({}));
  assert.equal(await quiet(() => cli(['init', '--harness', 'cursor'], ctx)), 0);
  assert.ok(JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')).mcpServers['agentic-sdlc']);
  assert.equal(await quiet(() => cli(['init', '--harness', 'nope'], ctx)), 1);
});

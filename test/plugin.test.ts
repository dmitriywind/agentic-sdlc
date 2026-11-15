import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const front = (text: string) => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'frontmatter');
  return Object.fromEntries(m![1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
};

test('plugin agents: one per tier plus a reviewer that reads files and runs only the CLI', () => {
  for (const [tier, model] of [['fast', 'haiku'], ['balanced', 'sonnet'], ['deep', 'opus']]) {
    const f = front(read(`agents/sdlc-${tier}.md`));
    assert.equal(f.name, `sdlc-${tier}`);
    assert.equal(f.model, model);
    assert.match(f.description, new RegExp(`metadata\\.tier is ${tier}`));
  }
  const r = front(read('agents/sdlc-reviewer.md'));
  const tools = r.tools.split(/,\s*/);
  assert.deepEqual(tools.filter((t) => /^(Edit|Write|NotebookEdit|Agent)$/.test(t)), []);
  assert.ok(tools.includes('Read') && tools.includes('Bash') && tools.includes('mcp__plugin_agentic-sdlc_agentic-sdlc__*'));
  assert.match(r.disallowedTools, /Edit, Write/);
  assert.match(r.maxTurns, /^\d+$/);
  const files: string[] = JSON.parse(read('package.json')).files;
  for (const d of ['agents', 'bin', 'evals', 'hooks', '.claude-plugin']) assert.ok(files.includes(d), d);
  for (const f of readdirSync(join(root, 'agents'))) {
    const keys = Object.keys(front(read(`agents/${f}`)));
    for (const k of ['hooks', 'mcpServers', 'permissionMode']) assert.ok(!keys.includes(k), `${f} sets ${k}, which plugin agents ignore`);
  }
});

test('bin/agentic-sdlc is executable and runs the plugin build when the project pins none', () => {
  assert.ok(statSync(join(root, 'bin/agentic-sdlc')).mode & 0o100);
  const r = spawnSync('node', [join(root, 'bin/agentic-sdlc'), '--version'], { env: { ...process.env, CLAUDE_PROJECT_DIR: join(root, 'test') }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), JSON.parse(read('package.json')).version);
});

test('plugin evals: each case has a real prompt and graders with a type', () => {
  const dir = join(root, 'evals');
  const cases = readdirSync(dir).filter((d) => existsSync(join(dir, d, 'prompt.md')));
  assert.ok(cases.length >= 3);
  for (const c of cases) {
    assert.doesNotMatch(read(`evals/${c}/prompt.md`), /TODO/);
    const graders = readdirSync(join(dir, c, 'graders'));
    assert.ok(graders.length);
    for (const g of graders) assert.match(front(read(`evals/${c}/graders/${g}`)).type, /^(regex|tool_order|tool_used|file_exists|llm|baseline)$/);
  }
});

test('Codex and Cursor manifests parse, carry the package version and point at real paths', () => {
  const version = JSON.parse(read('package.json')).version;
  const KEYS = ['name', 'displayName', 'description', 'version', 'minClientVersions', 'author', 'publisher', 'homepage', 'repository', 'license', 'logo', 'keywords', 'category', 'tags', 'commands', 'agents', 'skills', 'rules', 'hooks', 'variables', 'mcpServers'];
  for (const dir of ['.claude-plugin', '.codex-plugin', '.cursor-plugin']) {
    const m = JSON.parse(read(`${dir}/plugin.json`));
    assert.equal(m.name, 'agentic-sdlc', dir);
    assert.equal(m.version, version, dir);
  }
  const cursor = JSON.parse(read('.cursor-plugin/plugin.json'));
  assert.deepEqual(Object.keys(cursor).filter((k) => !KEYS.includes(k)), [], 'the Cursor schema has additionalProperties: false');
  assert.match(cursor.name, /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
  const codex = JSON.parse(read('.codex-plugin/plugin.json'));
  for (const p of [codex.skills, cursor.skills]) assert.ok(statSync(join(root, p)).isDirectory(), p);
  for (const p of [codex.mcpServers, cursor.mcpServers]) {
    assert.match(p, /^\.\//);
    assert.deepEqual(JSON.parse(read(p)).mcpServers['agentic-sdlc'].args, ['--no', 'agentic-sdlc', 'mcp']);
  }
  const files: string[] = JSON.parse(read('package.json')).files;
  for (const f of ['.codex-plugin', '.cursor-plugin', 'mcp.json']) assert.ok(files.includes(f), f);
});

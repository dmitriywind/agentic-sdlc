// Runs the bundled CLI, so a module the bundler dropped (e.g. a computed dynamic import) fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = join(import.meta.dirname, '..', 'dist', 'bin.js');

test('bundled CLI: init, validate, and an MCP tool call', { skip: !existsSync(bin) && 'run npm run build first' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'agentic-dist-'));
  const run = (args: string[], input?: string) => execFileSync('node', [bin, '--root', root, ...args], { encoding: 'utf8', input });
  run(['init', '--board', 'local', '--harness', 'generic']);
  assert.match(run(['validate']), /ok/);
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'board_create', arguments: { title: 't', body: 'b', status: 'Signals' } } };
  const out = JSON.parse(run(['mcp'], JSON.stringify(call) + '\n').trim());
  assert.equal(out.result?.isError, undefined, JSON.stringify(out));
  assert.match(out.result.content[0].text, /"status": "Signals"/);
});

test('package: plugin manifest matches package.json; every template YAML and JSON parses', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { parseAllDocuments } = await import('yaml');
  const root = join(import.meta.dirname, '..');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const plugin = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(plugin.name, pkg.name);
  assert.equal(plugin.version, pkg.version);
  for (const f of ['.claude-plugin', 'hooks']) assert.ok(pkg.files.includes(f), f);
  // Git only: the npm name agentic-sdlc is another package, and a plugin from Git has no node_modules.
  assert.equal(pkg.private, true);
  assert.equal(pkg.dependencies, undefined, 'bundle runtime dependencies into dist');
  const shipped = ['README.md', 'hooks', 'templates', 'docs', 'references', 'skills', 'src'].map((p) => join(root, p));
  const all = (p: string): string[] => statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => all(join(p, n))) : [p];
  for (const f of shipped.flatMap(all).filter((f) => !f.includes('audits'))) {
    const t = readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /npx (-y )?agentic-sdlc\b|agentic-sdlc@(?!agentic-sdlc|noreply|users\.noreply)/, f);
    for (const [, v] of t.matchAll(/AGENTIC_SDLC_VERSION:-([^}]+)\}/g)) assert.equal(v, pkg.version, `${f}: default CLI version`);
  }
  JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8'));
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]);
  for (const f of walk(join(root, 'templates'))) {
    const text = readFileSync(f, 'utf8');
    if (f.endsWith('.json')) JSON.parse(text);
    if (/\.ya?ml$/.test(f)) for (const doc of parseAllDocuments(text)) assert.deepEqual(doc.errors, [], f);
  }
});

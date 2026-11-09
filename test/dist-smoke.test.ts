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
  JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8'));
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]);
  for (const f of walk(join(root, 'templates'))) {
    const text = readFileSync(f, 'utf8');
    if (f.endsWith('.json')) JSON.parse(text);
    if (/\.ya?ml$/.test(f)) for (const doc of parseAllDocuments(text)) assert.deepEqual(doc.errors, [], f);
  }
});

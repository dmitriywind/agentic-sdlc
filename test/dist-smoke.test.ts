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

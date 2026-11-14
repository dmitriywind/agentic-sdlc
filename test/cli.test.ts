import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/cli.ts';

const quiet = async (f: () => Promise<number>) => {
  const out: string[] = [], l = console.log, e = console.error;
  console.log = console.error = (s: string) => { out.push(String(s)); };
  try { return { code: await f(), out: out.join('\n') }; } finally { console.log = l; console.error = e; }
};

test('help: every group answers --help with its usage and exit 0; a group with no verb is a usage error', async () => {
  for (const g of ['init', 'board', 'forge', 'vcs', 'gate', 'dispatch', 'ledger', 'bench']) {
    const r = await quiet(() => main([g, '--help']));
    assert.equal(r.code, 0, g);
    assert.match(r.out, new RegExp(`usage: agentic-sdlc ${g}`), g);
  }
  assert.match((await quiet(() => main(['init', '--help']))).out, /--profile individual\|individual-api\|organization/);
  for (const g of ['forge', 'vcs', 'gate']) assert.equal((await quiet(() => main([g]))).code, 2, g);
  const all = await quiet(() => main([]));
  assert.equal(all.code, 2);
  assert.match(all.out, /init[\s\S]*mcp/);
});

test('cli: --version and help print and exit 0; --root needs a directory; --help is read only at the verb position; groups are own properties', async () => {
  const v = await quiet(() => main(['--version']));
  assert.equal(v.code, 0);
  assert.match(v.out, /^\d+\.\d+\.\d+/);
  assert.equal((await quiet(() => main(['-v']))).out, v.out);
  const h = await quiet(() => main(['help']));
  assert.equal(h.code, 0);
  assert.match(h.out, /usage: agentic-sdlc/);
  assert.match(h.out, /gate .*skill-regression review/);
  assert.match((await quiet(() => main(['gate', '--help']))).out, /usage: agentic-sdlc gate/);
  assert.equal((await quiet(() => main(['--root']))).code, 2);
  assert.match((await quiet(() => main(['--root', 'board', 'list']))).out, /--root needs a directory/);
  assert.equal((await quiet(() => main(['--root', 'board', 'list']))).code, 2);
  assert.equal((await quiet(() => main(['constructor']))).code, 2);
  assert.match((await quiet(() => main(['constructor']))).out, /unknown group 'constructor'/);
  // A flag value of --help is the verb's business, not a request for help.
  const r = await quiet(() => main(['--root', '/nonexistent-agentic-sdlc', 'board', 'comment', '1', '--body-file', '--help']));
  assert.doesNotMatch(r.out, /^usage: agentic-sdlc board/);
});

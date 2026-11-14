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

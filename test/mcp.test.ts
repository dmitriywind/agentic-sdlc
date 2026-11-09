import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, handle, startHttp } from '../src/mcp.ts';
import { fakeCtx } from './helpers.ts';

const rpc = (method: string, params?: object) => ({ jsonrpc: '2.0', id: 1, method, params });
const call = (ctx: any, name: string, args: object) => handle(rpc('tools/call', { name, arguments: args }), ctx) as Promise<any>;

test('tools/list has board_move with a schema; unknown method is -32601', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const r: any = await handle(rpc('tools/list'), ctx);
  const t = r.result.tools.find((x: any) => x.name === 'board_move');
  assert.deepEqual(t.inputSchema.required, ['id', 'status']);
  assert.equal(t.inputSchema.properties.only_from.type, 'string');
  assert.equal(r.result.tools.length, 35);
  assert.equal(((await handle(rpc('nope'), ctx)) as any).error.code, -32601);
});

test('board_create then board_move; only_from refusal is isError', async () => {
  const { ctx } = fakeCtx(mkdtempSync(join(tmpdir(), 'mcp-')), {}, () => ({}));
  const c = await call(ctx, 'board_create', { title: 'T', body: 'b', status: 'Backlog' });
  assert.equal(JSON.parse(c.result.content[0].text).id, '1');
  const m = await call(ctx, 'board_move', { id: '1', status: 'Ready', only_from: 'Backlog' });
  assert.equal(JSON.parse(m.result.content[0].text).status, 'Ready');
  const bad = await call(ctx, 'board_move', { id: '1', status: 'Done', only_from: 'Backlog' });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /not moved/);
});

test('board_set and board_assign pass value and user as positionals', async () => {
  const { ctx } = fakeCtx(mkdtempSync(join(tmpdir(), 'mcp-')), {}, () => ({}));
  await call(ctx, 'board_create', { title: 'T', body: 'b', status: 'Backlog' });
  for (const [name, args] of [
    ['board_set', { id: '1', field: 'size', value: 'M' }],
    ['board_assign', { id: '1', user: 'bot' }],
    ['board_set', { id: '1', field: 'size', value: 'M', clear: true }],
    ['board_assign', { id: '1', none: true }],
  ] as const) {
    const res = await call(ctx, name, args);
    assert.equal(res.result.isError, undefined, `${name}: ${res.result.content[0].text}`);
  }
});

test('http mode needs the bearer token', async () => {
  const mk = (env: Record<string, string>) => fakeCtx('.', {}, () => ({}), env).ctx;
  await assert.rejects(startHttp(mk({}), 0), /AGENTIC_SDLC_MCP_TOKEN/);
  const s = await startHttp(mk({ AGENTIC_SDLC_MCP_TOKEN: 'sekret' }), 0);
  const url = `http://127.0.0.1:${(s.address() as any).port}/mcp`;
  const post = (auth?: string) => fetch(url, { method: 'POST', headers: auth ? { authorization: auth } : {}, body: JSON.stringify(rpc('ping')) });
  try {
    assert.equal((await post()).status, 401);
    assert.equal((await post('Bearer wrong')).status, 401);
    const ok = await post('Bearer sekret');
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()).result, {});
    const id = '\u0437\u0435\u0431\u0440\u0430-\u20ac-\u{1F600}'.repeat(5000);
    const mb = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer sekret' }, body: JSON.stringify({ ...rpc('ping'), id }) });
    assert.equal((await mb.json()).id, id, 'a multibyte body split across chunks decodes intact');
  } finally { s.close(); }
});

test('mcp --help prints usage and exits 0 instead of reading stdin', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const orig = console.log; let out = ''; console.log = (s: string) => { out += s; };
  try { assert.equal(await cli(['--help'], ctx), 0); } finally { console.log = orig; }
  assert.match(out, /--http/);
});

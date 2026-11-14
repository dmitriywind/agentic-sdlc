import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowList, cli, handle } from '../src/mcp.ts';
import { fakeCtx } from './helpers.ts';

const rpc = (method: string, params?: object) => ({ jsonrpc: '2.0', id: 1, method, params });
const call = (ctx: any, name: string, args: object) => handle(rpc('tools/call', { name, arguments: args }), ctx) as Promise<any>;

test('tools/list has board_move with a schema; unknown method is -32601', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const r: any = await handle(rpc('tools/list'), ctx);
  const t = r.result.tools.find((x: any) => x.name === 'board_move');
  assert.deepEqual(t.inputSchema.required, ['id', 'status']);
  assert.equal(t.inputSchema.properties.only_from.type, 'string');
  const names = r.result.tools.map((x: any) => x.name);
  assert.equal(names.length, 34);
  for (const n of ['forge_approve', 'forge_status', 'vcs_tag']) assert.ok(!names.includes(n), n);
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

test('mcp --help prints usage and exits 0 instead of reading stdin', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const orig = console.log; let out = ''; console.log = (s: string) => { out += s; };
  try { assert.equal(await cli(['--help'], ctx), 0); } finally { console.log = orig; }
  assert.match(out, /--allow/);
});

test('--allow approve,status serves the review-identity tools; they are refused otherwise', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const names = async (allow?: Set<string>) => ((await handle(rpc('tools/list'), ctx, allow)) as any).result.tools.map((t: any) => t.name);
  assert.ok((await names(allowList('approve,status'))).includes('forge_status'));
  assert.deepEqual((await names(allowList('approve'))).filter((n: string) => n === 'forge_approve' || n === 'forge_status'), ['forge_approve']);
  const r = await call(ctx, 'forge_approve', { n: '1' });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /unknown tool/);
  assert.throws(() => allowList('merge'), /--allow takes approve,status/);
  const err = console.error; console.error = () => {};
  try { assert.equal(await cli(['--allow', 'merge'], ctx), 2); } finally { console.error = err; }
});

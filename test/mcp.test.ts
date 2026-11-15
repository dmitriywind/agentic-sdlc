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
  assert.equal(names.length, 41);
  for (const n of ['forge_approve', 'forge_status', 'vcs_tag']) assert.ok(!names.includes(n), n);
  assert.equal(((await handle(rpc('nope'), ctx)) as any).error.code, -32601);
});

test('board tools create, move with only_from (a refusal is isError), set and assign', async () => {
  const { ctx } = fakeCtx(mkdtempSync(join(tmpdir(), 'mcp-')), {}, () => ({}));
  const c = await call(ctx, 'board_create', { title: 'T', body: 'b', status: 'Backlog' });
  assert.equal(JSON.parse(c.result.content[0].text).id, '1');
  const m = await call(ctx, 'board_move', { id: '1', status: 'Ready', only_from: 'Backlog' });
  assert.equal(JSON.parse(m.result.content[0].text).status, 'Ready');
  const bad = await call(ctx, 'board_move', { id: '1', status: 'Done', only_from: 'Backlog' });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /not moved/);
  {
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
  }
});

test('--allow approve,status serves the review-identity tools, they are refused otherwise, and --help prints usage', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const names = async (allow?: Set<string>) => ((await handle(rpc('tools/list'), ctx, allow)) as any).result.tools.map((t: any) => t.name);
  assert.ok((await names(allowList('approve,status'))).includes('forge_status'));
  assert.deepEqual((await names(allowList('approve'))).filter((n: string) => n === 'forge_approve' || n === 'forge_status'), ['forge_approve']);
  const r = await call(ctx, 'forge_approve', { n: '1' });
  assert.equal(r.error.code, -32602);
  assert.match(r.error.message, /unknown tool/);
  assert.throws(() => allowList('merge'), /--allow takes approve,status/);
  const err = console.error; console.error = () => {};
  try { assert.equal(await cli(['--allow', 'merge'], ctx), 2); } finally { console.error = err; }
  {
    const { ctx } = fakeCtx('.', {}, () => ({}));
    const orig = console.log; let out = ''; console.log = (s: string) => { out += s; };
    try { assert.equal(await cli(['--help'], ctx), 0); } finally { console.log = orig; }
    assert.match(out, /--allow/);
  }
});

test('initialize answers the requested protocol version when supported, else the latest', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const v = async (protocolVersion?: unknown) => ((await handle(rpc('initialize', protocolVersion === undefined ? {} : { protocolVersion }), ctx)) as any).result.protocolVersion;
  for (const x of ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']) assert.equal(await v(x), x);
  assert.equal(await v('2099-01-01'), '2025-11-25');
  assert.equal(await v(), '2025-11-25');
  assert.equal(await v(7), '2025-11-25');
});

test('every tool carries annotations from one table: reads are read-only, close and drop destructive, vcs reads closed-world', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const all = new Set(['forge_approve', 'forge_status']);
  const r: any = await handle(rpc('tools/list'), ctx, all);
  const by = Object.fromEntries(r.result.tools.map((t: any) => [t.name, t]));
  for (const t of r.result.tools) {
    assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
    assert.equal(typeof t.annotations.openWorldHint, 'boolean', t.name);
    assert.ok(t.title, t.name);
  }
  for (const n of ['board_list', 'board_get', 'forge_diff', 'forge_approvals', 'forge_runs', 'vcs_head', 'vcs_tags']) assert.equal(by[n].annotations.readOnlyHint, true, n);
  for (const n of ['board_close', 'vcs_drop']) assert.deepEqual([by[n].annotations.readOnlyHint, by[n].annotations.destructiveHint], [false, true], n);
  assert.equal(by.board_move.annotations.destructiveHint, false);
  assert.equal(by.board_move.annotations.idempotentHint, true);
  assert.equal(by.board_create.annotations.idempotentHint, false);
  assert.equal(by.board_get.annotations.openWorldHint, true);
  assert.equal(by.vcs_head.annotations.openWorldHint, false);
});

test('tools/call checks arguments against the inputSchema: -32602 naming the argument; unknown tool is -32602; a failing tool is isError', async () => {
  const { ctx } = fakeCtx(mkdtempSync(join(tmpdir(), 'mcp-')), {}, () => ({}));
  const code = async (name: string, args: object) => { const r = await call(ctx, name, args); return r.error ? [r.error.code, r.error.message] : [0, r.result.isError]; };
  assert.deepEqual(await code('board_get', {}), [-32602, "board_get: missing required argument 'id'"]);
  assert.deepEqual((await code('board_get', { id: null }))[0], -32602);
  assert.match((await code('board_get', { id: 5 }))[1] as string, /'id' must be a string/);
  assert.match((await code('board_list', { status: 'Backlog' }))[1] as string, /'status' must be an array of strings/);
  assert.match((await code('board_list', { status: [1] }))[1] as string, /'status'/);
  assert.match((await code('board_comments', { id: '1', last: 1.5 }))[1] as string, /'last' must be a integer/);
  assert.match((await code('forge_open', { source: 's', title: 't', body: 'b', draft: 'yes' }))[1] as string, /'draft' must be a boolean/);
  assert.match((await code('board_get', { id: '1', nope: 1 }))[1] as string, /unknown argument 'nope'/);
  assert.deepEqual((await code('nope', {}))[0], -32602);
  assert.deepEqual(await code('board_get', { id: '99' }), [0, true]); // valid call that fails stays an isError result
});

test('a request with a non-string method answers -32600 with the request id', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const r: any = await handle({ jsonrpc: '2.0', id: 42, method: 7 }, ctx);
  assert.deepEqual([r.id, r.error.code], [42, -32600]);
  const s: any = await handle({ jsonrpc: '2.0', id: 'abc', method: null }, ctx);
  assert.equal(s.id, 'abc');
});

test('a verb whose output is a JSON object also returns structuredContent; arrays and text stay text only', async () => {
  const { ctx } = fakeCtx(mkdtempSync(join(tmpdir(), 'mcp-')), {}, () => ({}));
  const c = await call(ctx, 'board_create', { title: 'T', body: 'b', status: 'Backlog' });
  assert.equal(c.result.structuredContent.id, '1');
  assert.deepEqual(JSON.parse(c.result.content[0].text), c.result.structuredContent);
  const l = await call(ctx, 'board_list', {});
  assert.ok(Array.isArray(JSON.parse(l.result.content[0].text)));
  assert.equal(l.result.structuredContent, undefined);
});

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

test('board_milestone sets and clears a milestone; forge_run and forge_list take their arguments and forge_run is read only', async () => {
  const { ctx } = fakeCtx(mkdtempSync(join(tmpdir(), 'mcp-')), {}, () => ({}));
  await call(ctx, 'board_create', { title: 'T', body: 'b', status: 'Backlog' });
  const set = await call(ctx, 'board_milestone', { id: '1', name: 'M1' });
  assert.equal(JSON.parse(set.result.content[0].text).milestone, 'M1');
  const clr = await call(ctx, 'board_milestone', { id: '1', clear: true });
  assert.equal(JSON.parse(clr.result.content[0].text).milestone, undefined);
  const tools = ((await handle(rpc('tools/list'), ctx)) as any).result.tools;
  const by = (n: string) => tools.find((t: any) => t.name === n);
  assert.equal(by('forge_run').annotations.readOnlyHint, true);
  assert.deepEqual(by('forge_run').inputSchema.required, ['id']);
  assert.equal(by('board_milestone').annotations.readOnlyHint, false);
  for (const p of ['limit', 'since', 'checks']) assert.ok(p in by('forge_list').inputSchema.properties, p);
});

// Conformance, written by hand from the revision texts: 2025-11-25 basic/lifecycle, and 2026-07-28 basic/index (_meta, resultType, error codes),
// basic/versioning, basic/transports/stdio, server/discover, server/tools and server/utilities/caching.
const M = 'io.modelcontextprotocol/';
const meta = (extra: object = {}) => ({ _meta: { [`${M}protocolVersion`]: '2026-07-28', [`${M}clientCapabilities`]: {}, [`${M}clientInfo`]: { name: 't', version: '1' }, ...extra } });
const modern = (ctx: any, method: string, params: object = {}, id: unknown = 7) => handle({ jsonrpc: '2.0', id, method, params: { ...meta(), ...params } }, ctx) as Promise<any>;

test('conformance 2025-11-25: initialize, then tools/list and tools/call answer without resultType, ttlMs or _meta; ping answers {}', async () => {
  const { ctx } = fakeCtx(mkdtempSync(join(tmpdir(), 'mcp-')), {}, () => ({}));
  const init: any = await handle(rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } }), ctx);
  assert.equal(init.jsonrpc, '2.0');
  assert.equal(init.id, 1);
  assert.deepEqual(Object.keys(init.result).sort(), ['capabilities', 'protocolVersion', 'serverInfo']);
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(init.result.serverInfo.name, 'agentic-sdlc');
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx), null);
  assert.deepEqual(((await handle(rpc('ping'), ctx)) as any).result, {});
  const list: any = await handle(rpc('tools/list'), ctx);
  assert.deepEqual(Object.keys(list.result), ['tools']);
  const res: any = await call(ctx, 'board_create', { title: 'T', body: 'b', status: 'Backlog' });
  assert.equal(res.result.resultType, undefined);
  assert.equal(res.result._meta, undefined);
  assert.equal(res.result.content[0].type, 'text');
  assert.equal((await call(ctx, 'nope', {})).error.code, -32602);
});

test('conformance 2026-07-28: server/discover and stateless tools/list carry resultType, ttlMs, cacheScope and serverInfo', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const d = await modern(ctx, 'server/discover');
  assert.equal(d.id, 7);
  assert.equal(d.result.resultType, 'complete');
  assert.deepEqual(d.result.supportedVersions.slice(0, 2), ['2026-07-28', '2025-11-25']);
  assert.deepEqual(d.result.capabilities, { tools: {} });
  assert.equal(d.result._meta[`${M}serverInfo`].name, 'agentic-sdlc');
  assert.ok(Number.isInteger(d.result.ttlMs) && d.result.ttlMs >= 0);
  assert.ok(['public', 'private'].includes(d.result.cacheScope));
  const l = await modern(ctx, 'tools/list');
  assert.equal(l.result.resultType, 'complete');
  assert.ok(Number.isInteger(l.result.ttlMs) && l.result.ttlMs >= 0);
  assert.ok(['public', 'private'].includes(l.result.cacheScope));
  assert.equal(l.result.nextCursor, undefined);
  assert.equal(l.result._meta[`${M}serverInfo`].name, 'agentic-sdlc');
  for (const t of l.result.tools) {
    assert.equal(typeof t.name, 'string');
    assert.equal(t.inputSchema.type, 'object');
  }
  assert.deepEqual(l.result.tools.map((t: any) => t.name), ((await handle(rpc('tools/list'), ctx)) as any).result.tools.map((t: any) => t.name));
  assert.equal(l.result.tools.length, 41);
  assert.equal((await modern(ctx, 'tools/list', { cursor: 'x' })).error.code, -32602);
});

test('conformance 2026-07-28: tools/call results are complete; a failing tool is isError, an unknown tool or bad argument is -32602', async () => {
  const { ctx } = fakeCtx(mkdtempSync(join(tmpdir(), 'mcp-')), {}, () => ({}));
  const ok = await modern(ctx, 'tools/call', { name: 'board_create', arguments: { title: 'T', body: 'b', status: 'Backlog' } });
  assert.equal(ok.result.resultType, 'complete');
  assert.equal(ok.result.content[0].type, 'text');
  assert.equal(ok.result.isError, undefined);
  assert.equal(ok.result.structuredContent.id, '1');
  assert.equal(ok.result._meta[`${M}serverInfo`].name, 'agentic-sdlc');
  const fail = await modern(ctx, 'tools/call', { name: 'board_get', arguments: { id: '99' } });
  assert.deepEqual([fail.result.resultType, fail.result.isError], ['complete', true]);
  const unknown = await modern(ctx, 'tools/call', { name: 'nope', arguments: {} });
  assert.deepEqual([unknown.id, unknown.error.code, 'result' in unknown], [7, -32602, false]);
  const bad = await modern(ctx, 'tools/call', { name: 'board_get', arguments: {} });
  assert.equal(bad.error.code, -32602);
  assert.equal(bad.error.data, undefined);
});

test('conformance 2026-07-28: a missing _meta field is -32602, an unsupported version is -32022 listing the supported ones, ping and initialize-era methods are -32601', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const noCaps: any = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: { [`${M}protocolVersion`]: '2026-07-28' } } }, ctx);
  assert.deepEqual([noCaps.id, noCaps.error.code], [3, -32602]);
  const noVersion: any = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: { _meta: { [`${M}clientCapabilities`]: {} } } }, ctx);
  assert.equal(noVersion.error.code, -32602);
  const noMeta: any = await handle({ jsonrpc: '2.0', id: 5, method: 'server/discover' }, ctx);
  assert.deepEqual([noMeta.id, noMeta.error.code], [5, -32602]);
  for (const method of ['tools/list', 'tools/call', 'server/discover']) {
    const r: any = await handle({ jsonrpc: '2.0', id: 6, method, params: meta({ [`${M}protocolVersion`]: '1900-01-01' }) }, ctx);
    assert.equal(r.id, 6);
    assert.equal(r.error.code, -32022, method);
    assert.equal(r.error.message, 'Unsupported protocol version');
    assert.equal(r.error.data.requested, '1900-01-01');
    assert.ok(r.error.data.supported.includes('2026-07-28') && r.error.data.supported.includes('2025-11-25'));
  }
  assert.equal((await modern(ctx, 'ping')).error.code, -32601);
  assert.equal((await modern(ctx, 'logging/setLevel', { level: 'info' })).error.code, -32601);
  assert.equal((await modern(ctx, 'resources/list')).error.code, -32601);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/cancelled', params: meta() }, ctx), null);
});

test('conformance: --allow filters the tools in both shapes, and a modern request needs no earlier initialize', async () => {
  const { ctx } = fakeCtx('.', {}, () => ({}));
  const names = async (allow: Set<string>) => (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: meta() }, ctx, allow) as any).result.tools.map((t: any) => t.name);
  assert.ok(!(await names(new Set())).includes('forge_approve'));
  assert.ok((await names(allowList('approve'))).includes('forge_approve'));
  const refused: any = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'forge_approve', arguments: { n: '1' }, ...meta() } }, ctx);
  assert.equal(refused.error.code, -32602);
});

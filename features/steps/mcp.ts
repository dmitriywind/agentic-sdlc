// The MCP server, driven in-process one JSON-RPC message at a time against the scenario's project (a local board).
// State on w.state: allow (the Set of guarded tools --allow named), replies (every reply of the scenario, null for no reply), tools (the last tools/list).
import assert from 'node:assert/strict';
import { allowList, handle } from '../../src/mcp.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import type { World } from '../support/world.ts';

const M = 'io.modelcontextprotocol/';
type Obj = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const allow = (w: World): Set<string> => (w.state.allow ??= new Set<string>());
const replies = (w: World): Obj[] => (w.state.replies ??= []);
const reply = (w: World): Obj => { const r = replies(w).at(-1); assert.notEqual(r, undefined, 'the client has sent nothing'); return r; };
const meta = (version = '2026-07-28') => ({ _meta: { [`${M}protocolVersion`]: version, [`${M}clientCapabilities`]: {}, [`${M}clientInfo`]: { name: 't', version: '1' } } });

async function send(w: World, msg: Obj) {
  const r = await handle(msg, w.adapterContext(), allow(w));
  replies(w).push(r);
  if (msg.method === 'tools/list' && r && (r as Obj).result?.tools) w.state.tools = (r as Obj).result.tools;
}
const rpc = (method: string, params: Obj | undefined, id: unknown = 1) => ({ jsonrpc: '2.0', id, method, params });
const json = (text: string): Obj => JSON.parse(text);
const text = (v: unknown) => (v === undefined ? undefined : Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
const at = (root: Obj, path: string) => { let v = root; for (const k of path.split('.')) v = v?.[k]; return v; };

// ---- Given: how the server is started ----
Given('the server is started with --allow {string}', (w, arg: string) => { w.state.allow = allowList(arg); });

// ---- When: the client speaks ----
When('the client sends {string}', async (w, method: string) => send(w, rpc(method, undefined)));
When('the client calls the tool {string} with {string}', async (w, name: string, args: string) => send(w, rpc('tools/call', { name, arguments: json(args) })));
When('the client sends the session:', async (w, t: DataTable) => { for (const r of t.hashes()) await send(w, r.id ? rpc(r.method, r.params ? json(r.params) : undefined, json(r.id)) : { jsonrpc: '2.0', method: r.method }); });
// 2026-07-28: every request carries its own version and capabilities in _meta.
When('the modern client sends {string}', async (w, method: string) => send(w, rpc(method, meta(), 7)));

// ---- Then: the reply ----
Then('the reply {string} is {string}', (w, path: string, value: string) => assert.equal(text(at(reply(w), path)), value));
Then('the reply {string} mentions {string}', (w, path: string, part: string) => assert.ok(String(at(reply(w), path)).includes(part), `${path}: ${text(at(reply(w), path))}`));
Then('the reply has no {string}', (w, path: string) => assert.equal(at(reply(w), path), undefined));
Then('reply {int} {string} holds the keys {string}', (w, n: number, path: string, keys: string) => assert.deepEqual(Object.keys(at(replies(w)[n - 1], path)).sort(), keys.split(',').map((k) => k.trim()).sort()));
Then('the reply {string} is a whole number from 0', (w, path: string) => { const v = at(reply(w), path); assert.ok(Number.isInteger(v) && v >= 0, `${path}: ${v}`); });
Then('the reply {string} is one of {string}', (w, path: string, list: string) => assert.ok(list.split(',').map((s) => s.trim()).includes(text(at(reply(w), path)) as string), `${path}: ${text(at(reply(w), path))}`));
Then('reply {int} {string} is {string}', (w, n: number, path: string, value: string) => assert.equal(text(at(replies(w)[n - 1], path)), value));
Then('reply {int} has no {string}', (w, n: number, path: string) => assert.equal(at(replies(w)[n - 1], path), undefined));
Then('reply {int} is empty', (w, n: number) => assert.deepEqual(replies(w)[n - 1].result, {}));
Then('reply {int} has no reply', (w, n: number) => assert.equal(replies(w)[n - 1], null));
Then('the server carries its name in the _meta of the reply', (w) => assert.equal(reply(w).result._meta[`${M}serverInfo`].name, 'agentic-sdlc'));
Then('the server answers with the same tool names as the legacy shape', async (w) => {
  const legacy = (await handle(rpc('tools/list', undefined), w.adapterContext(), allow(w))) as Obj;
  assert.deepEqual(reply(w).result.tools.map((t: Obj) => t.name), legacy.result.tools.map((t: Obj) => t.name));
});
Then('every listed tool has an object input schema', (w) => { for (const t of reply(w).result.tools) assert.equal(t.inputSchema.type, 'object', t.name); });

// ---- Then: the tools ----
Then('the listed tools include {string}', (w, name: string) => assert.ok(reply(w).result.tools.some((t: Obj) => t.name === name), `${name} is not listed`));

// ---- Then: a tool call ----
Then('the tool result is an error', (w) => assert.equal(reply(w).result.isError, true, JSON.stringify(reply(w))));
Then('the tool result is not an error', (w) => assert.equal(reply(w).result.isError, undefined, JSON.stringify(reply(w).result.content)));
Then('the tool result says {string}', (w, part: string) => assert.ok(reply(w).result.content[0].text.includes(part), reply(w).result.content[0].text));
Then('the structured content {string} is {string}', (w, path: string, value: string) => assert.equal(text(at(reply(w).result.structuredContent, path)), value));

// ---- Then: the command line ----

// The MCP server, driven in-process one JSON-RPC message at a time against the scenario's project (a local board).
// State on w.state: allow (the Set of guarded tools --allow named), replies (every reply of the scenario, null for no reply), tools (the last tools/list).
import assert from 'node:assert/strict';
import { VERBS as BOARD } from '../../src/board/index.ts';
import { VERBS as FORGE } from '../../src/forge/index.ts';
import { VERBS as VCS } from '../../src/vcs/index.ts';
import { allowList, cli, handle } from '../../src/mcp.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import type { World } from '../support/world.ts';

const M = 'io.modelcontextprotocol/';
const VERBS: Record<string, Record<string, unknown>> = { board: BOARD, forge: FORGE, vcs: VCS };
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
const tool = (w: World, name: string): Obj => {
  const t = (w.state.tools as Obj[] | undefined)?.find((x) => x.name === name);
  assert.ok(t, `tool ${name} is not in the last tools/list`);
  return t;
};
const toolText = (w: World): Obj => json(reply(w).result.content[0].text);

// ---- Given: how the server is started ----
Given('the server is started with --allow {string}', (w, arg: string) => { w.state.allow = allowList(arg); });

// ---- When: the client speaks ----
When('the client sends {string}', async (w, method: string) => send(w, rpc(method, undefined)));
When('the client sends {string} with {string}', async (w, method: string, params: string) => send(w, rpc(method, json(params))));
When('the client sends a request whose method is {string} with id {string}', async (w, method: string, id: string) => send(w, { jsonrpc: '2.0', id: json(id), method: json(method) }));
When('the client sends the notification {string}', async (w, method: string) => send(w, { jsonrpc: '2.0', method }));
When('the client calls the tool {string} with {string}', async (w, name: string, args: string) => send(w, rpc('tools/call', { name, arguments: json(args) })));
When('the client sends the session:', async (w, t: DataTable) => { for (const r of t.hashes()) await send(w, r.id ? rpc(r.method, r.params ? json(r.params) : undefined, json(r.id)) : { jsonrpc: '2.0', method: r.method }); });
// 2026-07-28: every request carries its own version and capabilities in _meta.
When('the modern client sends {string}', async (w, method: string) => send(w, rpc(method, meta(), 7)));
When('the modern client sends {string} with {string}', async (w, method: string, params: string) => send(w, rpc(method, { ...meta(), ...json(params) }, 7)));
When('the modern client sends {string} for the version {string}', async (w, method: string, version: string) => send(w, rpc(method, meta(version), 6)));
When('the modern client calls the tool {string} with {string}', async (w, name: string, args: string) => send(w, rpc('tools/call', { name, arguments: json(args), ...meta() }, 7)));
When('a client sends {string} with only {string} in its _meta', async (w, method: string, key: string) => send(w, rpc(method, { _meta: { [`${M}${key}`]: key === 'protocolVersion' ? '2026-07-28' : {} }, }, 3)));
When('a client sends {string} with no params', async (w, method: string) => send(w, rpc(method, undefined, 5)));
When('the client runs "mcp --allow {word}"', async (w, arg: string) => {
  const err = console.error; let out = ''; console.error = (s: string) => { out += s; };
  try { w.state.exit = await cli(['--allow', arg], w.adapterContext()); } finally { console.error = err; }
  w.state.stderr = out;
});
When('the client runs "mcp --help"', async (w) => {
  const orig = console.log; let out = ''; console.log = (s: string) => { out += s; };
  try { w.state.exit = await cli(['--help'], w.adapterContext()); } finally { console.log = orig; }
  w.state.stdout = out;
});

// ---- Then: the reply ----
Then('the reply {string} is {string}', (w, path: string, value: string) => assert.equal(text(at(reply(w), path)), value));
Then('the reply {string} mentions {string}', (w, path: string, part: string) => assert.ok(String(at(reply(w), path)).includes(part), `${path}: ${text(at(reply(w), path))}`));
Then('the reply has no {string}', (w, path: string) => assert.equal(at(reply(w), path), undefined));
Then('reply {int} {string} holds the keys {string}', (w, n: number, path: string, keys: string) => assert.deepEqual(Object.keys(at(replies(w)[n - 1], path)).sort(), keys.split(',').map((k) => k.trim()).sort()));
Then('the reply {string} is a whole number from 0', (w, path: string) => { const v = at(reply(w), path); assert.ok(Number.isInteger(v) && v >= 0, `${path}: ${v}`); });
Then('the reply {string} is one of {string}', (w, path: string, list: string) => assert.ok(list.split(',').map((s) => s.trim()).includes(text(at(reply(w), path)) as string), `${path}: ${text(at(reply(w), path))}`));
Then('the reply {string} starts with {string}', (w, path: string, list: string) => assert.deepEqual((at(reply(w), path) as string[]).slice(0, list.split(',').length), list.split(',').map((s) => s.trim())));
Then('the reply {string} includes {string}', (w, path: string, list: string) => { for (const s of list.split(',').map((x) => x.trim())) assert.ok((at(reply(w), path) as string[]).includes(s), `${path} lacks ${s}`); });
Then('the server sends no reply', (w) => assert.equal(reply(w), null));
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
Then('the listed tools do not include {string}', (w, name: string) => assert.ok(!reply(w).result.tools.some((t: Obj) => t.name === name), `${name} is listed`));
Then('every verb of the {word} CLI has a tool, except {string}', (w, group: string, except: string) => {
  const names = new Set(reply(w).result.tools.map((t: Obj) => t.name));
  const skip = except.split(',').map((s) => s.trim()).filter(Boolean);
  const missing = Object.keys(VERBS[group]).filter((v) => !skip.includes(v) && !names.has(`${group}_${v.replace(/-/g, '_')}`));
  assert.deepEqual(missing, []);
});
Then('the tool {string} requires {string}', (w, name: string, req: string) => assert.deepEqual(tool(w, name).inputSchema.required, req.split(',').map((s) => s.trim())));
Then('the argument {string} of the tool {string} is of type {string}', (w, arg: string, name: string, type: string) => assert.equal(tool(w, name).inputSchema.properties[arg].type, type));
Then('the tool {string} takes the arguments {string}', (w, name: string, args: string) => { for (const a of args.split(',').map((s) => s.trim())) assert.ok(a in tool(w, name).inputSchema.properties, a); });
Then('the annotation {string} of the tool {string} is {string}', (w, key: string, name: string, value: string) => assert.equal(String(tool(w, name).annotations[key]), value));
Then('every tool has a title and read-only and open-world hints', (w) => {
  for (const t of reply(w).result.tools) {
    assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
    assert.equal(typeof t.annotations.openWorldHint, 'boolean', t.name);
    assert.ok(t.title, t.name);
  }
  w.state.tools = reply(w).result.tools;
});

// ---- Then: a tool call ----
Then('the tool result is an error', (w) => assert.equal(reply(w).result.isError, true, JSON.stringify(reply(w))));
Then('the tool result is not an error', (w) => assert.equal(reply(w).result.isError, undefined, JSON.stringify(reply(w).result.content)));
Then('the tool result says {string}', (w, part: string) => assert.ok(reply(w).result.content[0].text.includes(part), reply(w).result.content[0].text));
Then('the tool result {string} is {string}', (w, path: string, value: string) => assert.equal(text(at(toolText(w), path)), value));
Then('the tool result has no {string}', (w, path: string) => assert.equal(at(toolText(w), path), undefined));
Then('the tool result is a list', (w) => assert.ok(Array.isArray(toolText(w))));
Then('the structured content {string} is {string}', (w, path: string, value: string) => assert.equal(text(at(reply(w).result.structuredContent, path)), value));
Then('the structured content equals the text of the result', (w) => assert.deepEqual(toolText(w), reply(w).result.structuredContent));
Then('there is no structured content', (w) => assert.equal(reply(w).result.structuredContent, undefined));

// ---- Then: the command line ----
Then('the server exits with code {int}', (w, code: number) => assert.equal(w.state.exit, code));
Then('the server says {string}', (w, part: string) => assert.ok(`${w.state.stderr ?? ''}${w.state.stdout ?? ''}`.includes(part), `${w.state.stderr}${w.state.stdout}`));

// MCP server: every port verb as a tool, over stdio (references/architecture.md section 10).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { AdapterContext, PortCli } from './ports.ts';

type Ctx = Omit<AdapterContext, 'options'>;
type Kind = 'string' | 'boolean' | 'integer' | 'strings' | 'pos';
// pos: positional argument names; flags: property -> kind (snake_case maps to --kebab-case; 'pos' is an optional trailing positional); body: sent as --body-file.
// Literal imports so the bundler includes every module the tools call.
const MODULES: Record<string, () => Promise<{ cli: PortCli }>> = {
  board: () => import('./board/index.ts'),
  forge: () => import('./forge/index.ts'),
  vcs: () => import('./vcs/index.ts'),
  dispatch: () => import('./dispatch.ts'),
  ledger: () => import('./ledger.ts'),
};

type Spec = { group: string; verb: string; pos: string[]; flags: Record<string, Kind>; doc: string; body: boolean; req: string[] };

const S = (group: string, verb: string, pos: string[], flags: Record<string, Kind>, doc: string, req: string[] = [], body = false): Spec =>
  ({ group, verb, pos, flags, doc, body, req });
const TOOLS: Record<string, Spec> = {
  board_list: S('board', 'list', [], { status: 'strings', label: 'string', search: 'string' }, 'List board items.'),
  board_get: S('board', 'get', ['id'], {}, 'Get one board item.'),
  board_create: S('board', 'create', [], { title: 'string', status: 'string', label: 'strings', parent: 'string', milestone: 'string' }, 'Create a board item; body is the description.', ['title', 'status'], true),
  board_move: S('board', 'move', ['id', 'status'], { only_from: 'string' }, 'Move an item to a status; refuses when only_from is set and the item is elsewhere.'),
  board_set: S('board', 'set', ['id', 'field'], { value: 'pos', clear: 'boolean' }, 'Set a logical field (size, priority, lane, shipped, release_version), or clear it.'),
  board_label: S('board', 'label', ['id', 'op', 'label'], {}, 'Add or remove a label (op: add|remove).'),
  board_assign: S('board', 'assign', ['id'], { user: 'pos', none: 'boolean' }, 'Assign a user, or none.'),
  board_milestone: S('board', 'milestone', ['id'], { name: 'pos', clear: 'boolean' }, 'Set the milestone of an item, or clear it.'),
  board_comment: S('board', 'comment', ['id'], { kind: 'string', ref: 'string' }, 'Comment on an item; kind stamps the marker first line (ref is its value).', [], true),
  board_comments: S('board', 'comments', ['id'], { last: 'integer', marker: 'string', kind: 'string', ref: 'string', author: 'strings', trusted: 'boolean' }, 'Read comments, newest first; kind (with ref) filters by marker; trusted keeps the binding bots and owners.'),
  board_hold: S('board', 'hold', ['id'], { kind: 'string' }, 'Hold a ticket for a human: adds the human label and posts the ask (kind is the trigger); body is the ask.', ['kind'], true),
  board_holds: S('board', 'holds', [], {}, 'Held tickets: id, kind, askedAt, replied (an owner replied after the last ask), reply.'),
  board_release: S('board', 'release', ['id'], {}, 'Release a held ticket: removes the human label.'),
  board_close: S('board', 'close', ['id'], { reason: 'string' }, 'Close an item (reason: completed|not_planned).', ['reason']),
  board_child: S('board', 'child', ['parent', 'child'], {}, 'Attach child to parent.'),
  forge_open: S('forge', 'open', [], { source: 'string', title: 'string', draft: 'boolean' }, 'Open a change request.', ['source', 'title'], true),
  forge_view: S('forge', 'view', [], { n: 'string', sha: 'string' }, 'View a change request by number n, or by sha.'),
  forge_diff: S('forge', 'diff', ['n'], {}, 'Diff of a change request.'),
  forge_list: S('forge', 'list', [], { state: 'string', limit: 'integer', since: 'string', checks: 'boolean' }, 'List change requests (state: open|merged|all; limit: the newest n; since: an ISO date; checks: include check results, otherwise checks is empty).'),
  forge_ready: S('forge', 'ready', ['n'], {}, 'Mark ready for review.'),
  forge_draft: S('forge', 'draft', ['n'], {}, 'Mark as draft.'),
  forge_sync: S('forge', 'sync', ['n'], {}, 'Bring the change request up to date with its target.'),
  forge_automerge: S('forge', 'automerge', ['n'], {}, 'Enable automerge.'),
  forge_approve: S('forge', 'approve', ['n'], {}, 'Approve a change request.'),
  forge_approvals: S('forge', 'approvals', ['n'], {}, 'Reviews of a change request: user, state, sha.'),
  forge_comment: S('forge', 'comment', ['n'], { kind: 'string', ref: 'string' }, 'Comment on a change request; kind stamps the marker first line (ref is its value).', [], true),
  forge_comments: S('forge', 'comments', ['n'], { last: 'integer', marker: 'string', kind: 'string', ref: 'string', author: 'strings', trusted: 'boolean' }, 'Read change request comments, newest first; kind (with ref) filters by marker; trusted keeps the binding bots and owners.'),
  forge_verdict: S('forge', 'verdict', ['n'], { pass: 'boolean', fail: 'boolean' }, 'Post the review report for the head (body) with its one Verdict line; with a review identity also the review status and, on pass, the approval. Exactly one of pass or fail.', [], true),
  forge_land: S('forge', 'land', ['n'], { wait: 'integer' }, 'Wait (minutes, default cycle.land_wait_minutes or 5) for the required checks, then arm or perform the merge: merged, armed, waiting or blocked.'),
  forge_queue: S('forge', 'queue', [], {}, 'Every open change request with its one next action: review, rework, land, sync, wait or escalate.'),
  forge_cut: S('forge', 'cut', ['revision', 'version'], {}, 'Ask the release workflow to cut a release line.'),
  forge_status: S('forge', 'status', ['n'], { context: 'string', state: 'string', description: 'string', url: 'string' }, 'Post a commit status (n is the sha; state: pending|success|failure).', ['context', 'state', 'description']),
  forge_runs: S('forge', 'runs', [], { ref: 'string', failed: 'boolean' }, 'List CI runs.'),
  forge_run: S('forge', 'run', ['id'], {}, 'One CI run by id.'),
  vcs_start: S('vcs', 'start', ['name'], {}, 'Start a working tree.'),
  vcs_head: S('vcs', 'head', [], {}, 'Current ref and sha.'),
  vcs_changed: S('vcs', 'changed', [], { since: 'string' }, 'Changed paths.'),
  vcs_base: S('vcs', 'base', [], {}, 'Base sha.'),
  vcs_push: S('vcs', 'push', [], {}, 'Push the current work.'),
  vcs_cut: S('vcs', 'cut', ['rev', 'release'], {}, 'Cut a release ref.'),
  vcs_tags: S('vcs', 'tags', [], { prefix: 'string' }, 'List tags.'),
  vcs_drop: S('vcs', 'drop', ['name'], {}, 'Remove a tree made by vcs_start.'),
  dispatch: S('dispatch', '', ['skill'], { ticket: 'string', cr: 'string', run: 'string', workdir: 'string', run_model: 'string', unattended: 'boolean' }, 'Start a step (skill or skill/step) on a ticket or, for a factory CR, on cr (neither for learn/improve). Prints the run\'s key and done line.'),
  ledger_runs: S('ledger', 'runs', [], { since: 'integer', skill: 'string' }, 'Runs read from heartbeats.'),
  ledger_summary: S('ledger', 'summary', [], { since: 'integer' }, 'Aggregated run measures and the learning trigger.'),
  ledger_plan: S('ledger', 'plan', [], { run: 'string' }, 'Scorers, evidence and the hard-fact cap for one run.', ['run']),
  ledger_record: S('ledger', 'record', [], { run: 'string', file: 'string' }, 'Record a judge run\'s scores file for one run.', ['run', 'file']),
  ledger_hash: S('ledger', 'hash', ['skill_dir'], {}, 'Hash of a skill folder, for the heartbeat skillHash.'),
  ledger_stale: S('ledger', 'stale', [], { max_hours: 'integer' }, 'Fails when the newest heartbeat is older than max_hours.', ['max_hours']),
};

/** Tools served only when `mcp --allow` names them: they speak as the review identity. */
export const GUARDED: Record<string, string> = { approve: 'forge_approve', status: 'forge_status' };
const served = (allow: Set<string>) => Object.keys(TOOLS).filter((n) => !Object.values(GUARDED).includes(n) || allow.has(n));
/** `--allow approve,status` as tool names; unknown words throw. */
export function allowList(arg: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const w of (arg ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!GUARDED[w]) throw new Error(`--allow takes ${Object.keys(GUARDED).join(',')}; not ${w}`);
    out.add(GUARDED[w]);
  }
  return out;
}

/** Legacy protocol versions (initialize handshake), newest first; the server uses only features common to all. */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
/** Modern protocol versions (per-request `_meta`, no handshake). */
export const MODERN_VERSIONS = ['2026-07-28'];
const META = 'io.modelcontextprotocol/';
const SERVER_INFO = () => ({ name: 'agentic-sdlc', version: version() });

// Tool annotations come from these sets, keyed by tool name; no per-tool boilerplate.
const READ = new Set(['board_list', 'board_get', 'board_comments', 'board_holds', 'forge_queue', 'forge_view', 'forge_diff', 'forge_list', 'forge_approvals', 'forge_comments', 'forge_runs', 'forge_run',
  'vcs_head', 'vcs_changed', 'vcs_base', 'vcs_tags', 'ledger_runs', 'ledger_summary', 'ledger_plan', 'ledger_hash', 'ledger_stale']);
const DESTRUCTIVE = new Set(['board_close', 'vcs_drop']);
const IDEMPOTENT = new Set(['board_release', 'forge_land', 'board_move', 'board_set', 'board_label', 'board_assign', 'board_milestone', 'board_close', 'forge_ready', 'forge_draft', 'forge_sync', 'forge_automerge',
  'forge_approve', 'forge_status', 'vcs_push', 'vcs_drop', 'ledger_record']);
const LOCAL = new Set(['vcs_start', 'vcs_head', 'vcs_changed', 'vcs_base', 'vcs_tags', 'vcs_drop', 'ledger_hash']); // never reach an external system
const annotations = (name: string) => {
  const readOnlyHint = READ.has(name);
  return {
    title: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
    readOnlyHint,
    ...(readOnlyHint ? {} : { destructiveHint: DESTRUCTIVE.has(name), idempotentHint: IDEMPOTENT.has(name) }),
    openWorldHint: !LOCAL.has(name),
  };
};

const schema = (s: Spec) => {
  const properties: Record<string, object> = {};
  for (const p of s.pos) properties[p] = { type: 'string' };
  for (const [k, t] of Object.entries(s.flags)) properties[k] = t === 'strings' ? { type: 'array', items: { type: 'string' } } : { type: t === 'pos' ? 'string' : t };
  if (s.body) properties.body = { type: 'string' };
  return { type: 'object', properties, required: [...s.pos, ...s.req, ...(s.body ? ['body'] : [])], additionalProperties: false };
};

/** The first argument that breaks the published inputSchema, as a message; undefined when all is well. */
function badArgument(s: Spec, args: unknown): string | undefined {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return 'arguments must be an object';
  const a = args as Record<string, unknown>;
  const sch = schema(s);
  for (const k of sch.required) if (a[k] === undefined || a[k] === null) return `missing required argument '${k}'`;
  for (const [k, v] of Object.entries(a)) {
    const p = (sch.properties as Record<string, any>)[k];
    if (!p) return `unknown argument '${k}'`;
    if (v === null) continue;
    const okType = p.type === 'string' ? typeof v === 'string'
      : p.type === 'boolean' ? typeof v === 'boolean'
      : p.type === 'integer' ? Number.isInteger(v)
      : p.type === 'number' ? typeof v === 'number' && Number.isFinite(v)
      : Array.isArray(v) && v.every((x) => typeof x === 'string');
    if (!okType) return `argument '${k}' must be ${p.type === 'array' ? 'an array of strings' : `a ${p.type}`}`;
  }
  return undefined;
}

const wire = (k: string) => '--' + k.replace(/_/g, '-');

// Output capture swaps process.stdout/stderr.write, so tool calls run one at a time.
let queue: Promise<unknown> = Promise.resolve();
const realWrite = process.stdout.write.bind(process.stdout);

function capture(fn: () => Promise<number>) {
  const run = async () => {
    const o = process.stdout.write, e = process.stderr.write;
    let out = '', err = '';
    process.stdout.write = ((c: string | Uint8Array) => ((out += c), true)) as typeof o;
    process.stderr.write = ((c: string | Uint8Array) => ((err += c), true)) as typeof e;
    try { return { code: await fn(), out, err }; }
    catch (x) { return { code: 1, out, err: err + (x as Error).message }; }
    finally { process.stdout.write = o; process.stderr.write = e; }
  };
  const p = queue.then(run, run);
  queue = p;
  return p;
}

async function callTool(name: string, args: Record<string, unknown>, ctx: Ctx, allow: Set<string>) {
  const s = served(allow).includes(name) ? TOOLS[name] : undefined;
  const fail = (text: string) => ({ content: [{ type: 'text', text }], isError: true });
  if (!s) return fail(`unknown tool '${name}'`);
  if (name === 'dispatch' && args.ticket === undefined && args.cr === undefined && args.skill !== 'learn/improve') return fail('dispatch: ticket or cr required');
  const missing = [...s.pos, ...s.req, ...(s.body ? ['body'] : [])].filter((k) => args[k] === undefined);
  if (missing.length) return fail(`${name}: ${missing.join(', ')} required`);
  if (name === 'forge_view' && args.n === undefined && args.sha === undefined) return fail('forge_view: n or sha required');
  const argv: string[] = s.verb ? [s.verb] : [];
  argv.push(...s.pos.map((p) => String(args[p])));
  if (name === 'forge_view' && args.n !== undefined) argv.push(String(args.n));
  for (const [k, t] of Object.entries(s.flags)) {
    const v = args[k];
    if (v === undefined || v === null || v === false || k === 'n') continue;
    if (t === 'pos') { if (!args.clear && !args.none) argv.push(String(v)); }
    else if (t === 'boolean') argv.push(wire(k));
    else for (const x of t === 'strings' ? (v as unknown[]) : [v]) argv.push(wire(k), String(x));
  }
  let dir: string | undefined;
  if (s.body) {
    dir = mkdtempSync(join(tmpdir(), 'agentic-sdlc-mcp-'));
    writeFileSync(join(dir, 'body.md'), String(args.body));
    argv.push('--body-file', join(dir, 'body.md'));
  }
  try {
    const { cli } = await MODULES[s.group]();
    const r = await capture(() => cli(argv, ctx));
    if (r.code === 0) {
      let structured: unknown;
      try { structured = JSON.parse(r.out); } catch { /* text only */ }
      const obj = structured && typeof structured === 'object' && !Array.isArray(structured);
      return { content: [{ type: 'text', text: r.out }], ...(obj ? { structuredContent: structured } : {}) };
    }
    return fail((r.err || r.out).trim() || `exit ${r.code}`);
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

const version = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;

/** A request is modern when its `_meta` carries the per-request protocol fields (spec 2026-07-28, basic/index "_meta"). */
const isModern = (msg: any) => {
  const m = msg.params?._meta;
  return m !== null && typeof m === 'object' && (`${META}protocolVersion` in m || `${META}clientCapabilities` in m);
};

/** One JSON-RPC message in, the response out (null for notifications). */
export async function handle(msg: any, ctx: Ctx, allow: Set<string> = new Set()): Promise<object | null> {
  const id = msg?.id;
  const ok = (result: object) => ({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string, data?: object) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
  if (!msg || typeof msg.method !== 'string') return err(-32600, 'invalid request');
  if (id === undefined) return null; // notifications/initialized and any other notification
  const toolCall = async (): Promise<{ e?: object; r?: any }> => {
    const name = msg.params?.name;
    const s = typeof name === 'string' && served(allow).includes(name) ? TOOLS[name] : undefined;
    if (!s) return { e: err(-32602, `unknown tool '${String(name)}'`) };
    const bad = badArgument(s, msg.params?.arguments ?? {});
    if (bad) return { e: err(-32602, `${name}: ${bad}`) };
    return { r: await callTool(name, msg.params?.arguments ?? {}, ctx, allow) };
  };
  if (msg.method !== 'initialize' && (msg.method === 'server/discover' || isModern(msg))) {
    // 2026-07-28: stateless; every request names its version and capabilities; every result says its resultType.
    const m = msg.params?._meta;
    const v = m?.[`${META}protocolVersion`];
    if (typeof v !== 'string') return err(-32602, `_meta '${META}protocolVersion' is required`);
    const caps = m[`${META}clientCapabilities`];
    if (caps === null || typeof caps !== 'object' || Array.isArray(caps)) return err(-32602, `_meta '${META}clientCapabilities' is required`);
    if (!MODERN_VERSIONS.includes(v)) return err(-32022, 'Unsupported protocol version', { supported: [...MODERN_VERSIONS, ...PROTOCOL_VERSIONS], requested: v });
    const done = (result: object) => ok({ resultType: 'complete', ...result, _meta: { [`${META}serverInfo`]: SERVER_INFO() } });
    switch (msg.method) {
      case 'server/discover':
        return done({ supportedVersions: [...MODERN_VERSIONS, ...PROTOCOL_VERSIONS], capabilities: { tools: {} }, ttlMs: 0, cacheScope: 'public' });
      case 'tools/list':
        if (msg.params?.cursor !== undefined) return err(-32602, 'Invalid cursor'); // this server never issues one
        return done({ tools: served(allow).map((name) => ({ name, description: TOOLS[name].doc, title: annotations(name).title, inputSchema: schema(TOOLS[name]), annotations: annotations(name) })), ttlMs: 0, cacheScope: 'public' });
      case 'tools/call': {
        const { e, r } = await toolCall();
        return e ?? done(r);
      }
      default: return err(-32601, `method not found: ${msg.method}`); // ping, logging/setLevel and the rest are not part of this revision's tool-only surface
    }
  }
  switch (msg.method) {
    case 'initialize':
      return ok({ protocolVersion: PROTOCOL_VERSIONS.includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : PROTOCOL_VERSIONS[0], serverInfo: SERVER_INFO(), capabilities: { tools: {} } });
    case 'ping': return ok({});
    case 'tools/list':
      return ok({ tools: served(allow).map((name) => ({ name, description: TOOLS[name].doc, title: annotations(name).title, inputSchema: schema(TOOLS[name]), annotations: annotations(name) })) });
    case 'tools/call': {
      const { e, r } = await toolCall();
      return e ?? ok(r);
    }
    default: return err(-32601, `method not found: ${msg.method}`);
  }
}

export const cli: PortCli = async (argv, ctx) => {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`usage: agentic-sdlc mcp [--allow approve,status]
  JSON-RPC over stdio, one message per line.
  --allow: also serve forge_approve and/or forge_status (review identity only).`);
    return 0;
  }
  const val = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  let allow: Set<string>;
  try { allow = allowList(val('--allow')); } catch (e) { console.error((e as Error).message); return 2; }
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    let msg: any, r: object | null;
    try { msg = JSON.parse(line); } catch { realWrite(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) + '\n'); continue; }
    try { r = await handle(msg, ctx, allow); }
    catch (e) { r = { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: (e as Error).message } }; }
    if (r) realWrite(JSON.stringify(r) + '\n');
  }
  return 0;
};

// MCP server: every port verb as a tool, over stdio or a minimal HTTP endpoint (references/architecture.md section 10).
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
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
  board_comment: S('board', 'comment', ['id'], {}, 'Comment on an item.', [], true),
  board_comments: S('board', 'comments', ['id'], { last: 'integer', marker: 'string', author: 'strings' }, 'Read comments, newest first.'),
  board_close: S('board', 'close', ['id'], { reason: 'string' }, 'Close an item (reason: completed|not_planned).', ['reason']),
  board_child: S('board', 'child', ['parent', 'child'], {}, 'Attach child to parent.'),
  forge_open: S('forge', 'open', [], { source: 'string', title: 'string', draft: 'boolean' }, 'Open a change request.', ['source', 'title'], true),
  forge_view: S('forge', 'view', [], { n: 'string', sha: 'string' }, 'View a change request by number n, or by sha.'),
  forge_diff: S('forge', 'diff', ['n'], {}, 'Diff of a change request.'),
  forge_list: S('forge', 'list', [], { state: 'string' }, 'List change requests (state: open|merged|all).'),
  forge_ready: S('forge', 'ready', ['n'], {}, 'Mark ready for review.'),
  forge_draft: S('forge', 'draft', ['n'], {}, 'Mark as draft.'),
  forge_sync: S('forge', 'sync', ['n'], {}, 'Bring the change request up to date with its target.'),
  forge_automerge: S('forge', 'automerge', ['n'], {}, 'Enable automerge.'),
  forge_approve: S('forge', 'approve', ['n'], {}, 'Approve a change request.'),
  forge_comment: S('forge', 'comment', ['n'], {}, 'Comment on a change request.', [], true),
  forge_status: S('forge', 'status', ['n'], { context: 'string', state: 'string', description: 'string', url: 'string' }, 'Post a commit status (n is the sha; state: pending|success|failure).', ['context', 'state', 'description']),
  forge_runs: S('forge', 'runs', [], { ref: 'string', failed: 'boolean' }, 'List CI runs.'),
  vcs_start: S('vcs', 'start', ['name'], {}, 'Start a working tree.'),
  vcs_head: S('vcs', 'head', [], {}, 'Current ref and sha.'),
  vcs_changed: S('vcs', 'changed', [], { since: 'string' }, 'Changed paths.'),
  vcs_base: S('vcs', 'base', [], {}, 'Base sha.'),
  vcs_push: S('vcs', 'push', [], {}, 'Push the current work.'),
  vcs_cut: S('vcs', 'cut', ['rev', 'release'], {}, 'Cut a release ref.'),
  vcs_tag: S('vcs', 'tag', ['name', 'rev'], {}, 'Tag a revision.'),
  vcs_tags: S('vcs', 'tags', [], { prefix: 'string' }, 'List tags.'),
  vcs_drop: S('vcs', 'drop', ['name'], {}, 'Remove a tree made by vcs_start.'),
  dispatch: S('dispatch', '', ['skill'], { ticket: 'string', cr: 'string', workdir: 'string', run_model: 'string', unattended: 'boolean' }, 'Resolve how to run a skill on a ticket.', ['ticket']),
  ledger_runs: S('ledger', 'runs', [], { since: 'integer', skill: 'string' }, 'Runs read from heartbeats.'),
  ledger_summary: S('ledger', 'summary', [], { since: 'integer' }, 'Aggregated run measures.'),
};

const schema = (s: Spec) => {
  const properties: Record<string, object> = {};
  for (const p of s.pos) properties[p] = { type: 'string' };
  for (const [k, t] of Object.entries(s.flags)) properties[k] = t === 'strings' ? { type: 'array', items: { type: 'string' } } : { type: t === 'pos' ? 'string' : t };
  if (s.body) properties.body = { type: 'string' };
  return { type: 'object', properties, required: [...s.pos, ...s.req, ...(s.body ? ['body'] : [])], additionalProperties: false };
};

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

async function callTool(name: string, args: Record<string, unknown>, ctx: Ctx) {
  const s = TOOLS[name];
  const fail = (text: string) => ({ content: [{ type: 'text', text }], isError: true });
  if (!s) return fail(`unknown tool '${name}'`);
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
    return r.code === 0 ? { content: [{ type: 'text', text: r.out }] } : fail((r.err || r.out).trim() || `exit ${r.code}`);
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

const version = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string;

/** One JSON-RPC message in, the response out (null for notifications). */
export async function handle(msg: any, ctx: Ctx): Promise<object | null> {
  const id = msg?.id;
  const ok = (result: object) => ({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || typeof msg.method !== 'string') return err(-32600, 'invalid request');
  if (id === undefined) return null; // notifications/initialized and any other notification
  switch (msg.method) {
    case 'initialize':
      return ok({ protocolVersion: '2025-06-18', serverInfo: { name: 'agentic-sdlc', version: version() }, capabilities: { tools: {} } });
    case 'ping': return ok({});
    case 'tools/list':
      return ok({ tools: Object.entries(TOOLS).map(([name, s]) => ({ name, description: s.doc, inputSchema: schema(s) })) });
    case 'tools/call':
      return ok(await callTool(String(msg.params?.name), msg.params?.arguments ?? {}, ctx));
    default: return err(-32601, `method not found: ${msg.method}`);
  }
}

const digest = (s: string) => createHash('sha256').update(s).digest();

export function startHttp(ctx: Ctx, port: number, host = '127.0.0.1'): Promise<Server> {
  const token = ctx.env.AGENTIC_SDLC_MCP_TOKEN;
  if (!token) return Promise.reject(new Error('AGENTIC_SDLC_MCP_TOKEN is required for --http'));
  const server = createServer(async (req, res) => {
    const send = (code: number, body?: object) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body ? JSON.stringify(body) : undefined); };
    const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
    if (!timingSafeEqual(digest(given), digest(token))) return send(401, { error: 'unauthorized' });
    if (req.method !== 'POST' || req.url !== '/mcp') return send(404, { error: 'POST /mcp only' });
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req as AsyncIterable<Buffer>) { size += c.byteLength; if (size > 4_000_000) return send(413); chunks.push(c); }
    const raw = Buffer.concat(chunks).toString('utf8');
    let msg: unknown;
    try { msg = JSON.parse(raw); } catch { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
    let r: object | null;
    try { r = await handle(msg, ctx); }
    catch (e) { r = { jsonrpc: '2.0', id: (msg as any)?.id ?? null, error: { code: -32603, message: (e as Error).message } }; }
    r ? send(200, r) : send(202);
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => resolve(server)); });
}

export const cli: PortCli = async (argv, ctx) => {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`usage: agentic-sdlc mcp [--http [--port 8787] [--host 127.0.0.1]]
  default: JSON-RPC over stdio, one message per line.
  --http: POST /mcp, JSON responses only (no SSE); requires Authorization: Bearer $AGENTIC_SDLC_MCP_TOKEN.`);
    return 0;
  }
  const val = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--http')) {
    try {
      const host = val('--host') ?? '127.0.0.1';
      const server = await startHttp(ctx, Number(val('--port') ?? 8787), host);
      console.error(`agentic-sdlc mcp listening on http://${host}:${(server.address() as { port: number }).port}/mcp`);
      await new Promise((r) => server.once('close', r));
      return 0;
    } catch (e) { console.error((e as Error).message); return 1; }
  }
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    let msg: any, r: object | null;
    try { msg = JSON.parse(line); } catch { realWrite(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }) + '\n'); continue; }
    try { r = await handle(msg, ctx); }
    catch (e) { r = { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: (e as Error).message } }; }
    if (r) realWrite(JSON.stringify(r) + '\n');
  }
  return 0;
};

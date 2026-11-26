// `agentic-sdlc next`: what one cycle does, in order (references/architecture.md 11.3). The routing rules are data in the
// skill pack (`skills/sdlc/routes.yml`); this file reads the board, the holds, the forge queue and the ledger and evaluates them.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import type { Binding, Board, CR, Comment, Forge, Item, PortCli, QueueRow } from './ports.ts';
import { ownersFor } from './ports.ts';
import { isMarked } from './comments.ts';
import { flagError } from './forge/util.ts';
import { queue } from './forge/flow.ts';
import { errorBudget, flattenRuns, headSha, learningState, parseHeartbeat, readLedger, ticketUse, writeHeartbeat, type LedgerRun } from './ledger.ts';

type Cond = { [k: string]: unknown; not?: Cond };
type Row = Cond & { step?: string; group?: string };
type Action = { step?: string; group?: string; no_ticket?: boolean; by_person?: string };
type Sort = string | { label: string };
type Group = { name: string; step?: string; from?: string; sort?: Sort[]; cap?: unknown; fill?: { status: string; to: unknown }; skip_when_budget_exhausted?: string };
type Guard = { step: string; trigger: string; no_ticket?: string };
export interface Routes { tickets: Row[]; crs: Record<string, Action>; groups: Group[]; navigator: string[]; guards?: { over_budget?: Guard; repeat?: Guard } }

export interface Work { step: string; ticket?: string; cr?: string; head?: string; run?: string; runModel?: string; trigger?: string; reason: string }
export type Problem = { step: string; id?: string; msg: string };
export interface NextResult { idle: boolean; holds: string[]; work: Work[]; later: Work[]; errors: Problem[]; budget?: 'exhausted' }

/** The routes of the installed pack, else the package's own copy (an install from before the file). */
export function readRoutes(root: string): Routes {
  const installed = join(root, '.agents', 'skills', 'sdlc', 'routes.yml');
  const file = existsSync(installed) ? installed : new URL('../skills/sdlc/routes.yml', import.meta.url);
  return parse(readFileSync(file, 'utf8')) as Routes;
}

const valueAt = (b: unknown, path: string): unknown =>
  path.split('.').reduce<any>((v, k) => (Array.isArray(v) && /^-?\d+$/.test(k) ? v.at(Number(k)) : v?.[k]), b); // eslint-disable-line @typescript-eslint/no-explicit-any

/** `{$a.b}` filled from the binding, `{id}` with the ticket id; undefined when a binding value is unset. */
export function template(s: unknown, b: Binding, id = ''): string | undefined {
  if (s === undefined || s === null) return undefined;
  let missing = false;
  const out = String(s).replace(/\{\$([\w.-]+)\}|\{id\}/g, (_m, p?: string) => {
    if (!p) return id;
    const v = valueAt(b, p);
    if (v === undefined || v === null || v === '') missing = true;
    return String(v);
  });
  return missing ? undefined : out;
}

/** The ids a body names on `Blocked by <id>` lines (skills/sdlc/references/statuses.md). */
const blockers = (body = '') => [...body.matchAll(/^Blocked by #?(\S+)\s*$/gim)].map((m) => m[1]);

interface State {
  b: Binding; items: Item[]; statusOf: Map<string, string>; crsOf: Map<string, CR[]>; bots: Set<string>;
}

const closed = (s: State, id: string) => (s.b.board.done_statuses ?? []).includes(s.statusOf.get(id) ?? '');
const byPerson = (s: State, cr: CR) => !s.bots.has(String(cr.author).toLowerCase());

/** Every condition of the row holds for the ticket (skills/sdlc/routes.yml names the vocabulary). */
export function holdsFor(c: Cond, t: Item, s: State): boolean {
  return Object.entries(c).every(([k, v]) => {
    switch (k) {
      case 'step': case 'group': return true;
      case 'status': return [v].flat().includes(t.status);
      case 'label': { const l = template(v, s.b, t.id); return l !== undefined && t.labels.includes(l); }
      case 'children': return v === 'none' ? !t.children.length : v === 'some' ? t.children.length > 0 : v === 'all-closed' ? t.children.length > 0 && t.children.every((x) => closed(s, x)) : false;
      case 'blocked': return blockers(t.body).some((x) => !closed(s, x)) === v;
      case 'cr': { const crs = s.crsOf.get(t.id) ?? []; return v === 'none' ? !crs.length : v === 'open' ? crs.length > 0 : v === 'by-person' ? crs.some((x) => byPerson(s, x)) : false; }
      case 'no_open_title': { const title = template(v, s.b, t.id); return title !== undefined && !s.items.some((i) => i.title === title); }
      case 'not': return !holdsFor(v as Cond, t, s);
      default: {
        const f = (t.fields as Record<string, string | undefined>)[k] ?? (t as unknown as Record<string, string | undefined>)[k];
        return v === 'set' ? !!f : v === 'unset' ? !f : f !== undefined && f === template(v, s.b, t.id);
      }
    }
  });
}

const describe = (t: Item, r: Row) => [t.status, ...Object.entries(r).filter(([k]) => !['status', 'step', 'group'].includes(k)).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`)].join('; ');

export interface NextDeps {
  b: Binding; root: string; board: Board; forge?: Forge;
  classOf?: (cr: CR) => Promise<{ class: string; who: string[] }>;
  head?: () => Promise<string | undefined>;
  now?: number; routes?: Routes;
}

/** Reads the state once and returns the cycle's work in the order of the routes, the holds to release and what could not be read. */
export async function next(d: NextDeps): Promise<NextResult> {
  const { b, board } = d;
  const now = d.now ?? Date.now();
  const routes = d.routes ?? readRoutes(d.root);
  const errors: Problem[] = [];
  const hbTicket = b.heartbeat?.ticket;
  const human = b.board.labels?.human;
  const read = async <T>(what: string, f: () => Promise<T>): Promise<T | undefined> => {
    try { return await f(); } catch (e) { errors.push({ step: 'next', msg: `${what}: ${(e as Error).message}` }); return undefined; }
  };

  // The board: open tickets; the full item (body, children) where a row reads them; the status of each child and blocker.
  const items = (await board.list({})).filter((i) => i.id !== hbTicket);
  const statusOf = new Map(items.map((i) => [i.id, i.status]));
  const deep = new Set(routes.tickets.filter((r) => r.children !== undefined || r.blocked !== undefined).flatMap((r) => [r.status].flat() as string[]));
  for (const [n, t] of items.entries()) if (deep.has(t.status)) items[n] = (await read(`board get ${t.id}`, () => board.get(t.id))) ?? t;
  for (const id of new Set(items.flatMap((t) => [...t.children, ...blockers(t.body)]))) {
    if (!statusOf.has(id)) { const got = await read(`board get ${id}`, () => board.get(id)); if (got) statusOf.set(id, got.status); }
  }

  const holds = (await read('board holds', async () => (await import('./board/index.ts')).holds(board, b))) ?? [];
  const released = new Set(holds.filter((h) => h.replied).map((h) => h.id));

  // The forge: open CRs once, then their queue rows (`forge queue`), comments read once each.
  const crsOf = new Map<string, CR[]>();
  let rows: QueueRow[] = [];
  const crs: CR[] = [];
  const said = new Map<string, Promise<Comment[]>>();
  if (d.forge) {
    const f = d.forge;
    const listed = await read('forge list', () => f.list({ state: 'open', checks: true }));
    if (listed) {
      crs.push(...listed);
      for (const cr of listed) for (const id of cr.closes) crsOf.set(id, [...(crsOf.get(id) ?? []), cr]);
      const port = { ...f, list: async () => listed, comments: (n: string) => { if (!said.has(n)) said.set(n, f.comments(n)); return said.get(n)!; } } as Forge;
      const ticket = async (id: string) => items.find((i) => i.id === id) ?? board.get(id);
      rows = (await read('forge queue', () => queue(port, b, d.classOf ?? (async () => ({ class: 'guardrail', who: [] })), now,
        async (id) => !(b.board.done_statuses ?? []).includes((await ticket(id)).status),
        async (id) => !!human && (await ticket(id)).labels.includes(human)))) ?? [];
      for (const r of rows) if (r.release && r.ticket) released.add(r.ticket);
    }
  }

  // The ledger: learning, spend per ticket, the heartbeats a repeat failure is read from.
  const o = ownersFor(b.owners, 'board');
  const comments = hbTicket ? (await read('ledger', () => readLedger(board, hbTicket, o.bots, [...o.product, ...o.factory]))) : undefined;
  const all = comments ? flattenRuns(comments) : [];
  const learning = comments ? learningState(comments, b.learning?.every_cycles, b.learning?.enabled === true) : { due: false, judge: false };
  const spend = new Map(ticketUse(all, b.cycle?.max_tokens_per_ticket).tickets.filter((t) => t.overBudget).map((t) => [t.ticket, t]));
  const exhausted = b.product?.slo ? (await read('ledger measures', async () => errorBudget(await board.list({ state: 'all' }), b, now)))?.exhausted === true : false;

  const s: State = { b, items, statusOf, crsOf, bots: new Set(ownersFor(b.owners, 'forge').bots.map((x) => x.toLowerCase())) };
  const trusted = new Set(Object.values(ownersFor(b.owners, 'forge')).flat().map((x) => x.toLowerCase()));
  const groups = new Map<string, Work[]>();
  const push = (g: string | undefined, w: Work) => { if (g) groups.set(g, [...(groups.get(g) ?? []), w]); };

  /** A queue row as the routes' `crs` say, for its ticket or for a CR with none. */
  const fromQueue = async (q: QueueRow, ticket?: string) => {
    const act = routes.crs[q.action];
    const cr = crs.find((c) => c.n === q.n);
    if (!act?.step || (!ticket && act.no_ticket === false)) return;
    let step = act.step, head: string | undefined;
    if (act.by_person && cr && byPerson(s, cr)) {
      step = act.by_person;
      head = cr.headSha;
      // Once per head: a trusted comment of that kind for the head already asks.
      const cs = (await read(`forge comments ${q.n}`, () => (said.get(q.n) ?? d.forge!.comments(q.n)))) ?? [];
      if (cs.some((c) => trusted.has(String(c.author).toLowerCase()) && isMarked(c.body, step as 'note', head))) return;
    }
    push(act.group, { step, ...(ticket ? { ticket } : {}), cr: q.n, ...(head ? { head } : {}), reason: `CR ${q.n}: ${q.action}: ${q.reason}${q.action === 'escalate' ? `; reworks ${q.reworks}` : ''}` });
  };

  for (const t of items) {
    if (human && t.labels.includes(human) && !released.has(t.id)) continue;
    const row = routes.tickets.find((r) => holdsFor(r, t, s));
    if (!row?.step) continue;
    if (row.step === 'queue') {
      const q = rows.find((r) => r.n === (crsOf.get(t.id) ?? [])[0]?.n);
      if (q) await fromQueue(q, t.id);
    } else push(row.group, { step: row.step, ticket: t.id, reason: describe(t, row) });
  }
  for (const q of rows) if (!q.ticket) await fromQueue(q);

  // The ledger's own entries: learn/judge per unscored run in the heartbeats since the newest holding a judge run.
  const judged = () => {
    if (!learning.judge || !comments) return [];
    const beats = comments.filter((c) => parseHeartbeat(c.body));
    const last = beats.findIndex((c) => (parseHeartbeat(c.body).runs ?? []).some((r: LedgerRun) => r.skill === 'learn/judge'));
    const window = new Set(last < 0 ? beats : beats.slice(0, last + 1));
    return flattenRuns(comments.filter((c) => !parseHeartbeat(c.body) || window.has(c)))
      .filter((r) => r.skill !== 'learn/judge' && r.score === undefined && r.scores?.['done-conditions'] === undefined);
  };

  const item = (id?: string) => items.find((i) => i.id === id);
  const unblocks = new Set(items.flatMap((t) => blockers(t.body)));
  const rank = (w: Work, k: Sort): number => {
    const t = item(w.ticket);
    if (!t) return 0;
    if (typeof k === 'object') { const l = template(k.label, b, t.id); return l !== undefined && t.labels.includes(l) ? 0 : 1; }
    if (k === 'priority') { const i = (b.priorities ?? []).indexOf(t.fields.priority ?? ''); return i < 0 ? Infinity : i; }
    if (k === 'unblocks') return unblocks.has(t.id) ? 0 : 1;
    if (k === 'oldest') return Date.parse(t.createdAt) || 0;
    return 0;
  };

  const ordered: Work[] = [];
  for (const g of routes.groups) {
    let list: Work[] = g.from === 'unscored-runs' ? judged().map((r) => ({ step: g.step!, ticket: r.ticket || hbTicket, ...(r.cr ? { cr: r.cr } : {}), run: r.id, runModel: r.model, reason: `run ${r.id} has no score` }))
      : g.from === 'learning-due' ? (learning.due ? [{ step: g.step!, reason: 'learning.due' }] : [])
        : [...(groups.get(g.name) ?? [])];
    if (g.sort) { const keys = g.sort; list = list.map((w, i) => ({ w, i })).sort((x, y) => { for (const k of keys) { const c = rank(x.w, k) - rank(y.w, k); if (c) return c; } return x.i - y.i; }).map((x) => x.w); }
    const skip = exhausted && g.skip_when_budget_exhausted ? template(g.skip_when_budget_exhausted, b) : undefined;
    if (skip) list = list.filter((w) => !item(w.ticket)?.labels.includes(skip));
    if (g.cap !== undefined) list = list.slice(0, Math.max(0, Number(template(g.cap, b) ?? Infinity)));
    if (g.fill) list = list.slice(0, Math.max(0, Number(template(g.fill.to, b) ?? 0) - items.filter((i) => i.status === g.fill!.status).length));
    ordered.push(...list);
  }

  // Guards: a dispatch for a ticket over its token budget, or for a step that keeps failing on this factory, is replaced.
  const navigator = new Set(routes.navigator ?? []);
  const limit = Number(b.cycle?.failure_limit) || 0;
  const cycles = (comments ?? []).map((c) => parseHeartbeat(c.body)).filter((hb) => hb && (hb.kind ?? 'cycle') === 'cycle').slice(0, limit);
  const head = limit && cycles.length === limit && routes.guards?.repeat ? await read('vcs head', async () => (d.head ? d.head() : undefined)) : undefined;
  const failed = (hb: any) => new Set([...(hb.errors ?? []).map((e: Problem) => `${e.step}\0${e.id ?? ''}`), ...(hb.runs ?? []).filter((r: LedgerRun) => r.outcome !== 'done').map((r: LedgerRun) => `${r.skill}\0${r.ticket || r.cr || ''}`)]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const repeats = (w: Work) => !!head && cycles.every((hb) => hb.factory === head && failed(hb).has(`${w.step}\0${w.ticket ?? w.cr ?? ''}`));
  const guarded = ordered.map((w): Work => {
    if (navigator.has(w.step)) return w;
    const money = routes.guards?.over_budget, repeat = routes.guards?.repeat;
    const use = w.ticket ? spend.get(w.ticket) : undefined;
    if (money && use) return { step: money.step, ticket: w.ticket, trigger: money.trigger, reason: `${w.step} held back: ${use.tokens} tokens in ${use.runs} runs, over cycle.max_tokens_per_ticket` };
    if (repeat && repeats(w)) return { step: w.ticket ? repeat.step : repeat.no_ticket ?? repeat.step, ...(w.ticket ? { ticket: w.ticket } : {}), ...(w.cr ? { cr: w.cr } : {}), trigger: repeat.trigger, reason: `${w.step} failed in each of the last ${limit} heartbeats on this factory` };
    return w;
  });

  // At most parallel_agents dispatches start now; the rest start as runs finish. The navigator's own steps run now.
  const cap = Number(b.parallel_agents) > 0 ? Number(b.parallel_agents) : Infinity;
  const work: Work[] = [], later: Work[] = [];
  for (const w of guarded) (navigator.has(w.step) || work.filter((x) => !navigator.has(x.step)).length < cap ? work : later).push(w);
  const release = [...released];
  return { idle: !work.length && !later.length && !release.length && !errors.length, holds: release, work, later, errors, ...(exhausted ? { budget: 'exhausted' as const } : {}) };
}

const USAGE = 'usage: agentic-sdlc next [--ticket <id>] [--idle-exit]';

export const cli: PortCli = async (argv, ctx) => {
  let a;
  try { a = parseArgs({ args: argv, options: { ticket: { type: 'string' }, 'idle-exit': { type: 'boolean' } } }); } catch (e) { console.error(`${flagError(e as Error)}\n${USAGE}`); return 2; }
  try {
    const b = ctx.binding;
    const { createBoard } = await import('./board/index.ts');
    const board = createBoard({ ...ctx, options: b.board.options });
    let forge: Forge | undefined, classOf: NextDeps['classOf'];
    const errors: Problem[] = [];
    try {
      const { createForge } = await import('./forge/index.ts');
      forge = createForge({ ...ctx, options: b.forge.options });
      const { depsOf, approvalWho } = await import('./gates.ts');
      const gd = depsOf(ctx);
      classOf = (cr) => approvalWho(gd, cr);
    } catch (e) { errors.push({ step: 'next', msg: `forge: ${(e as Error).message}` }); }
    const out = await next({ b, root: ctx.root, board, forge, classOf, head: () => headSha(ctx) });
    out.errors.unshift(...errors);
    out.idle &&= !errors.length;
    const one = a.values.ticket;
    if (one) {
      const mine = (w: Work) => w.ticket === one;
      const res = { ...out, work: out.work.filter(mine), later: out.later.filter(mine), holds: out.holds.filter((h) => h === one) };
      console.log(JSON.stringify(res, null, 2));
      return 0;
    }
    if (a.values['idle-exit'] && out.idle) {
      const o = ownersFor(b.owners, 'board');
      const comments = await readLedger(board, b.heartbeat.ticket, o.bots, [...o.product, ...o.factory]);
      const heartbeat = await writeHeartbeat({ board, b, root: ctx.root, comments, factory: await headSha(ctx), next: out });
      console.log(JSON.stringify({ ...out, heartbeat }, null, 2));
      return 0;
    }
    console.log(JSON.stringify(out, null, 2));
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
};

// The run ledger: runs read back from heartbeats (references/architecture.md 6.1). Mechanism only.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Board, Comment, PortCli } from './ports.ts';

export const HEARTBEAT_MARKER = '<!-- heartbeat -->';

/** One subagent run: a row of the heartbeat's `runs` (skills/sdlc/references/heartbeat.md). */
export interface LedgerRun {
  id: string;
  at: string;
  skill: string;
  skillHash: string;
  ticket?: string;
  cr?: string;
  tier: string;
  model: string;
  executor?: string; // executor kind: harness (default) | command | webhook | managed | assign
  ref?: string; // what dispatch printed: session id, bot run, assignment
  tokens?: number;
  cost_usd?: number;
  minutes?: number;
  outcome: string; // done | sent_back | failed | escalated | timeout
  score?: number; // 0-4: the done-conditions scorer from judge-run
  scores?: Record<string, ScoreValue>; // v6: one per scorer in .agents/scorers/
  trace?: string; // v6: run id for traces.uri
  error?: string;
}

export type ScoreValue = number | 'pass' | 'fail';
/** v6 rescore; a v5 rescore has no scorer (done-conditions) and no by (judge). */
export interface Rescore { id: string; scorer?: string; score: ScoreValue; cap?: string; by?: 'judge' | 'human' }
export const SCORE_SCORER = 'done-conditions';
/** A scorer value that counts as a failure: `fail`, or 0-1 on the 0-4 scale (a condition not met). */
export const isFail = (v: ScoreValue): boolean => v === 'fail' || (typeof v === 'number' && v <= 1);

export interface Stats { runs: number; medianScore: number | null; failureRate: number; cost_usd: number; minutes: number }
/** A repeated failure: by normalised `error`, or by `scorer` fail. */
export interface Cluster { skill: string; error?: string; scorer?: string; count: number; tickets: string[] }
export interface ScorerStats { runs: number; failRate: number; median: number | null }

export function parseHeartbeat(body: string): any | undefined {
  if (!body.trimStart().startsWith(HEARTBEAT_MARKER)) return undefined;
  const m = body.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
  if (!m) return undefined;
  try { return JSON.parse(m[1]); } catch { return undefined; }
}

/** Per run and scorer: a human grade beats any judge value regardless of time; else the newest wins. Beats newest first. */
export function pickRescores(rescores: Rescore[]): Map<string, Map<string, ScoreValue>> {
  const won = new Map<string, Rescore>();
  for (const r of rescores) {
    const k = `${r.id}\0${r.scorer ?? SCORE_SCORER}`;
    const prev = won.get(k);
    if (!prev || (r.by === 'human' && prev.by !== 'human')) won.set(k, r);
  }
  const out = new Map<string, Map<string, ScoreValue>>();
  for (const r of won.values()) out.set(r.id, (out.get(r.id) ?? new Map()).set(r.scorer ?? SCORE_SCORER, r.score));
  return out;
}

function applyRescores(r: LedgerRun, m: Map<string, ScoreValue> | undefined): LedgerRun {
  if (!m) return r;
  const s = m.get(SCORE_SCORER);
  return { ...r, scores: { ...r.scores, ...Object.fromEntries(m) }, ...(typeof s === 'number' ? { score: s } : {}) };
}

/** Runs from heartbeat comments (v5 and v6, newest first), with later `rescores` applied per scorer. */
export function flattenRuns(comments: Comment[], q: { sinceDays?: number; skill?: string; now?: number } = {}): LedgerRun[] {
  const cutoff = q.sinceDays === undefined ? -Infinity : (q.now ?? Date.now()) - q.sinceDays * 864e5;
  const beats = comments.map((c) => ({ c, hb: parseHeartbeat(c.body) })).filter((x) => x.hb);
  const rescore = pickRescores(beats.flatMap(({ hb }) => hb.rescores ?? []));
  return beats
    .flatMap(({ c, hb }) => (hb.runs ?? []).map((r: LedgerRun) => ({ ...r, at: r.at ?? hb.at ?? c.createdAt })))
    .map((r) => applyRescores(r, rescore.get(r.id)))
    .filter((r) => Date.parse(r.at) >= cutoff && (!q.skill || r.skill === q.skill));
}

/** Strips the parts of an error that differ between runs of the same mistake. */
export const normaliseError = (msg: string): string =>
  msg
    .toLowerCase()
    .replace(/(["'`]).*?\1/g, '<s>')
    .replace(/\S*[\\/]\S*/g, '<path>')
    .replace(/\b[0-9a-f]{7,40}\b/g, '<sha>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stats(rows: LedgerRun[]): Stats {
  const sum = (k: 'cost_usd' | 'minutes') => Math.round(rows.reduce((t, r) => t + (r[k] ?? 0), 0) * 100) / 100;
  return {
    runs: rows.length,
    medianScore: median(rows.flatMap((r) => (typeof r.score === 'number' ? [r.score] : []))),
    failureRate: rows.length ? rows.filter((r) => r.outcome !== 'done').length / rows.length : 0,
    cost_usd: sum('cost_usd'),
    minutes: sum('minutes'),
  };
}

function groupStats(rows: LedgerRun[], key: (r: LedgerRun) => string): Record<string, Stats> {
  const g = new Map<string, LedgerRun[]>();
  for (const r of rows) g.set(key(r), [...(g.get(key(r)) ?? []), r]);
  return Object.fromEntries([...g].map(([k, v]) => [k, stats(v)]));
}

/** Failures that share a skill and a normalised error, or a skill and a failed scorer; seen at least twice, most frequent first. */
export function clusters(rows: LedgerRun[], top = 10): Cluster[] {
  const g = new Map<string, Cluster>();
  const add = (r: LedgerRun, key: { error: string } | { scorer: string }) => {
    const k = `${r.skill}\0${JSON.stringify(key)}`;
    const c = g.get(k) ?? { skill: r.skill, ...key, count: 0, tickets: [] };
    c.count++;
    if (r.ticket && !c.tickets.includes(r.ticket)) c.tickets.push(r.ticket);
    g.set(k, c);
  };
  for (const r of rows) {
    if (r.outcome !== 'done' && r.error) add(r, { error: normaliseError(r.error) });
    for (const [scorer, v] of Object.entries(r.scores ?? {})) if (isFail(v)) add(r, { scorer });
  }
  return [...g.values()].filter((c) => c.count >= 2).sort((a, b) => b.count - a.count).slice(0, top);
}

/** Per scorer: runs it scored, share failed, median of 0-4 values (null for pass-fail). */
export function byScorer(rows: LedgerRun[]): Record<string, ScorerStats> {
  const g = new Map<string, ScoreValue[]>();
  for (const r of rows) for (const [k, v] of Object.entries(r.scores ?? {})) g.set(k, [...(g.get(k) ?? []), v]);
  return Object.fromEntries([...g].map(([k, vs]) => [k, {
    runs: vs.length,
    failRate: vs.filter(isFail).length / vs.length,
    median: median(vs.filter((v): v is number => typeof v === 'number')),
  }]));
}

export const LEARNING_SKILLS = ['judge-run', 'improve-factory', 'bench'];

/**
 * The measures the rows alone give (the rest come from the board: heartbeat.md Measures).
 * costPerCR: cost of the runs whose `cr` is merged over the distinct merged CRs (`merged` when known, else every cr).
 */
export function measures(rows: LedgerRun[], merged?: string[]) {
  const cost = (rs: LedgerRun[]) => rs.reduce((t, r) => t + (r.cost_usd ?? 0), 0);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const withCr = rows.filter((r) => r.cr);
  const crs = new Set(withCr.map((r) => r.cr!).filter((n) => !merged || merged.includes(n)));
  const total = cost(rows);
  return {
    ...(crs.size ? { costPerCR: round(cost(withCr.filter((r) => crs.has(r.cr!))) / crs.size) } : {}),
    ...(total ? { learningSpendShare: round(cost(rows.filter((r) => LEARNING_SKILLS.includes(r.skill))) / total) } : {}),
  };
}

export const summarise = (rows: LedgerRun[], merged?: string[]) => ({
  total: stats(rows),
  bySkill: groupStats(rows, (r) => r.skill),
  byModel: groupStats(rows, (r) => r.model),
  byExecutor: groupStats(rows, (r) => r.executor ?? 'harness'),
  byScorer: byScorer(rows),
  failureClusters: clusters(rows),
  measures: measures(rows, merged),
});

/** Content hash of a skill folder: sorted relative paths and LF-normalised contents. 12 hex chars. */
export function hashSkill(dir: string): string {
  const h = createHash('sha256');
  const files = (readdirSync(dir, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name))
    .map((p) => [relative(dir, p).replaceAll('\\', '/'), p])
    .sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [rel, p] of files) h.update(`${rel}\0${readFileSync(p, 'utf8').replace(/\r\n/g, '\n')}\0`);
  return h.digest('hex').slice(0, 12);
}

/** Runs from the heartbeat ticket, trusting only comments by `authors` (binding owners.bots): anyone can comment on a public board. */
export async function readRuns(board: Board, ticket: string, authors: string[], q: { sinceDays?: number; skill?: string } = {}): Promise<LedgerRun[]> {
  const trusted = authors.map((a) => a.toLowerCase());
  if (!trusted.length) throw new Error('binding owners.bots is empty: no heartbeat author is trusted');
  const beats = (await board.comments(ticket, { marker: HEARTBEAT_MARKER })).filter((c) => trusted.includes(c.author?.toLowerCase()));
  return flattenRuns(beats, q);
}

const USAGE = 'usage: ledger runs [--since <days>] [--skill <s>] | ledger summary [--since <days>] | ledger hash <skill-dir>';

export const cli: PortCli = async (argv, ctx) => {
  const [verb, ...rest] = argv;
  let a;
  try {
    a = parseArgs({ args: rest, options: { since: { type: 'string' }, skill: { type: 'string' } }, allowPositionals: true });
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const sinceDays = a.values.since === undefined ? undefined : Number(a.values.since);
  if (sinceDays !== undefined && !(sinceDays >= 0)) return (console.error(USAGE), 2);
  try {
    if (verb === 'hash') {
      if (!a.positionals[0]) return (console.error(USAGE), 2);
      console.log(JSON.stringify({ skill: a.positionals[0], hash: hashSkill(resolve(ctx.root, a.positionals[0])) }));
      return 0;
    }
    if (verb !== 'runs' && verb !== 'summary') return (console.error(USAGE), 2);
    const { createBoard } = await import('./board/index.ts');
    const board: Board = await createBoard({ ...ctx, options: ctx.binding.board.options });
    const rows = await readRuns(board, ctx.binding.heartbeat.ticket, ctx.binding.owners?.bots ?? [], { sinceDays, skill: a.values.skill });
    if (verb === 'runs') return (console.log(JSON.stringify(rows, null, 2)), 0);
    let merged: string[] | undefined;
    try {
      const { createForge } = await import('./forge/index.ts');
      const forge = await createForge({ ...ctx, options: ctx.binding.forge.options });
      // ponytail: the forge list caps merged CRs per call (e.g. 100), so older merged CRs drop out of costPerCR; page the list when the ledger outgrows it
      merged = (await forge.list({ state: 'merged' })).filter((c) => c.state === 'merged').map((c) => c.n);
    } catch { /* forge unreachable: costPerCR counts every cr */ }
    console.log(JSON.stringify(summarise(rows, merged), null, 2));
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
};

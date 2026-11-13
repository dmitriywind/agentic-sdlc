// The run ledger: runs read back from heartbeats (references/architecture.md 6.1). Mechanism only.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import type { Binding, Board, Comment, CR, Forge, PortCli } from './ports.ts';

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
  const lines = body.trimStart().split(/\r?\n/);
  while (lines.length && lines[0].startsWith('<!-- agentic-sdlc:')) lines.shift();
  body = lines.join('\n');
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

export const SCORES_MARKER = '<!-- scores -->';
export const GRADE_MARKER = 'agentic-sdlc:grade';

/** A `<!-- scores -->` comment (ledger record): one run's judge values as rescores. */
export function parseScores(body: string): Rescore[] {
  if (!body.trimStart().startsWith(SCORES_MARKER)) return [];
  const m = body.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
  let s: any;
  try { s = JSON.parse(m?.[1] ?? ''); } catch { return []; }
  if (typeof s?.run !== 'string' || !s.scores || typeof s.scores !== 'object') return [];
  return Object.entries<ScoreValue>(s.scores).map(([scorer, score]) =>
    ({ id: s.run, scorer, score, by: 'judge' as const, ...(scorer === SCORE_SCORER && s.cap ? { cap: s.cap } : {}) }));
}

/** Owner grades: lines `agentic-sdlc:grade <run-id> <scorer> <value>`. */
export const parseGrades = (body: string): Rescore[] =>
  [...body.matchAll(/agentic-sdlc:grade\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap(([, id, scorer, v]) => {
    const score: ScoreValue | undefined = v === 'pass' || v === 'fail' ? v : /^[0-4]$/.test(v) ? Number(v) : undefined;
    return score === undefined ? [] : [{ id, scorer, score, by: 'human' as const }];
  });

/**
 * Runs from heartbeat comments (v5 and v6, newest first), with later rescores applied per scorer:
 * a heartbeat's `rescores`, `<!-- scores -->` comments and grade comments. Callers filter trust first.
 */
export function flattenRuns(comments: Comment[], q: { sinceDays?: number; skill?: string; now?: number } = {}): LedgerRun[] {
  const cutoff = q.sinceDays === undefined ? -Infinity : (q.now ?? Date.now()) - q.sinceDays * 864e5;
  const beats = comments.map((c) => ({ c, hb: parseHeartbeat(c.body) })).filter((x) => x.hb);
  const rescore = pickRescores(comments.flatMap((c) => {
    const hb = parseHeartbeat(c.body);
    return hb ? hb.rescores ?? [] : isScores(c) ? parseScores(c.body) : parseGrades(c.body);
  }));
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

const isScores = (c: Comment) => c.body.trimStart().startsWith(SCORES_MARKER);

/**
 * The heartbeat ticket's ledger comments, newest first: heartbeats and scores by `authors`
 * (owners.bots), grades by `graders` (the owners). Anyone can comment on a public board.
 */
export async function readLedger(board: Board, ticket: string, authors: string[], graders: string[] = []): Promise<Comment[]> {
  const trusted = authors.map((a) => a.toLowerCase());
  if (!trusted.length) throw new Error('binding owners.bots is empty: no heartbeat author is trusted');
  const owners = graders.filter(Boolean).map((a) => a.toLowerCase());
  return (await board.comments(ticket)).filter((c) => {
    const by = c.author?.toLowerCase();
    if (parseHeartbeat(c.body) || isScores(c)) return trusted.includes(by);
    return owners.includes(by) && c.body.includes(GRADE_MARKER);
  });
}

/** Runs from the heartbeat ticket (see readLedger for whose comments count). */
export async function readRuns(board: Board, ticket: string, authors: string[], q: { sinceDays?: number; skill?: string } = {}, graders: string[] = []): Promise<LedgerRun[]> {
  return flattenRuns(await readLedger(board, ticket, authors, graders), q);
}

/**
 * The learning trigger, from the ledger alone: cyclesSince counts heartbeats newer than the one
 * holding the last improve-factory run (all of them when there is none); due at
 * learning.every_cycles; spentWeekUsd sums judge-run, improve-factory and bench runs of 7 days.
 */
export function learningState(comments: Comment[], everyCycles: number, now = Date.now(), budgetUsd?: number) {
  // newest first; review and learn runtimes write their own heartbeats (kind), which count no cycle
  const beats = comments.map((c) => parseHeartbeat(c.body)).filter((hb) => hb && (hb.kind ?? 'cycle') === 'cycle');
  const learnAt = comments.map((c) => parseHeartbeat(c.body)).filter(Boolean).findIndex((hb) => (hb.runs ?? []).some((r: LedgerRun) => r.skill === 'improve-factory'));
  // Cycles since the newest heartbeat (of any kind) that carries an improve-factory run.
  const all = comments.map((c) => parseHeartbeat(c.body)).filter(Boolean);
  const cyclesSince = learnAt < 0 ? beats.length : all.slice(0, learnAt).filter((hb) => (hb.kind ?? 'cycle') === 'cycle').length;
  const week = flattenRuns(comments, { sinceDays: 7, now }).filter((r) => LEARNING_SKILLS.includes(r.skill));
  const spentWeekUsd = Math.round(week.reduce((t, r) => t + (r.cost_usd ?? 0), 0) * 100) / 100;
  // Unset: no cap. 0: learning is off. Otherwise: under the week's budget.
  const underBudget = budgetUsd === undefined || budgetUsd === null ? true : Number(budgetUsd) > 0 && spentWeekUsd < Number(budgetUsd);
  return { due: Number(everyCycles) > 0 && cyclesSince >= Number(everyCycles) && underBudget, judge: underBudget, cyclesSince, spentWeekUsd };
}

export interface Scorer { name: string; scale: 'pass-fail' | '0-4'; applies_to: '*' | string[] }

/** `.agents/scorers/*.md` that apply to `skill`; done-conditions always (0-4) even without its file. */
export function scorersFor(root: string, skill: string): Scorer[] {
  const dir = join(root, '.agents', 'scorers');
  const out: Scorer[] = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')) : []) {
    let fm: any;
    try { fm = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(dir, f), 'utf8'))?.[1] ?? ''); } catch { continue; }
    if (!fm?.name || !['pass-fail', '0-4'].includes(fm.scale)) continue;
    if (fm.applies_to === '*' || (Array.isArray(fm.applies_to) && fm.applies_to.includes(skill))) out.push({ name: fm.name, scale: fm.scale, applies_to: fm.applies_to });
  }
  if (!out.some((s) => s.name === SCORE_SCORER)) out.unshift({ name: SCORE_SCORER, scale: '0-4', applies_to: '*' });
  return out;
}

/** Hard facts code can read, each capping done-conditions (skills/judge-run Hard facts); the lowest wins. */
export function hardFacts(run: LedgerRun, cr?: CR, required: string[] = []): { score: number; facts: string[] } | null {
  const facts: [number, string][] = [];
  if (run.outcome === 'failed' || run.outcome === 'timeout') facts.push([1, `outcome ${run.outcome}`]);
  const red = (cr?.checks ?? []).filter((c) => c.state === 'failure' && (!required.length || required.includes(c.name)));
  if (red.length) facts.push([1, `red check on the head: ${red.map((c) => c.name).join(', ')}`]);
  // ponytail: send-back, bounce, reopen and escape facts need board history; the judge reports those in its reasons.
  if (!facts.length) return null;
  return { score: Math.min(...facts.map(([s]) => s)), facts: facts.map(([, f]) => f) };
}

/** What judge-run needs for one run: the scorers that apply, evidence refs, and the cap. */
export async function plan(run: LedgerRun, o: { root: string; binding: Binding; forge?: Forge }) {
  let cr: CR | undefined;
  if (run.cr && o.forge) try { cr = await o.forge.view(run.cr); } catch { /* the cap then misses check facts */ }
  const uri = o.binding.traces?.uri;
  return {
    run,
    scorers: scorersFor(o.root, run.skill),
    evidence: {
      ...(run.ticket ? { ticket: run.ticket } : {}),
      ...(run.cr ? { cr: cr?.url ?? run.cr, diff: `agentic-sdlc forge diff ${run.cr}` } : {}),
      ...(run.trace && uri ? { trace: uri.replaceAll('{run_id}', run.trace) } : {}),
      skill: `.agents/skills/${run.skill} at skillHash ${run.skillHash}`,
    },
    cap: hardFacts(run, cr, o.binding.forge?.required_checks ?? []),
  };
}

/** Validates a judge's scores against the plan, applies the cap, returns the `<!-- scores -->` comment body. */
export function scoresComment(p: Pick<Awaited<ReturnType<typeof plan>>, 'run' | 'scorers' | 'cap'>, file: unknown, at = new Date().toISOString()): string {
  const scores = (file as any)?.scores;
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) throw new Error('scores file must be { "scores": { "<scorer>": <value> } }');
  const errors: string[] = [];
  for (const [k, v] of Object.entries<unknown>(scores)) {
    const s = p.scorers.find((x) => x.name === k);
    if (!s) errors.push(`scorer ${k} does not apply to ${p.run.skill} (applies: ${p.scorers.map((x) => x.name).join(', ')})`);
    else if (s.scale === 'pass-fail' ? v !== 'pass' && v !== 'fail' : !(Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4)) errors.push(`scorer ${k}: ${JSON.stringify(v)} is not on scale ${s.scale}`);
  }
  if (!(SCORE_SCORER in scores)) errors.push(`${SCORE_SCORER} is required`);
  if (errors.length) throw new Error(errors.join('\n'));
  const out: Record<string, ScoreValue> = { ...scores };
  let cap: string | undefined;
  if (p.cap && (out[SCORE_SCORER] as number) > p.cap.score) { out[SCORE_SCORER] = p.cap.score; cap = p.cap.facts.join('; '); }
  const reasons = (file as any).reasons;
  return `${SCORES_MARKER}\n\`\`\`json\n${JSON.stringify({ run: p.run.id, at, scores: out, ...(cap ? { cap } : {}), ...(reasons ? { reasons } : {}) })}\n\`\`\`\n`;
}

const USAGE = [
  'usage: ledger runs [--since <days>] [--skill <s>] | ledger summary [--since <days>] | ledger hash <skill-dir>',
  '       ledger plan --run <id> | ledger record --run <id> --file <scores.json> | ledger stale --max-hours <h>',
].join('\n');

export const cli: PortCli = async (argv, ctx) => {
  const [verb, ...rest] = argv;
  let a;
  try {
    a = parseArgs({
      args: rest,
      options: { since: { type: 'string' }, skill: { type: 'string' }, run: { type: 'string' }, file: { type: 'string' }, 'max-hours': { type: 'string' } },
      allowPositionals: true,
    });
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const sinceDays = a.values.since === undefined ? undefined : Number(a.values.since);
  if (sinceDays !== undefined && !(sinceDays >= 0)) return (console.error(USAGE), 2);
  const maxHours = Number(a.values['max-hours']);
  if (verb === 'stale' && !(maxHours > 0)) return (console.error(USAGE), 2);
  if ((verb === 'plan' || verb === 'record') && !a.values.run) return (console.error(USAGE), 2);
  if (verb === 'record' && !a.values.file) return (console.error(USAGE), 2);
  try {
    if (verb === 'hash') {
      if (!a.positionals[0]) return (console.error(USAGE), 2);
      console.log(JSON.stringify({ skill: a.positionals[0], hash: hashSkill(resolve(ctx.root, a.positionals[0])) }));
      return 0;
    }
    if (!['runs', 'summary', 'plan', 'record', 'stale'].includes(verb)) return (console.error(USAGE), 2);
    const b = ctx.binding;
    const { createBoard } = await import('./board/index.ts');
    const board: Board = await createBoard({ ...ctx, options: b.board.options });
    const comments = await readLedger(board, b.heartbeat.ticket, b.owners?.bots ?? [], [b.owners?.product, b.owners?.factory]);
    const forge = async (): Promise<Forge | undefined> => {
      try { const { createForge } = await import('./forge/index.ts'); return createForge({ ...ctx, options: b.forge.options }); }
      catch { return undefined; }
    };
    if (verb === 'stale') {
      const newest = comments.find((c) => parseHeartbeat(c.body));
      const ageHours = newest ? Math.round(((Date.now() - Date.parse(newest.createdAt)) / 36e5) * 10) / 10 : null;
      const stale = ageHours === null || ageHours > maxHours;
      console.log(JSON.stringify({ stale, newest: newest?.createdAt ?? null, ageHours, maxHours }));
      return stale ? 1 : 0;
    }
    if (verb === 'plan' || verb === 'record') {
      const run = flattenRuns(comments).find((r) => r.id === a.values.run);
      if (!run) throw new Error(`run ${a.values.run} is not in the ledger`);
      const p = await plan(run, { root: ctx.root, binding: b, forge: await forge() });
      if (verb === 'plan') return (console.log(JSON.stringify(p, null, 2)), 0);
      const body = scoresComment(p, JSON.parse(readFileSync(resolve(ctx.root, a.values.file!), 'utf8')));
      const c = await board.comment(b.heartbeat.ticket, body);
      console.log(JSON.stringify({ run: run.id, comment: c.id, ...JSON.parse(body.split('\n')[2]) }));
      return 0;
    }
    const rows = flattenRuns(comments, { sinceDays, skill: a.values.skill });
    if (verb === 'runs') return (console.log(JSON.stringify(rows, null, 2)), 0);
    let merged: string[] | undefined;
    try {
      // ponytail: the forge list caps merged CRs per call (e.g. 100), so older merged CRs drop out of costPerCR; page the list when the ledger outgrows it
      merged = (await (await forge())!.list({ state: 'merged' })).filter((c) => c.state === 'merged').map((c) => c.n);
    } catch { /* forge unreachable: costPerCR counts every cr */ }
    console.log(JSON.stringify({ ...summarise(rows, merged), learning: learningState(comments, b.learning?.every_cycles, Date.now(), b.learning?.budget_usd_per_week) }, null, 2));
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
};

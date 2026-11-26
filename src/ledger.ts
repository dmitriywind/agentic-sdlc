// The run ledger: runs read back from heartbeats (references/architecture.md 6.1). Mechanism only.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { flagError } from './forge/util.ts';
import { parse } from 'yaml';
import type { Binding, Board, Comment, CR, Forge, Item, PortCli } from './ports.ts';
import { ownersFor } from './ports.ts';
import { isMarked, stamp } from './comments.ts';
import { findStep, hashSkill, readSkills, skillOf } from './skills.ts';
import { executorFor } from './dispatch.ts';
export { hashSkill };

export const HEARTBEAT_MARKER = stamp('heartbeat');

/** One step run: a row of the heartbeat's `runs`. `skill` holds the step id (`build`, `review/review`). */
export interface LedgerRun {
  id: string;
  at: string;
  skill: string;
  skillHash: string;
  ticket?: string;
  cr?: string;
  tier: string;
  model: string;
  executor?: string; // executor kind: harness (default) | command
  ref?: string; // what dispatch printed: the command's pid
  tokens?: number;
  minutes?: number;
  outcome: string; // done | sent_back | failed | escalated | timeout | capped (ended on a turn, token or minute cap)
  score?: number; // 0-4: the done-conditions scorer from learn/judge
  scores?: Record<string, ScoreValue>; // v6: one per scorer in .agents/scorers/
  trace?: string; // v6: run id for traces.uri
  error?: string;
}

/** `unscorable`: the judge had too little evidence to grade (needs a reason); stored and counted, never part of a rate, median or cluster. */
export type ScoreValue = number | 'pass' | 'fail' | 'unscorable';
/** v6 rescore; a v5 rescore has no scorer (done-conditions) and no by (judge). */
export interface Rescore { id: string; scorer?: string; score: ScoreValue; cap?: string; by?: 'judge' | 'human' }
export const SCORE_SCORER = 'done-conditions';
/** A scorer value that counts as a failure: `fail`, or 0-1 on the 0-4 scale (a condition not met). */
export const isFail = (v: ScoreValue): boolean => v === 'fail' || (typeof v === 'number' && v <= 1);

export interface Stats { runs: number; medianScore: number | null; failureRate: number; minutes: number }
/** A repeated failure: by normalised `error`, or by `scorer` fail. */
export interface Cluster { skill: string; error?: string; scorer?: string; count: number; tickets: string[] }
export interface ScorerStats { runs: number; failRate: number; median: number | null; unscorable?: number }

export function parseHeartbeat(body: string): any | undefined {
  const lines = body.trimStart().split(/\r?\n/);
  while (lines.length && lines[0].startsWith('<!-- agentic-sdlc:')) lines.shift();
  body = lines.join('\n');
  if (!body.trimStart().startsWith(HEARTBEAT_MARKER)) return undefined;
  // The JSON follows the marker line: in a `json` fence, or bare (what `board comment --kind heartbeat --body-file` stamps).
  const m = body.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
  try { return JSON.parse(m ? m[1] : body.split(/\r?\n/).slice(1).join('\n')); } catch { return undefined; }
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
  // A run with a hard fact (failed, timeout, capped) is capped, never dropped from the medians: its `unscorable` is ignored.
  if (m.get(SCORE_SCORER) === 'unscorable' && hardFacts(r)) { m = new Map(m); m.delete(SCORE_SCORER); }
  const s = m.get(SCORE_SCORER);
  const { score: _old, ...rest } = r;
  return { ...(s === 'unscorable' ? rest : r), scores: { ...r.scores, ...Object.fromEntries(m) }, ...(typeof s === 'number' ? { score: s } : {}) };
}

export const SCORES_MARKER = stamp('scores');
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
    const score: ScoreValue | undefined = v === 'pass' || v === 'fail' || v === 'unscorable' ? v : /^[0-4]$/.test(v) ? Number(v) : undefined;
    return score === undefined ? [] : [{ id, scorer, score, by: 'human' as const }];
  });

/**
 * Runs from heartbeat comments (v5 and v6, newest first), with later rescores applied per scorer:
 * a heartbeat's `rescores`, `<!-- scores -->` comments and grade comments. Callers filter trust first.
 */
export function flattenRuns(comments: Comment[], q: { sinceDays?: number; skill?: string; now?: number } = {}): LedgerRun[] {
  // `skill` filters by step id, or by skill name for all of its steps.
  const want = q.skill;
  const cutoff = q.sinceDays === undefined ? -Infinity : (q.now ?? Date.now()) - q.sinceDays * 864e5;
  const beats = comments.map((c) => ({ c, hb: parseHeartbeat(c.body) })).filter((x) => x.hb);
  const rescore = pickRescores(comments.flatMap((c) => {
    const hb = parseHeartbeat(c.body);
    return hb ? hb.rescores ?? [] : isScores(c) ? parseScores(c.body) : parseGrades(c.body);
  }));
  return beats
    .flatMap(({ c, hb }) => (hb.runs ?? []).map((r: LedgerRun) => ({ ...r, at: r.at ?? hb.at ?? c.createdAt })))
    .map((r) => applyRescores(r, rescore.get(r.id)))
    .filter((r) => Date.parse(r.at) >= cutoff && (!want || r.skill === want || skillOf(r.skill) === want));
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
  return {
    runs: rows.length,
    medianScore: median(rows.flatMap((r) => (typeof r.score === 'number' ? [r.score] : []))),
    failureRate: rows.length ? rows.filter((r) => r.outcome !== 'done').length / rows.length : 0,
    minutes: Math.round(rows.reduce((t, r) => t + (r.minutes ?? 0), 0) * 100) / 100,
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
  return Object.fromEntries([...g].map(([k, all]) => {
    const vs = all.filter((v) => v !== 'unscorable');
    const un = all.length - vs.length;
    return [k, {
      runs: vs.length,
      failRate: vs.length ? vs.filter(isFail).length / vs.length : 0,
      median: median(vs.filter((v): v is number => typeof v === 'number')),
      ...(un ? { unscorable: un } : {}),
    }];
  }));
}

/** One ticket's spend: its runs' reported tokens and minutes; reworks = build runs after the first. */
export interface TicketUse { ticket: string; runs: number; tokens: number; minutes: number; reworks?: number; overBudget?: true }

/**
 * Per-ticket rollup of the run rows, most tokens first: the top `top` tickets, plus every ticket over
 * `maxTokens` (cycle.max_tokens_per_ticket). Runs with no ticket are left out; totals cover every ticket.
 */
export function ticketUse(rows: LedgerRun[], maxTokens?: number, top = 20) {
  const g = new Map<string, LedgerRun[]>();
  for (const r of rows) if (r.ticket) g.set(r.ticket, [...(g.get(r.ticket) ?? []), r]);
  const all: TicketUse[] = [...g].map(([ticket, rs]) => {
    const tokens = rs.reduce((t, r) => t + (r.tokens ?? 0), 0);
    const reworks = Math.max(0, rs.filter((r) => r.skill === 'build').length - 1);
    return { ticket, runs: rs.length, tokens, minutes: Math.round(rs.reduce((t, r) => t + (r.minutes ?? 0), 0) * 100) / 100, ...(reworks ? { reworks } : {}), ...(maxTokens && tokens > maxTokens ? { overBudget: true as const } : {}) };
  }).sort((a, b) => b.tokens - a.tokens || b.minutes - a.minutes);
  return {
    tickets: all.filter((t, i) => i < top || t.overBudget),
    ticketTotals: { tickets: all.length, runs: all.reduce((t, x) => t + x.runs, 0), tokens: all.reduce((t, x) => t + x.tokens, 0), minutes: Math.round(all.reduce((t, x) => t + x.minutes, 0) * 100) / 100 },
  };
}

export const summarise = (rows: LedgerRun[], o: { maxTokensPerTicket?: number } = {}) => ({
  total: stats(rows),
  byStep: groupStats(rows, (r) => r.skill),
  bySkill: groupStats(rows, (r) => skillOf(r.skill)),
  byModel: groupStats(rows, (r) => r.model),
  byExecutor: groupStats(rows, (r) => r.executor ?? 'harness'),
  byScorer: byScorer(rows),
  failureClusters: clusters(rows),
  ...ticketUse(rows, o.maxTokensPerTicket),
});

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
 * holding the last learn/improve run (all of them when there is none); due at
 * learning.every_cycles. Off unless learning.enabled: then neither due nor judge.
 */
export function learningState(comments: Comment[], everyCycles: number, enabled = false) {
  // newest first; review and learn runtimes write their own heartbeats (kind), which count no cycle
  const beats = comments.map((c) => parseHeartbeat(c.body)).filter((hb) => hb && (hb.kind ?? 'cycle') === 'cycle');
  const learnAt = comments.map((c) => parseHeartbeat(c.body)).filter(Boolean).findIndex((hb) => (hb.runs ?? []).some((r: LedgerRun) => String(r.skill) === 'learn/improve'));
  // Cycles since the newest heartbeat (of any kind) that carries a learn/improve run.
  const all = comments.map((c) => parseHeartbeat(c.body)).filter(Boolean);
  const cyclesSince = learnAt < 0 ? beats.length : all.slice(0, learnAt).filter((hb) => (hb.kind ?? 'cycle') === 'cycle').length;
  return { due: enabled && Number(everyCycles) > 0 && cyclesSince >= Number(everyCycles), judge: enabled, cyclesSince };
}

export interface Scorer { name: string; scale: 'pass-fail' | '0-4'; applies_to: '*' | string[] }

/** `.agents/scorers/*.md` that apply to a step (by its id, its skill's name, or `*`); done-conditions always (0-4) even without its file. */
export function scorersFor(root: string, id: string): Scorer[] {
  const ids = [id, skillOf(id)];
  const dir = join(root, '.agents', 'scorers');
  const out: Scorer[] = [];
  for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')) : []) {
    let fm: any;
    try { fm = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(dir, f), 'utf8'))?.[1] ?? ''); } catch { continue; }
    if (!fm?.name || !['pass-fail', '0-4'].includes(fm.scale)) continue;
    if (fm.applies_to === '*' || (Array.isArray(fm.applies_to) && fm.applies_to.some((a: unknown) => ids.includes(String(a))))) out.push({ name: fm.name, scale: fm.scale, applies_to: fm.applies_to });
  }
  if (!out.some((s) => s.name === SCORE_SCORER)) out.unshift({ name: SCORE_SCORER, scale: '0-4', applies_to: '*' });
  return out;
}

/** Hard facts code can read, each capping done-conditions (skills/learn Hard facts); the lowest wins. */
export function hardFacts(run: LedgerRun, cr?: CR, required: string[] = []): { score: number; facts: string[] } | null {
  const facts: [number, string][] = [];
  if (run.outcome === 'failed' || run.outcome === 'timeout' || run.outcome === 'capped') facts.push([1, `outcome ${run.outcome}`]);
  const red = (cr?.checks ?? []).filter((c) => c.state === 'failure' && (!required.length || required.includes(c.name)));
  if (red.length) facts.push([1, `red check on the head: ${red.map((c) => c.name).join(', ')}`]);
  // ponytail: send-back, bounce, reopen and escape facts need board history; the judge reports those in its reasons.
  if (!facts.length) return null;
  return { score: Math.min(...facts.map(([s]) => s)), facts: facts.map(([, f]) => f) };
}

/** The installed file a step id names, relative to the root; the conventional path when the pack cannot say. */
function stepFile(root: string, id: string): string {
  const step = findStep(readSkills(join(root, '.agents', 'skills')), id);
  return step ? relative(root, step.file).replaceAll('\\', '/') : `.agents/skills/${id}`;
}

/** What learn/judge needs for one run: the scorers that apply, evidence refs, and the cap. */
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
      skill: `${stepFile(o.root, run.skill)} at skillHash ${run.skillHash}`,
    },
    cap: hardFacts(run, cr, o.binding.forge?.required_checks ?? []),
  };
}

/** Validates a judge's scores against the plan, applies the cap, returns the `<!-- scores -->` comment body. */
export function scoresComment(p: Pick<Awaited<ReturnType<typeof plan>>, 'run' | 'scorers' | 'cap'>, file: unknown, at = new Date().toISOString()): string {
  const scores = (file as any)?.scores;
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) throw new Error('scores file must be { "scores": { "<scorer>": <value> } }');
  const errors: string[] = [];
  const reasonOf: Record<string, unknown> = (file as any).reasons && typeof (file as any).reasons === 'object' ? (file as any).reasons : {};
  for (const [k, v] of Object.entries<unknown>(scores)) {
    const s = p.scorers.find((x) => x.name === k);
    if (!s) errors.push(`scorer ${k} does not apply to ${p.run.skill} (applies: ${p.scorers.map((x) => x.name).join(', ')})`);
    else if (v === 'unscorable' && k === SCORE_SCORER && p.cap) errors.push(`scorer ${k}: unscorable is not allowed while a hard fact caps the run (${p.cap.facts.join('; ')}): grade it 0 to ${p.cap.score}`);
    else if (v === 'unscorable') { if (!(typeof reasonOf[k] === 'string' && reasonOf[k].trim())) errors.push(`scorer ${k}: unscorable needs a reason in reasons.${k}`); }
    else if (s.scale === 'pass-fail' ? v !== 'pass' && v !== 'fail' : !(Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4)) errors.push(`scorer ${k}: ${JSON.stringify(v)} is not on scale ${s.scale}`);
  }
  if (!(SCORE_SCORER in scores)) errors.push(`${SCORE_SCORER} is required`);
  if (errors.length) throw new Error(errors.join('\n'));
  const out: Record<string, ScoreValue> = { ...scores };
  let cap: string | undefined;
  if (p.cap && typeof out[SCORE_SCORER] === 'number' && out[SCORE_SCORER] > p.cap.score) { out[SCORE_SCORER] = p.cap.score; cap = p.cap.facts.join('; '); }
  const reasons = (file as any).reasons;
  return `${SCORES_MARKER}\n\`\`\`json\n${JSON.stringify({ run: p.run.id, at, scores: out, ...(cap ? { cap } : {}), ...(reasons ? { reasons } : {}) })}\n\`\`\`\n`;
}

export interface Measure<T = number> { value: T | null; why?: string }

/**
 * Change failures in the last `days` against changes shipped (references/architecture.md 6.8).
 * A change is a ticket at Done with Shipped on the last environment, dated by its last board write.
 * A failure is a P0 bug or Signal opened in the window, or a `signal:deploy` Signal (a failed deploy);
 * a rollback opens no ticket of its own, so it counts only through the Signal that explains it.
 */
export function changeFailures(items: Item[], b: Binding, days: number, now: number) {
  const from = now - days * 864e5;
  const inWin = (t?: string) => t !== undefined && Date.parse(t) >= from && Date.parse(t) <= now;
  const last = b.product.environments.at(-1);
  const changes = items.filter((x) => x.status === 'Done' && x.fields.shipped === `On ${last}` && inWin(x.updatedAt));
  const failures = items.filter((x) => inWin(x.createdAt) && (x.labels.includes('signal:deploy')
    || (x.fields.priority === 'P0' && (x.labels.includes(b.board.labels?.bug ?? 'bug') || x.labels.some((l) => l.startsWith('signal:'))))));
  return { changes, failures, rate: changes.length ? failures.length / changes.length : null };
}

/** The error budget of `product.slo` over every ticket (`board list --state all`); undefined when no SLO is set. */
export function errorBudget(items: Item[], b: Binding, now: number) {
  const slo = b.product?.slo;
  if (!slo) return undefined;
  const w = changeFailures(items, b, slo.window_days, now);
  // Failures with no change shipped have no rate: the budget is spent, not unknown.
  return { max: slo.change_failure_rate_max, windowDays: slo.window_days, actual: w.rate === null ? null : Math.round(w.rate * 100) / 100, exhausted: w.rate !== null ? w.rate > slo.change_failure_rate_max : w.failures.length > 0,
    ...(w.rate === null && w.failures.length ? { why: 'change failures in the window and no change shipped to the last environment' } : {}) };
}

/** One cycle's report as the navigator gives it: what its runs reported, its failed steps, one line per result. */
export interface CycleReport { runs?: Partial<LedgerRun>[]; errors?: { step: string; id?: string; msg: string }[]; did?: string[] }

/**
 * `ledger heartbeat`: the cycle's `kind: cycle` heartbeat, then its done line (section 11.2). A run row gets what the pack
 * and the binding know (skillHash, tier, model, executor) where the run left it out; `next` adds its errors and budget;
 * `learning` is copied forward from the newest heartbeat holding one when learning.enabled.
 */
export async function writeHeartbeat(o: {
  board: Board; b: Binding; root: string; comments: Comment[]; factory?: string; report?: CycleReport;
  next?: { errors?: CycleReport['errors']; budget?: string }; key?: string; now?: number;
}) {
  const { b } = o;
  const ticket = b.heartbeat.ticket;
  const pack = readSkills(join(o.root, '.agents', 'skills'));
  const runs = (o.report?.runs ?? []).map((r) => {
    const step = r.skill ? findStep(pack, r.skill) : undefined;
    const tier = r.tier || step?.tier;
    const filled: Record<string, unknown> = { ...r, skillHash: r.skillHash || step?.hash, tier, model: r.model || (tier ? (b.models as Record<string, string> | undefined)?.[tier] : undefined), executor: r.executor || (r.skill ? executorFor(b, r.skill)?.kind : undefined) };
    return Object.fromEntries(Object.entries(filled).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  });
  const errors = [...(o.next?.errors ?? []), ...(o.report?.errors ?? [])];
  if (!o.factory) errors.push({ step: 'heartbeat', msg: 'vcs head gave no sha: factory left out' });
  const learning = b.learning?.enabled ? o.comments.map((c) => parseHeartbeat(c.body)).find((hb) => hb?.learning)?.learning : undefined;
  const did = o.report?.did ?? [];
  const hb = {
    kind: 'cycle', at: new Date(o.now ?? Date.now()).toISOString(), ...(o.factory ? { factory: o.factory } : {}), runs, errors,
    ...(did.length ? { did } : {}), ...(learning ? { learning } : {}), ...(o.next?.budget === 'exhausted' ? { budget: 'exhausted' } : {}),
  };
  const beat = await o.board.comment(ticket, `${HEARTBEAT_MARKER}\n${JSON.stringify(hb, null, 2)}\n`);
  // The claim key `dispatch sdlc --ticket <heartbeat.ticket>` gives: `<heartbeat.ticket>-sdlc`.
  const key = o.key ?? `${ticket}-sdlc`;
  const done = await o.board.comment(ticket, `${stamp('done', key)}\nagentic-sdlc: cycle done: ${runs.length} run(s), ${errors.length} error(s)\n`);
  return { heartbeat: beat.id, done: done.id, key, ...hb };
}

/** DORA-style measures from the board and the forge, never from run memory. A measure the data cannot give is `null` with a `why`. */
export async function measures(o: { board: Board; forge?: Forge; binding: Binding; days?: number; now?: number }) {
  const b = o.binding;
  const days = o.days ?? 30;
  const now = o.now ?? Date.now();
  const from = now - days * 864e5;
  const inWin = (t?: string) => t !== undefined && Date.parse(t) >= from && Date.parse(t) <= now;
  const hours = (a: string, z: string) => (Date.parse(z) - Date.parse(a)) / 36e5;
  const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  const items = await o.board.list({ state: 'all' });
  const { changes, failures, rate } = changeFailures(items, b, days, now);
  const doneIn = items.filter((x) => x.status === 'Done' && x.statusChangedAt && inWin(x.statusChangedAt));
  const leads = doneIn.map((x) => hours(x.createdAt, x.statusChangedAt!)).filter((h) => h >= 0);
  const restore = failures.filter((x) => x.status === 'Done' && x.statusChangedAt).map((x) => hours(x.createdAt, x.statusChangedAt!)).filter((h) => h >= 0);
  const versions = new Set(changes.map((x) => x.fields.release_version).filter(Boolean));
  const none = (why: string): Measure => ({ value: null, why });

  let reworkRate: Measure & { crs?: number; reworked?: number } = none('no forge: review reports cannot be read');
  if (o.forge && doneIn.length) {
    try {
      const bots = ownersFor(b.owners, 'forge').bots.map((x) => x.toLowerCase());
      const ids = new Set(doneIn.map((x) => x.id));
      const crs = (await o.forge.list({ state: 'merged' })).filter((c) => c.closes.some((id) => ids.has(id)));
      let reworked = 0;
      for (const c of crs) {
        const cs = await o.forge.comments(c.n);
        if (cs.some((x) => bots.includes(x.author?.toLowerCase()) && isMarked(x.body, 'verdict') && x.body.includes('REMEDIATION REQUIRED'))) reworked++;
      }
      reworkRate = crs.length ? { value: round(reworked / crs.length), crs: crs.length, reworked } : none('no merged CR closed a ticket that reached Done in the window');
    } catch (e) { reworkRate = none(`the forge could not be read: ${(e as Error).message}`); }
  } else if (o.forge) reworkRate = none('no ticket reached Done in the window');

  const budget = errorBudget(items, b, now);
  return {
    window: { days, from: new Date(from).toISOString(), to: new Date(now).toISOString() },
    // Tickets at Done with Shipped on the last environment whose last board write is in the window, per week.
    deployFrequency: { value: round(changes.length / (days / 7)), changes: changes.length, versions: versions.size },
    // createdAt to the time the ticket entered Done (statusChangedAt), for tickets that reached Done in the window.
    leadTimeHours: leads.length ? { value: round(median(leads)), tickets: leads.length } : none('no ticket reached Done in the window with a status change time'),
    changeFailureRate: rate === null ? none('no change shipped to the last environment in the window') : { value: round(rate), failures: failures.length, changes: changes.length },
    timeToRestoreHours: restore.length ? { value: round(median(restore)), failures: restore.length } : none('no change failure in the window reached Done'),
    // Share of merged CRs closing a ticket that reached Done in the window with a trusted REMEDIATION REQUIRED verdict report.
    reworkRate,
    ...(budget ? { errorBudget: budget } : {}),
  };
}

const USAGE = [
  'usage: ledger runs [--since <days>] [--skill <s>] | ledger summary [--since <days>] | ledger measures [--days <n>] | ledger hash <skill-dir>',
  '       ledger plan --run <id> | ledger record --run <id> --file <scores.json> | ledger stale --max-hours <h>',
  '       ledger heartbeat [--file <report.json>] [--next <next.json>] [--key <claim key>]',
].join('\n');

/** The flags `ledger` takes (a verb reads the ones it needs). */
export const OPTIONS = { since: { type: 'string' }, skill: { type: 'string' }, run: { type: 'string' }, file: { type: 'string' }, days: { type: 'string' }, 'max-hours': { type: 'string' }, next: { type: 'string' }, key: { type: 'string' } } as const;

/** The sha of `vcs head`, or undefined when the VCS cannot say. */
export async function headSha(ctx: Parameters<PortCli>[1]): Promise<string | undefined> {
  try { const { createVcs } = await import('./vcs/index.ts'); return (await createVcs({ ...ctx, options: ctx.binding.vcs?.options ?? {} }).head()).sha; } catch { return undefined; }
}

export const cli: PortCli = async (argv, ctx) => {
  const [verb, ...rest] = argv;
  let a;
  try {
    a = parseArgs({ args: rest, options: OPTIONS, allowPositionals: true });
  } catch (e) {
    console.error(flagError(e as Error));
    return 2;
  }
  const days = a.values.days === undefined ? 30 : Number(a.values.days);
  if (verb === 'measures' && !(days > 0)) return (console.error(USAGE), 2);
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
    if (!['runs', 'summary', 'plan', 'record', 'stale', 'measures', 'heartbeat'].includes(verb)) return (console.error(USAGE), 2);
    const b = ctx.binding;
    const { createBoard } = await import('./board/index.ts');
    const board: Board = await createBoard({ ...ctx, options: b.board.options });
    if (verb === 'measures') {
      let forge: Forge | undefined;
      try { const { createForge } = await import('./forge/index.ts'); forge = createForge({ ...ctx, options: b.forge.options }); } catch { /* rework rate is then null */ }
      console.log(JSON.stringify(await measures({ board, forge, binding: b, days }), null, 2));
      return 0;
    }
    const comments = await readLedger(board, b.heartbeat.ticket, ownersFor(b.owners, 'board').bots, [...ownersFor(b.owners, 'board').product, ...ownersFor(b.owners, 'board').factory]);
    const forge = async (): Promise<Forge | undefined> => {
      try { const { createForge } = await import('./forge/index.ts'); return createForge({ ...ctx, options: b.forge.options }); }
      catch { return undefined; }
    };
    if (verb === 'heartbeat') {
      const json = (f?: string) => (f ? JSON.parse(readFileSync(resolve(ctx.root, f), 'utf8')) : undefined);
      const out = await writeHeartbeat({ board, b, root: ctx.root, comments, factory: await headSha(ctx), report: json(a.values.file), next: json(a.values.next), key: a.values.key });
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }
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
    console.log(JSON.stringify({ ...summarise(rows, { maxTokensPerTicket: b.cycle?.max_tokens_per_ticket }), learning: learningState(comments, b.learning?.every_cycles, b.learning?.enabled === true) }, null, 2));
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
};

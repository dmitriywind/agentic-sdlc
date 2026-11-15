// What the process asks of a change request, decided from the binding: `forge verdict`, `forge land`, `forge queue`.
// Built on the Forge port; no vendor call lives here.
import type { AdapterContext, Binding, CR, Comment, Forge, LandResult, QueueAction, QueueRow, VerdictResult } from '../ports.ts';
import { ownersFor } from '../ports.ts';
import { isMarked, stamp, verdictOf } from '../comments.ts';
import { pause } from '../exec.ts';
import { UsageError } from './util.ts';

/** The status context the human-approval gate posts. */
const HUMAN = 'human-approval';
const reviewContext = (b: Binding) => b.forge.review_check_name ?? 'review';

/** The report: the verdict marker for the head, the body without its own verdict lines, then the one `Verdict:` line. */
export function buildReport(body: string, headSha: string, pass: boolean): { text: string; verdict: VerdictResult['verdict'] } {
  const verdict = pass ? 'PASS' : 'REMEDIATION REQUIRED';
  const mark = stamp('verdict', headSha);
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() === mark) lines.shift();
  const kept: string[] = [];
  for (const l of lines) {
    const m = /^Verdict:[ \t]*(.*?)[ \t]*$/.exec(l);
    if (!m) { kept.push(l); continue; }
    if (m[1] !== verdict && /^(PASS|REMEDIATION REQUIRED)$/.test(m[1])) throw new UsageError(`forge verdict: the body says "Verdict: ${m[1]}" but the flag is --${pass ? 'pass' : 'fail'}`);
    // The same verdict, or free text after `Verdict:`: dropped; the one line goes last.
  }
  return { verdict, text: `${mark}\n${kept.join('\n').trim()}\n\nVerdict: ${verdict}\n` };
}

/** `forge verdict`: posts the report; with a review identity also the review status and, on pass, the approval. */
export async function verdict(f: Forge, ctx: AdapterContext, n: string, pass: boolean, body: string): Promise<VerdictResult> {
  const b = ctx.binding;
  const cr = await f.view(n);
  const { text, verdict: v } = buildReport(body, cr.headSha, pass);
  const identity = !!b.forge.review_identity;
  if (identity) {
    // Before anything is posted: a report without its status would leave the CR half reviewed.
    const name = String(ctx.options.review_token_env ?? '');
    if (!name || !ctx.env[name]) throw new Error(`Access: the review token is not set (env var named by forge.options.review_token_env${name ? ` = ${name}` : ''}); nothing was posted`);
  }
  const comment = await f.comment(n, text);
  if (identity) {
    await f.status(cr.headSha, { context: reviewContext(b), state: pass ? 'success' : 'failure', description: `review: ${v}`, ...(comment.url ? { url: comment.url } : {}) });
    if (pass) await f.approve(n);
  }
  return { verdict: v, comment, status: identity ? 'posted' : 'ci' };
}

type Classify = (cr: CR) => Promise<{ class: string; who: string[] }>;

/** `forge land`: waits (bounded) for every required check, then arms or performs the merge. Never merges a draft. */
export async function land(f: Forge, b: Binding, n: string, waitMinutes: number | undefined, classOf: Classify, step = 30_000): Promise<LandResult> {
  const budget = (waitMinutes ?? b.cycle?.land_wait_minutes ?? 5) * 60_000;
  const required = b.forge.required_checks ?? [];
  for (let waited = 0; ; waited += step) {
    const cr = await f.view(n);
    if (cr.state === 'merged') return { state: 'merged', blocking: [] };
    if (cr.state === 'closed') return { state: 'blocked', blocking: [{ check: 'change request', state: 'closed' }] };
    if (cr.draft) return { state: 'blocked', blocking: [{ check: 'draft', state: 'draft' }] };
    const state = (name: string) => cr.checks.find((c) => c.name === name)?.state ?? 'missing';
    const rows = required.map((check) => ({ check, state: state(check) as string })).filter((r) => r.state !== 'success');
    const red = rows.filter((r) => r.state === 'failure');
    if (red.length) return { state: 'blocked', blocking: red };
    if (!rows.length) {
      const after = await f.automerge(n);
      return { state: after.state === 'merged' ? 'merged' : 'armed', blocking: [] };
    }
    if (rows.every((r) => r.check === HUMAN)) {
      const { class: klass, who } = await classOf(cr);
      return { state: 'blocked', blocking: rows, needsHuman: { class: klass, who } };
    }
    if (waited + step > budget) return { state: 'waiting', blocking: rows };
    await pause(step);
  }
}

const trustedOf = (b: Binding): Set<string> => {
  const o = ownersFor(b.owners, 'forge');
  return new Set([...o.bots, ...o.product, ...o.factory, ...o.operator, ...o.security, ...o.compliance, b.forge.review_identity].filter(Boolean).map((x) => x.toLowerCase()));
};

export interface Next { action: QueueAction; reason: string; reworks: number; since?: string }

/** The one next action of a CR. Pure: the CR with its checks, its comments (any order), the binding and the time in ms. */
export function nextAction(cr: CR, comments: Comment[], b: Binding, now: number): Next {
  const trusted = trustedOf(b);
  const mine = comments.filter((c) => trusted.has(c.author?.toLowerCase())).sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
  const reports = mine.filter((c) => isMarked(c.body, 'verdict'));
  const forHead = reports.find((c) => isMarked(c.body, 'verdict', cr.headSha));
  const v = forHead ? verdictOf(forHead.body) : undefined;
  const head = v === 'PASS' || v === 'REMEDIATION REQUIRED' ? v : undefined;
  const reworks = reports.filter((c) => verdictOf(c.body) === 'REMEDIATION REQUIRED').length + mine.filter((c) => isMarked(c.body, 'note')).length;
  const times = [cr.pushedAt, mine[0]?.createdAt].filter((t): t is string => !!t && !Number.isNaN(Date.parse(t)));
  const since = times.length ? new Date(Math.max(...times.map((t) => Date.parse(t)))).toISOString() : undefined;
  const gate = (name: string) => name === reviewContext(b) || name === HUMAN;
  const finished = !cr.checks.some((c) => !gate(c.name) && c.state === 'pending');
  const redCheck = (b.forge.required_checks ?? []).find((name) => !gate(name) && cr.checks.some((c) => c.name === name && c.state === 'failure'));
  let r: { action: QueueAction; reason: string };
  if (cr.draft && !head && finished) r = { action: 'review', reason: 'no review of this head' };
  else if (head === 'REMEDIATION REQUIRED') r = { action: 'rework', reason: 'the review asks for remediation' };
  else if (!cr.draft && redCheck) r = { action: 'rework', reason: `required check ${redCheck} is red` };
  else if (cr.behind) r = { action: 'sync', reason: 'behind the trunk' };
  else if (head === 'PASS' && cr.state === 'open') r = { action: 'land', reason: 'the review passed this head' };
  else r = { action: 'wait', reason: cr.draft && !head ? 'checks are still running' : 'waiting on checks or approval' };
  const cap = b.cycle?.max_rework ?? 3;
  if (r.action === 'rework' && reworks >= cap) r = { action: 'escalate', reason: 'rework cap' };
  else if (r.action === 'wait' && since && b.stall_minutes > 0 && now - Date.parse(since) > b.stall_minutes * 60_000) r = { action: 'escalate', reason: 'stalled' };
  return { ...r, reworks, ...(since ? { since } : {}) };
}

/** `forge queue`: every open CR with its one next action. */
export async function queue(f: Forge, b: Binding, classOf: Classify, now = Date.now()): Promise<QueueRow[]> {
  const rows: QueueRow[] = [];
  for (const cr of await f.list({ state: 'open', checks: true })) {
    const next = nextAction(cr, await f.comments(cr.n), b, now);
    const klass = await classOf(cr).then((c) => c.class, () => 'guardrail');
    rows.push({ n: cr.n, ...(cr.closes[0] ? { ticket: cr.closes[0] } : {}), class: klass, action: next.action, reason: next.reason, reworks: next.reworks, ...(next.since ? { since: next.since } : {}) });
  }
  return rows;
}

// The run ledger, driven through the CLI on the local board (heartbeats are comments of the heartbeat ticket "1").
// The fixtures write comments straight into .agents/board.json so that author and time are the scenario's own.
// Exports capture() and the JSON-result steps' helpers for the telemetry and bench steps.
// State on w.state: none. The JSON of the last run is w.last.json().
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HEARTBEAT_MARKER, SCORES_MARKER, measures, hardFacts, scoresComment, type LedgerRun } from '../../src/ledger.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { Outcome, type World } from '../support/world.ts';

// ---- running a CLI module in-process, as the Outcome of the last run ----
/** Runs `fn` with stdout and stderr captured; `w.last` then holds what it printed and the exit code it returned. */
export async function capture(w: World, fn: () => Promise<number>): Promise<Outcome> {
  const out: string[] = [], err: string[] = [];
  const so = process.stdout.write, se = process.stderr.write, log = console.log, cerr = console.error;
  process.stdout.write = ((s: string) => (out.push(String(s)), true)) as typeof process.stdout.write;
  process.stderr.write = ((s: string) => (err.push(String(s)), true)) as typeof process.stderr.write;
  console.log = (...a: unknown[]) => { out.push(`${a.join(' ')}\n`); };
  console.error = (...a: unknown[]) => { err.push(`${a.join(' ')}\n`); };
  let code = -1;
  try { code = await fn(); } finally { process.stdout.write = so; process.stderr.write = se; console.log = log; console.error = cerr; }
  return (w.last = new Outcome(code, out.join(''), err.join('')));
}

// ---- the comments of the heartbeat ticket ----
type Db = { items: unknown[]; comments: Record<string, Record<string, unknown>[]> };
const boardFile = (w: World) => w.path('.agents', 'board.json');
const load = (w: World): Db => JSON.parse(readFileSync(boardFile(w), 'utf8'));
const save = (w: World, db: Db) => { mkdirSync(dirname(boardFile(w)), { recursive: true }); writeFileSync(boardFile(w), JSON.stringify(db)); };

const ensureTicket = (w: World) => {
  w.binding({ heartbeat: { ticket: '1' } });
  if (w.exists('.agents/board.json')) return;
  w.write('.body.md', '');
  const o = w.cliLine('board create --title heartbeat --status Backlog --body-file .body.md');
  assert.equal(o.code, 0, o.stderr);
};

const when = (s: string) => {
  const m = /^(\d+(?:\.\d+)?) (days|hours) ago$/.exec(s);
  return m ? new Date(Date.now() - Number(m[1]) * (m[2] === 'days' ? 864e5 : 36e5)).toISOString() : s;
};

/** Appends a comment to the heartbeat ticket (oldest first, as they were posted). */
export const post = (w: World, author: string, createdAt: string, body: string) => {
  ensureTicket(w);
  const db = load(w);
  const list = (db.comments['1'] ??= []);
  list.push({ id: String(list.length + 1), author, createdAt: when(createdAt), body, url: `local:1#${list.length + 1}` });
  save(w, db);
};

const scoresOf = (s: string) => Object.fromEntries(s.split(';').map((x) => x.trim()).filter(Boolean).map((p) => {
  const [k, v] = p.split('=').map((x) => x.trim());
  return [k, /^\d+$/.test(v) ? Number(v) : v];
}));

/** A run row of a heartbeat table: empty cells are left out, a missing model is "m1". */
const runOf = (r: Record<string, string>) => {
  const o: Record<string, unknown> = { id: r.id, skill: r.skill || 'build', skillHash: r.hash || 'abc', tier: r.tier || 'balanced', model: r.model ?? 'm1', outcome: r.outcome || 'done' };
  for (const k of ['ticket', 'cr', 'executor', 'ref', 'error', 'at']) if (r[k]) o[k] = r[k];
  for (const k of ['score', 'tokens', 'minutes']) if (r[k]) o[k] = Number(r[k]);
  if (r.scores) o.scores = scoresOf(r.scores);
  return o;
};

const heartbeat = (w: World, kind: string | undefined, author: string, at: string, rows: Record<string, string>[]) => {
  const hb = { at: when(at), ...(kind ? { kind } : {}), runs: rows.map(runOf) };
  post(w, author, at, `${HEARTBEAT_MARKER}\n\`\`\`json\n${JSON.stringify(hb)}\n\`\`\``);
};

/** Rewrites the JSON of the newest heartbeat comment. */
const editLast = (w: World, fn: (hb: Record<string, unknown>) => void) => {
  const db = load(w);
  const c = db.comments['1'].at(-1)!;
  const m = /^([\s\S]*?```json\n)([\s\S]*?)(\n```)$/.exec(String(c.body))!;
  const hb = JSON.parse(m[2]);
  fn(hb);
  c.body = `${m[1]}${JSON.stringify(hb)}${m[3]}`;
  save(w, db);
};

Given('the heartbeat ticket', (w) => ensureTicket(w));
Given('a heartbeat by {string} at {string} with these runs:', (w, by: string, at: string, t: DataTable) => heartbeat(w, undefined, by, at, t.hashes()));
Given('a heartbeat by {string} at {string} with no runs', (w, by: string, at: string) => heartbeat(w, undefined, by, at, []));
Given('a {string} heartbeat by {string} at {string} with these runs:', (w, kind: string, by: string, at: string, t: DataTable) => heartbeat(w, kind, by, at, t.hashes()));
Given('a {string} heartbeat by {string} at {string} with no runs', (w, kind: string, by: string, at: string) => heartbeat(w, kind, by, at, []));
Given('that heartbeat records the factory {string}', (w, sha: string) => editLast(w, (hb) => { hb.factory = sha; }));
Given('that heartbeat rescores:', (w, t: DataTable) => editLast(w, (hb) => {
  hb.rescores = t.hashes().map((r) => ({ id: r.id, ...(r.scorer ? { scorer: r.scorer } : {}), score: /^\d+$/.test(r.score) ? Number(r.score) : r.score, ...(r.by ? { by: r.by } : {}) }));
}));
Given('{string} posted a heartbeat whose JSON is not valid', (w, by: string) => post(w, by, '1 hours ago', `${HEARTBEAT_MARKER}\n\`\`\`json\n{bad\n\`\`\``));
Given('{string} posted the comment {string}', (w, by: string, text: string) => post(w, by, '1 hours ago', text));
Given('{string} posted the scores {string} for run {string}', (w, by: string, scores: string, run: string) =>
  post(w, by, '1 hours ago', `${SCORES_MARKER}\n\`\`\`json\n${JSON.stringify({ run, scores: scoresOf(scores), cap: 'outcome failed' })}\n\`\`\``));

Given('a scorer {string} on the scale {string} that applies to {string}', (w, name: string, scale: string, applies: string) => {
  const list = applies === '*' ? '*' : `[${applies}]`;
  w.write(`.agents/scorers/${name}.md`, `---\nname: ${name}\napplies_to: ${list}\nscale: ${scale}\n---\nq\n`);
});
Given('an installed skill pack with the review step {string}', (w, step: string) => {
  const skills = '.agents/skills/sdlc-review';
  w.write(`${skills}/SKILL.md`, '---\nname: sdlc-review\ndescription: d\nmetadata:\n  steps:\n    review: { tier: balanced }\n    verify: { tier: balanced }\n---\nbody\n');
  for (const s of ['review', 'verify']) w.write(`${skills}/steps/${s}.md`, `${s}\n`);
  assert.ok(step);
});
Given('learning is enabled', (w) => w.binding({ learning: { enabled: true } }));
Given('learning is due every {int} cycles', (w, n: number) => w.binding({ learning: { every_cycles: n } }));
Given('a ticket may use {int} tokens', (w, n: number) => w.binding({ cycle: { max_tokens_per_ticket: n } }));

Given('a skill folder {string} with the lines {string} separated by {string}', (w, dir: string, lines: string, sep: string) => {
  w.write(`${dir}/SKILL.md`, lines.split('|').join(sep.replace('\\r', '\r').replace('\\n', '\n')));
  w.write(`${dir}/references/x.md`, 'x');
});

When('I note the printed hash', (w) => { w.state.noted = w.last.json().hash; });
Then('the hash is the noted one', (w) => assert.equal(w.last.json().hash, w.state.noted));
Then('the hash is not the noted one', (w) => assert.notEqual(w.last.json().hash, w.state.noted));

// ---- the JSON of the last run ----
/** Values at a dotted path: `*` maps over a list, `id=a` picks the entry whose id is a; a list is a list of values. */
const walk = (v: any, segs: string[]): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!segs.length) return v;
  const [s, ...rest] = segs;
  if (s === '*') return (v as unknown[]).map((x) => walk(x, rest));
  const eq = /^(\w+)=(.*)$/.exec(s);
  if (eq && Array.isArray(v)) return walk(v.find((x) => String(x?.[eq[1]]) === eq[2]), rest);
  return walk(v?.[s], rest);
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.0015;
const show = (v: unknown) => (v === undefined ? '<absent>' : Array.isArray(v) ? v.map(show).join(', ') : v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
export const at = (w: World, path: string) => walk(w.last.json(), path.split('.'));

Then('the JSON result has these values:', (w, t: DataTable) => {
  for (const r of t.hashes()) {
    const got = at(w, r.path);
    if (/^-?\d*\.\d+$/.test(r.value) && typeof got === 'number') assert.ok(near(got, Number(r.value)), `${r.path}: ${got} is not about ${r.value}`);
    else assert.equal(show(got), r.value, r.path);
  }
});
Then('the JSON result {string} holds:', (w, path: string, doc: string) => assert.deepEqual(at(w, path), JSON.parse(doc), path));
Then('the JSON result holds:', (w, doc: string) => assert.deepEqual(w.last.json(), JSON.parse(doc)));

// ---- measures: the board and the forge are in memory, the clock is fixed ----
const NOW = Date.parse('2026-11-14T00:00:00Z');
const ago = (h: string) => new Date(NOW - Number(h) * 36e5).toISOString();
const fieldsOf = (s: string) => Object.fromEntries(s.split(';').map((x) => x.trim()).filter(Boolean).map((p) => p.split('=').map((x) => x.trim())));
type M = { items: unknown[]; crs: unknown[]; comments: Record<string, unknown[]> };
const m = (w: World): M => (w.state.measures ??= { items: [], crs: [], comments: {} });

Given('these tickets, with times in hours before 2026-11-14:', (w, t: DataTable) => {
  for (const r of t.hashes()) {
    m(w).items.push({
      id: r.id, title: r.id, url: '', status: r.status, labels: (r.labels ?? '').split(',').map((x) => x.trim()).filter(Boolean), fields: fieldsOf(r.fields ?? ''),
      children: [], assignees: [], createdAt: ago(r.created), updatedAt: ago(r.changed), statusChangedAt: ago(r.changed),
    });
  }
});
Given('the merged CRs:', (w, t: DataTable) => { for (const r of t.hashes()) m(w).crs.push({ n: r.cr, closes: r.closes.split(',').map((x) => x.trim()) }); });
Given('{string} reported REMEDIATION REQUIRED on CR {string}', (w, author: string, cr: string) => {
  (m(w).comments[cr] ??= []).push({ author, body: '<!-- review-pr\nVerdict: REMEDIATION REQUIRED' });
});
Given('the change failure rate may be at most {string} over {int} days', (w, max: string, days: number) => w.binding({ product: { slo: { change_failure_rate_max: Number(max), window_days: days } } }));
Given('the environments {string}', (w, list: string) => w.binding({ product: { environments: list.split(',').map((s) => s.trim()) } }));
Given('the bug label is {string}', (w, label: string) => w.binding({ board: { labels: { bug: label } } }));

When('I measure the last {int} days', async (w, days: number) => {
  const s = m(w);
  const board: any = { list: async () => s.items }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const forge: any = { list: async () => s.crs, comments: async (n: string) => s.comments[n] ?? [] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const result = await measures({ board, forge: s.crs.length ? forge : undefined, binding: w.adapterContext().binding, days, now: NOW });
  w.last = new Outcome(0, JSON.stringify(result), '');
});

// ---- the hard-fact cap and the scores comment, as functions ----
Given('a failed run {string} on CR {string} whose checks are:', (w, id: string, cr: string, t: DataTable) => {
  w.state.cap = { run: { id, outcome: 'failed', cr, skill: 'build' } as unknown as LedgerRun, checks: t.hashes().map((r) => ({ name: r.name, state: r.state })) };
});
When('the hard facts are read with the required checks {string}', (w, required: string) => {
  const { run, checks } = w.state.cap;
  w.last = new Outcome(0, JSON.stringify(hardFacts(run, { checks } as never, required.split(',').map((s) => s.trim()).filter(Boolean))), '');
});
When('the judge scores run {string} as {string} under the hard facts {string}', (w, id: string, scores: string, facts: string) => {
  const p = { run: { id, skill: 'build' } as unknown as LedgerRun, scorers: [{ name: 'done-conditions', scale: '0-4', applies_to: '*' }, { name: 'redundant-tests', scale: 'pass-fail', applies_to: '*' }] as never, cap: { score: 1, facts: facts.split(';').map((s) => s.trim()) } };
  const body = scoresComment(p, { scores: scoresOf(scores) }, 'T');
  w.last = new Outcome(0, body.split('\n')[2], '');
});

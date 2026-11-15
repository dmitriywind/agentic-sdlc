import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clusters, flattenRuns, hashSkill, hardFacts, learningState, measures, readRuns, scoresComment, scorersFor, summarise, cli } from '../src/ledger.ts';
import type { Board, Comment } from '../src/ports.ts';

const beat = (hb: object, createdAt = '2026-11-08T00:00:00Z'): Comment => ({
  id: 'c', author: 'bot', createdAt, body: `<!-- heartbeat -->\n\`\`\`json\n${JSON.stringify(hb)}\n\`\`\``,
});
const run = (o: object) => ({ id: 'r1', skill: 'implement-spec', skillHash: 'abc', tier: 'balanced', model: 'm1', outcome: 'done', ...o });

test('flattenRuns filters by age and skill and applies the newest rescore', () => {
  const now = Date.parse('2026-11-09T00:00:00Z');
  const comments = [
    beat({ at: '2026-11-08T00:00:00Z', runs: [run({ id: 'b', skill: 'review-pr' })], rescores: [{ id: 'a', score: 1 }] }),
    beat({ at: '2026-11-07T00:00:00Z', runs: [run({ id: 'a', score: 4 })], rescores: [{ id: 'a', score: 3 }] }),
    beat({ at: '2026-10-01T00:00:00Z', runs: [run({ id: 'old' })] }),
  ];
  const all = flattenRuns(comments);
  assert.deepEqual(all.map((r) => r.id), ['b', 'a', 'old']);
  assert.equal(all.find((r) => r.id === 'a')!.score, 1);
  assert.equal(all[0].at, '2026-11-08T00:00:00Z');
  assert.deepEqual(flattenRuns(comments, { sinceDays: 7, now }).map((r) => r.id), ['b', 'a']);
  assert.deepEqual(flattenRuns(comments, { skill: 'review-pr' }).map((r) => r.id), ['b']);
});

test('summarise groups by skill and model; clusters need two hits', () => {
  const rows = [
    run({ id: '1', score: 4, minutes: 10 }),
    run({ id: '2', score: 2, minutes: 5, outcome: 'failed', error: 'Fast_check red in src/x.ts at 3f9c2d1e for \"PROJ-45\"', ticket: '7' }),
    run({ id: '3', score: 1, model: 'm2', outcome: 'failed', error: 'fast_check red in  lib\\y.ts:7 at 0a1b2c3d4e for \"LIN-9\"', ticket: '8' }),
    run({ id: '4', skill: 'shape', executor: 'command', ref: 'bot-1', outcome: 'failed', error: 'once only' }),
  ] as any[];
  const s = summarise(rows);
  assert.deepEqual(s.bySkill['implement-spec'], { runs: 3, medianScore: 2, failureRate: 2 / 3, minutes: 15 });
  assert.equal(s.byModel.m2.runs, 1);
  assert.equal(s.byExecutor.harness.runs, 3);
  assert.equal(s.byExecutor.command.runs, 1);
  assert.deepEqual(clusters(rows), [{ skill: 'implement-spec', error: 'fast_check red in <path> at <sha> for <s>', count: 2, tickets: ['7', '8'] }]);
  // the scorer view
  const srows = [
    run({ id: '1', ticket: '7', cr: '70', scores: { 'done-conditions': 4, 'redundant-tests': 'fail' } }),
    run({ id: '2', ticket: '8', cr: '80', scores: { 'done-conditions': 1, 'redundant-tests': 'fail' } }),
    run({ id: '3', ticket: '8', cr: '81', scores: { 'redundant-tests': 'pass' } }),
    run({ id: '4', skill: 'judge-run' }),
  ] as any[];
  const ss = summarise(srows);
  assert.deepEqual(ss.byScorer['redundant-tests'], { runs: 3, failRate: 2 / 3, median: null });
  assert.deepEqual(ss.byScorer['done-conditions'], { runs: 2, failRate: 0.5, median: 2.5 });
  assert.deepEqual(ss.failureClusters, [{ skill: 'implement-spec', scorer: 'redundant-tests', count: 2, tickets: ['7', '8'] }]);
});

test('cli: hash prints JSON, bad verb is a usage error', async () => {
  const d = mkdtempSync(join(tmpdir(), 'skill-'));
  writeFileSync(join(d, 'SKILL.md'), 'x');
  const out: string[] = [];
  const log = console.log;
  const err = console.error;
  console.log = (s: string) => out.push(s);
  console.error = () => {};
  try {
    const ctx = { root: d, binding: {} as any, env: {}, exec: () => '', http: async () => ({}) };
    assert.equal(await cli(['hash', '.'], ctx), 0);
    assert.equal(JSON.parse(out[0]).hash, hashSkill(d));
    // the hash ignores line endings and changes with content
    const mk = (eol: string, extra = '') => { const x = mkdtempSync(join(tmpdir(), 'skill-')); mkdirSync(join(x, 'references')); writeFileSync(join(x, 'SKILL.md'), `a${eol}b${extra}`); writeFileSync(join(x, 'references', 'x.md'), 'x'); return x; };
    assert.equal(hashSkill(mk('\n')), hashSkill(mk('\r\n')));
    assert.notEqual(hashSkill(mk('\n')), hashSkill(mk('\n', 'c')));
    assert.match(hashSkill(mk('\n')), /^[0-9a-f]{12}$/);
    assert.equal(await cli(['nope'], ctx), 2);
    assert.equal(await cli(['runs', '--since', 'x'], ctx), 2);
  } finally {
    console.log = log;
    console.error = err;
  }
});

test('readRuns trusts only heartbeats by owners.bots; none configured is an error', async () => {
  const forged = { ...beat({ runs: [run({ id: 'forged', score: 0 })], rescores: [{ id: 'real', score: 0 }] }), author: 'stranger' };
  const real = { ...beat({ runs: [run({ id: 'real', score: 4 })] }), author: 'Factory-Bot' };
  const bad = { id: 'x', author: 'factory-bot', createdAt: '', body: '<!-- heartbeat -->\n```json\n{bad\n```' }; // unreadable JSON is ignored
  const board = { comments: async () => [forged, bad, { ...real, body: 'hello' }, real] } as unknown as Board;
  const rows = await readRuns(board, 'hb', ['factory-bot']);
  assert.deepEqual(rows.map((r) => [r.id, r.score]), [['real', 4]]);
  await assert.rejects(readRuns(board, 'hb', []), /owners\.bots/);
});

test('rescores apply per scorer: human beats a newer judge, else newest; v5 rescore is done-conditions', () => {
  const comments = [
    beat({ runs: [], rescores: [{ id: 'a', scorer: 'redundant-tests', score: 'fail', by: 'judge' }, { id: 'a', score: 0 }] }),
    beat({ runs: [], rescores: [{ id: 'a', scorer: 'redundant-tests', score: 'pass', by: 'human' }, { id: 'a', score: 3 }] }),
    beat({ runs: [run({ id: 'a', score: 4, scores: { 'done-conditions': 4, 'redundant-tests': 'fail', 'scope-creep': 'pass' } })] }),
  ];
  const [a] = flattenRuns(comments);
  assert.equal(a.score, 0);
  assert.deepEqual(a.scores, { 'done-conditions': 0, 'redundant-tests': 'pass', 'scope-creep': 'pass' });
});

const scoresC = (o: object, author = 'bot', createdAt = '2026-11-08T12:00:00Z'): Comment =>
  ({ id: 's', author, createdAt, body: `<!-- scores -->\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\`` });

test('readRuns: scores comments by bots and grade comments by owners apply; others are ignored', async () => {
  const board = { comments: async () => [
    { id: 'g2', author: 'stranger', createdAt: '', body: 'agentic-sdlc:grade a done-conditions 0' },
    { id: 'g1', author: 'PO', createdAt: '', body: 'agentic-sdlc:grade a redundant-tests pass' },
    scoresC({ run: 'a', scores: { 'done-conditions': 1 } }, 'mallory'),
    scoresC({ run: 'a', scores: { 'done-conditions': 2, 'redundant-tests': 'fail' }, cap: 'outcome failed' }),
    beat({ runs: [run({ id: 'a', score: 4 })] }),
  ] } as unknown as Board;
  const [a] = await readRuns(board, 'hb', ['bot'], {}, ['po', 'fo']);
  assert.equal(a.score, 2);
  assert.deepEqual(a.scores, { 'done-conditions': 2, 'redundant-tests': 'pass' }); // the owner's grade beats the judge
});

test('learningState: cycles since the last improve-factory heartbeat, due at every_cycles, off unless enabled', () => {
  const comments = [
    beat({ at: '2026-11-08T00:00:00Z', runs: [run({ id: '5', skill: 'judge-run' })] }),
    beat({ at: '2026-11-07T00:00:00Z', runs: [run({ id: '4' })] }),
    beat({ at: '2026-11-06T00:00:00Z', runs: [run({ id: '3', skill: 'improve-factory' })] }),
    beat({ at: '2026-10-01T00:00:00Z', runs: [run({ id: '1', skill: 'bench' })] }),
  ];
  assert.deepEqual(learningState(comments, 2, true), { due: true, judge: true, cyclesSince: 2 });
  assert.equal(learningState(comments, 3, true).due, false);
  assert.deepEqual(learningState(comments, 2), { due: false, judge: false, cyclesSince: 2 }); // learning.enabled unset: off
  assert.equal(learningState(comments.slice(0, 2), 3, true).cyclesSince, 2); // no improve-factory yet: every heartbeat
});

test('plan scorers and caps; record validates names and scales and applies the cap', () => {
  const root = mkdtempSync(join(tmpdir(), 'sc-'));
  mkdirSync(join(root, '.agents', 'scorers'), { recursive: true });
  writeFileSync(join(root, '.agents', 'scorers', 'r.md'), '---\nname: redundant-tests\napplies_to: [implement-spec]\nscale: pass-fail\n---\nq\n');
  writeFileSync(join(root, '.agents', 'scorers', 'x.md'), '---\nname: release-only\napplies_to: [release]\nscale: 0-4\n---\nq\n');
  assert.deepEqual(scorersFor(root, 'implement-spec').map((s) => s.name), ['done-conditions', 'redundant-tests']);
  const r = run({ id: 'a', outcome: 'failed', cr: '7' }) as any;
  const cr = { checks: [{ name: 'Required', state: 'failure' }, { name: 'lint', state: 'failure' }] } as any;
  assert.deepEqual(hardFacts(r, cr, ['Required']), { score: 1, facts: ['outcome failed', 'red check on the head: Required'] });
  assert.equal(hardFacts(run({}) as any), null);
  const p = { run: r, scorers: scorersFor(root, 'implement-spec'), evidence: {}, cap: hardFacts(r, cr, ['Required']) };
  const body = scoresComment(p, { scores: { 'done-conditions': 4, 'redundant-tests': 'pass' } }, 'T');
  assert.ok(body.startsWith('<!-- scores -->\n'));
  assert.deepEqual(JSON.parse(body.split('\n')[2]), { run: 'a', at: 'T', scores: { 'done-conditions': 1, 'redundant-tests': 'pass' }, cap: 'outcome failed; red check on the head: Required' });
  assert.throws(() => scoresComment(p, { scores: { 'done-conditions': 5 } }), /not on scale 0-4/);
  assert.throws(() => scoresComment(p, { scores: { 'done-conditions': 3, 'release-only': 2 } }), /does not apply/);
  assert.throws(() => scoresComment(p, { scores: { 'redundant-tests': 'pass' } }), /done-conditions is required/);
});

test('cli: plan, record and stale on a local board', async () => {
  const root = mkdtempSync(join(tmpdir(), 'led-'));
  const { createLocalBoard } = await import('../src/board/local.ts');
  const binding = { board: { adapter: 'local', options: {} }, forge: { adapter: 'github', options: {} }, heartbeat: { ticket: '1' }, owners: { bots: ['local'] }, learning: { enabled: true, every_cycles: 1 } } as any;
  const ctx = { root, binding, env: {}, exec: () => { throw new Error('no forge'); }, http: async () => ({}) };
  const board = createLocalBoard({ ...ctx, options: {} });
  await board.create({ title: 'heartbeat', body: '', status: 'Backlog' });
  const out: string[] = [];
  const log = console.log, err = console.error;
  console.log = (s: string) => out.push(s);
  console.error = () => {};
  try {
    assert.equal(await cli(['stale', '--max-hours', '2'], ctx), 1); // no heartbeat yet
    await board.comment('1', beat({ runs: [run({ id: 'r9', outcome: 'timeout' })] }).body);
    assert.equal(await cli(['stale', '--max-hours', '2'], ctx), 0);
    assert.equal(await cli(['plan', '--run', 'r9'], ctx), 0);
    assert.deepEqual(JSON.parse(out.at(-1)!).cap, { score: 1, facts: ['outcome timeout'] });
    writeFileSync(join(root, 's.json'), JSON.stringify({ scores: { 'done-conditions': 3 } }));
    assert.equal(await cli(['record', '--run', 'r9', '--file', 's.json'], ctx), 0);
    assert.equal(await cli(['runs'], ctx), 0);
    assert.equal(JSON.parse(out.at(-1)!)[0].score, 1);
    assert.equal(await cli(['summary'], ctx), 0);
    assert.deepEqual(JSON.parse(out.at(-1)!).learning, { due: true, judge: true, cyclesSince: 1 });
    assert.equal(await cli(['record', '--run', 'r9'], ctx), 2);
    assert.equal(await cli(['plan', '--run', 'nope'], ctx), 1);
  } finally {
    console.log = log; console.error = err;
  }
});

test('learningState: review and learn heartbeats count no cycle; a learn heartbeat with improve-factory resets the count', () => {
  const comments = [
    beat({ at: '2026-11-08T03:00:00Z', kind: 'review', runs: [run({ id: 'r', skill: 'review-pr' })] }),
    beat({ at: '2026-11-08T02:00:00Z', runs: [] }),
    beat({ at: '2026-11-08T01:00:00Z', kind: 'learn', runs: [run({ id: 'l', skill: 'improve-factory' })] }),
    beat({ at: '2026-11-08T00:00:00Z', runs: [] }),
    beat({ at: '2026-11-07T00:00:00Z', runs: [] }),
  ];
  assert.deepEqual(learningState(comments, 2, true), { due: false, judge: true, cyclesSince: 1 });
});

test('summarise: tokens per ticket, top 20 by tokens, over-budget tickets marked and always listed; capped is a hard fact', () => {
  const rows = [
    run({ id: '1', ticket: '7', tokens: 900, minutes: 4 }),
    run({ id: '2', ticket: '7', tokens: 700, minutes: 3, outcome: 'capped', error: 'max turns' }),
    run({ id: '3', ticket: '8', skill: 'review-pr', tokens: 100 }),
    run({ id: '4', ticket: '9' }),
    run({ id: '5' }),
  ] as any[];
  const s = summarise(rows, { maxTokensPerTicket: 1000 });
  assert.deepEqual(s.tickets, [
    { ticket: '7', runs: 2, tokens: 1600, minutes: 7, reworks: 1, overBudget: true },
    { ticket: '8', runs: 1, tokens: 100, minutes: 0 },
    { ticket: '9', runs: 1, tokens: 0, minutes: 0 },
  ]);
  assert.deepEqual(s.ticketTotals, { tickets: 3, runs: 4, tokens: 1700, minutes: 7 });
  assert.equal(summarise(rows).tickets[0].overBudget, undefined);
  const many = Array.from({ length: 25 }, (_, i) => run({ id: `m${i}`, ticket: `t${i}`, tokens: 10 + i })) as any[];
  assert.equal(summarise(many).tickets.length, 20);
  assert.equal(summarise(many, { maxTokensPerTicket: 12 }).tickets.length, 22); // the 20 largest, and every ticket over 12 tokens is among them already
  assert.deepEqual(hardFacts(run({ outcome: 'capped' }) as any), { score: 1, facts: ['outcome capped'] });
  assert.equal(clusters([run({ id: 'a', outcome: 'capped', error: 'max turns 50', ticket: '1' }), run({ id: 'b', outcome: 'capped', error: 'max turns 80', ticket: '2' })] as any[])[0].count, 2);
});

test('unscorable: needs a reason, is counted per scorer, and is left out of rates, medians, clusters and the cap', () => {
  const p = { run: run({ id: 'a' }) as any, scorers: [{ name: 'done-conditions', scale: '0-4', applies_to: '*' }, { name: 'redundant-tests', scale: 'pass-fail', applies_to: '*' }] as any, cap: null };
  assert.throws(() => scoresComment(p, { scores: { 'done-conditions': 3, 'redundant-tests': 'unscorable' } }), /unscorable needs a reason/);
  const body = scoresComment(p, { scores: { 'done-conditions': 'unscorable', 'redundant-tests': 'unscorable' }, reasons: { 'done-conditions': 'no diff', 'redundant-tests': 'no diff' } }, 'T');
  assert.deepEqual(JSON.parse(body.split('\n')[2]).scores, { 'done-conditions': 'unscorable', 'redundant-tests': 'unscorable' }); // no cap on a non-grade
  const rows = [
    run({ id: '1', ticket: '7', scores: { 'redundant-tests': 'fail', 'done-conditions': 4 } }),
    run({ id: '2', ticket: '8', scores: { 'redundant-tests': 'unscorable', 'done-conditions': 'unscorable' } }),
    run({ id: '3', ticket: '9', scores: { 'redundant-tests': 'unscorable' } }),
  ] as any[];
  const s = summarise(rows);
  assert.deepEqual(s.byScorer['redundant-tests'], { runs: 1, failRate: 1, median: null, unscorable: 2 });
  assert.deepEqual(s.byScorer['done-conditions'], { runs: 1, failRate: 0, median: 4, unscorable: 1 });
  assert.deepEqual(s.failureClusters, []);
  // a human grade may be unscorable and then replaces the judge's score
  const hb = beat({ at: '2026-11-08T00:00:00Z', runs: [run({ id: 'g', score: 3 })] });
  const grade: Comment = { id: 'g1', author: 'o', createdAt: '2026-11-08T01:00:00Z', body: 'agentic-sdlc:grade g done-conditions unscorable' };
  const [g] = flattenRuns([grade, hb]);
  assert.equal(g.scores!['done-conditions'], 'unscorable');
  assert.equal(g.score, undefined);
});

test('unscorable: done-conditions is refused while a hard fact caps the run, and a human unscorable grade on a failed run is ignored', () => {
  const p = { run: run({ id: 'a' }) as any, scorers: [{ name: 'done-conditions', scale: '0-4', applies_to: '*' }, { name: 'redundant-tests', scale: 'pass-fail', applies_to: '*' }] as any, cap: { score: 1, facts: ['red'] } };
  assert.throws(() => scoresComment(p, { scores: { 'done-conditions': 'unscorable' }, reasons: { 'done-conditions': 'no diff' } }), /unscorable is not allowed while a hard fact caps the run/);
  const ok = scoresComment(p, { scores: { 'done-conditions': 4, 'redundant-tests': 'unscorable' }, reasons: { 'redundant-tests': 'no diff' } }, 'T');
  assert.deepEqual(JSON.parse(ok.split('\n')[2]).scores, { 'done-conditions': 1, 'redundant-tests': 'unscorable' });
  const hb = beat({ at: '2026-11-08T00:00:00Z', runs: [run({ id: 'f', outcome: 'failed', score: 1 })] });
  const grade: Comment = { id: 'g1', author: 'o', createdAt: '2026-11-08T01:00:00Z', body: 'agentic-sdlc:grade f done-conditions unscorable' };
  const [f] = flattenRuns([grade, hb]);
  assert.equal(f.score, 1);
  assert.equal(f.scores?.['done-conditions'], undefined);
});

test('measures: DORA from the board and forge, null with a why, and the error budget', async () => {
  const now = Date.parse('2026-11-14T00:00:00Z');
  const h = (n: number) => new Date(now - n * 36e5).toISOString();
  const item = (id: string, o: object) => ({ id, title: id, url: '', status: 'Done', labels: [], fields: {}, children: [], assignees: [], createdAt: h(100), updatedAt: h(10), statusChangedAt: h(10), ...o });
  const items = [
    item('1', { fields: { shipped: 'On production', release_version: '1.0' }, createdAt: h(58), statusChangedAt: h(10) }), // lead 48h
    item('2', { fields: { shipped: 'On production', release_version: '1.0' }, createdAt: h(110), statusChangedAt: h(10) }), // lead 100h
    item('3', { labels: ['bug'], fields: { priority: 'P0', shipped: 'On production' }, createdAt: h(30), statusChangedAt: h(20), updatedAt: h(20) }), // failure, restored in 10h
    item('4', { status: 'Signals', labels: ['signal:deploy'], createdAt: h(5), updatedAt: h(5), statusChangedAt: h(5) }),
    item('5', { status: 'Ready', createdAt: h(500) }),
  ] as any[];
  const board = { list: async () => items } as unknown as Board;
  const crs = [{ n: '10', closes: ['1'] }, { n: '11', closes: ['2'] }] as any[];
  const forge = {
    list: async () => crs,
    comments: async (n: string) => (n === '10' ? [{ author: 'Bot', body: '<!-- review-pr\nVerdict: REMEDIATION REQUIRED' }, { author: 'rando', body: '' }] : [{ author: 'rando', body: '<!-- review-pr\nVerdict: REMEDIATION REQUIRED' }]),
  } as any;
  const binding = { product: { environments: ['staging', 'production'], slo: { change_failure_rate_max: 0.5, window_days: 30 } }, board: { labels: { bug: 'bug' } }, owners: { bots: ['bot'] } } as any;
  const m = await measures({ board, forge, binding, days: 7, now });
  assert.equal(m.deployFrequency.changes, 3);
  assert.equal(m.deployFrequency.versions, 1);
  assert.equal(m.deployFrequency.value, 3);
  assert.equal(m.leadTimeHours.value, 48); // tickets 1,2,3 reached Done: 48, 100, 10 -> median 48
  assert.deepEqual(m.changeFailureRate, { value: 0.67, failures: 2, changes: 3 });
  assert.equal(m.timeToRestoreHours.value, 10);
  assert.deepEqual(m.reworkRate, { value: 0.5, crs: 2, reworked: 1 }); // only a trusted author's report counts
  assert.deepEqual(m.errorBudget, { max: 0.5, windowDays: 30, actual: 0.67, exhausted: true });
  const empty = await measures({ board: { list: async () => [] } as any, binding: { ...binding, product: { environments: ['a'] } }, now });
  assert.equal(empty.changeFailureRate.value, null);
  assert.match((empty.changeFailureRate as { why?: string }).why!, /no change shipped/);
  assert.equal(empty.reworkRate.value, null);
  assert.equal(empty.errorBudget, undefined);
  // Failures and nothing shipped: no rate, and the budget is exhausted.
  const sig = { id: '9', title: 's', status: 'Signals', labels: ['signal:deploy'], fields: {}, createdAt: new Date(now - 864e5).toISOString(), updatedAt: new Date(now).toISOString() };
  const spent = await measures({ board: { list: async () => [sig] } as any, binding, now });
  assert.equal(spent.errorBudget?.actual, null);
  assert.equal(spent.errorBudget?.exhausted, true);
  assert.match(spent.errorBudget?.why ?? '', /no change shipped/);
  assert.equal((await measures({ board: { list: async () => [] } as any, binding, now })).errorBudget?.exhausted, false);
});

test('cli: a flag without a value and an unknown export format are one-line usage errors with exit 2', async () => {
  const errs: string[] = [];
  const err = console.error;
  console.error = (s: string) => errs.push(String(s));
  try {
    const ctx = { root: '.', binding: {} as any, env: {}, exec: () => '', http: async () => ({}) };
    assert.equal(await cli(['runs', '--since'], ctx), 2);
    assert.equal(await cli(['export', '--format', 'xml'], ctx), 2);
    assert.equal(await cli(['export'], ctx), 2);
    assert.equal(await cli(['runs', '--bogus', 'x'], ctx), 2);
    assert.deepEqual(errs, ['--since needs a value', '--format must be otlp or cdevents', '--format must be otlp or cdevents', 'unknown flag --bogus']);
  } finally { console.error = err; }
});

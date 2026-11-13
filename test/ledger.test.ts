import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clusters, flattenRuns, hashSkill, hardFacts, learningState, median, normaliseError, parseHeartbeat, readRuns, scoresComment, scorersFor, summarise, cli } from '../src/ledger.ts';
import type { Board, Comment } from '../src/ports.ts';

const beat = (hb: object, createdAt = '2026-11-08T00:00:00Z'): Comment => ({
  id: 'c', author: 'bot', createdAt, body: `<!-- heartbeat -->\n\`\`\`json\n${JSON.stringify(hb)}\n\`\`\``,
});
const run = (o: object) => ({ id: 'r1', skill: 'implement-spec', skillHash: 'abc', tier: 'balanced', model: 'm1', outcome: 'done', ...o });

test('parseHeartbeat reads the fenced JSON and ignores other comments', () => {
  assert.deepEqual(parseHeartbeat(beat({ v: 5 }).body), { v: 5 });
  assert.equal(parseHeartbeat('hello'), undefined);
  assert.equal(parseHeartbeat('<!-- heartbeat -->\n```json\n{bad\n```'), undefined);
});

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

test('normaliseError folds ids, paths, shas and quotes', () => {
  assert.equal(
    normaliseError('Verify failed in src/a.ts:12 at 3f9c2d1e for "PROJ-45"'),
    normaliseError('verify failed in  lib\\b.ts:7 at 0a1b2c3d4e for "LIN-9"'),
  );
});

test('median handles even, odd and empty', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('summarise groups by skill and model; clusters need two hits', () => {
  const rows = [
    run({ id: '1', score: 4, cost_usd: 1, minutes: 10 }),
    run({ id: '2', score: 2, cost_usd: 2, minutes: 5, outcome: 'failed', error: 'fast_check red in src/x.ts', ticket: '7' }),
    run({ id: '3', score: 1, cost_usd: 0.5, model: 'm2', outcome: 'failed', error: 'fast_check red in src/y.ts', ticket: '8' }),
    run({ id: '4', skill: 'shape', executor: 'command', ref: 'bot-1', outcome: 'failed', error: 'once only' }),
  ] as any[];
  const s = summarise(rows);
  assert.deepEqual(s.bySkill['implement-spec'], { runs: 3, medianScore: 2, failureRate: 2 / 3, cost_usd: 3.5, minutes: 15 });
  assert.equal(s.byModel.m2.runs, 1);
  assert.equal(s.byExecutor.harness.runs, 3);
  assert.equal(s.byExecutor.command.runs, 1);
  assert.deepEqual(clusters(rows), [{ skill: 'implement-spec', error: 'fast_check red in <path>', count: 2, tickets: ['7', '8'] }]);
});

test('hashSkill is stable across line endings and changes with content', () => {
  const mk = (eol: string, extra = '') => {
    const d = mkdtempSync(join(tmpdir(), 'skill-'));
    mkdirSync(join(d, 'references'));
    writeFileSync(join(d, 'SKILL.md'), `a${eol}b${extra}`);
    writeFileSync(join(d, 'references', 'x.md'), 'x');
    return d;
  };
  assert.equal(hashSkill(mk('\n')), hashSkill(mk('\r\n')));
  assert.notEqual(hashSkill(mk('\n')), hashSkill(mk('\n', 'c')));
  assert.match(hashSkill(mk('\n')), /^[0-9a-f]{12}$/);
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
  const board = { comments: async () => [forged, real] } as unknown as Board;
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

test('summarise: byScorer, scorer-fail clusters across tickets, measures from rows', () => {
  const rows = [
    run({ id: '1', ticket: '7', cr: '70', cost_usd: 2, scores: { 'done-conditions': 4, 'redundant-tests': 'fail' } }),
    run({ id: '2', ticket: '8', cr: '80', cost_usd: 2, scores: { 'done-conditions': 1, 'redundant-tests': 'fail' } }),
    run({ id: '3', ticket: '8', cr: '81', cost_usd: 2, scores: { 'redundant-tests': 'pass' } }),
    run({ id: '4', skill: 'judge-run', cost_usd: 2 }),
  ] as any[];
  const s = summarise(rows, ['70', '80']);
  assert.deepEqual(s.byScorer['redundant-tests'], { runs: 3, failRate: 2 / 3, median: null });
  assert.deepEqual(s.byScorer['done-conditions'], { runs: 2, failRate: 0.5, median: 2.5 });
  assert.deepEqual(s.failureClusters, [{ skill: 'implement-spec', scorer: 'redundant-tests', count: 2, tickets: ['7', '8'] }]);
  // only runs on merged CRs 70 and 80 count: 4 / 2, not 6 / 2
  assert.deepEqual(s.measures, { costPerCR: 2, learningSpendShare: 0.25 });
  assert.equal(summarise(rows).measures.costPerCR, 2); // no merged list: every cr, 6 / 3
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

test('learningState: cycles since the last improve-factory heartbeat, due at every_cycles, week spend of learning skills', () => {
  const now = Date.parse('2026-11-09T00:00:00Z');
  const comments = [
    beat({ at: '2026-11-08T00:00:00Z', runs: [run({ id: '5', skill: 'judge-run', cost_usd: 0.5 })] }),
    beat({ at: '2026-11-07T00:00:00Z', runs: [run({ id: '4', cost_usd: 9 })] }),
    beat({ at: '2026-11-06T00:00:00Z', runs: [run({ id: '3', skill: 'improve-factory', cost_usd: 2 })] }),
    beat({ at: '2026-10-01T00:00:00Z', runs: [run({ id: '1', skill: 'bench', cost_usd: 7 })] }),
  ];
  assert.deepEqual(learningState(comments, 2, now), { due: true, cyclesSince: 2, spentWeekUsd: 2.5 });
  assert.equal(learningState(comments, 3, now).due, false);
  assert.equal(learningState(comments, 2, now, 2.5).due, false); // the week's learning spend reached the budget
  assert.equal(learningState(comments, 2, now, 10).due, true);
  assert.equal(learningState(comments.slice(0, 2), 3, now).cyclesSince, 2); // no improve-factory yet: every heartbeat
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
  const binding = { board: { adapter: 'local', options: {} }, forge: { adapter: 'github', options: {} }, heartbeat: { ticket: '1' }, owners: { bots: ['local'] }, learning: { every_cycles: 1 } } as any;
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
    assert.deepEqual(JSON.parse(out.at(-1)!).learning, { due: true, cyclesSince: 1, spentWeekUsd: 0 });
    assert.equal(await cli(['record', '--run', 'r9'], ctx), 2);
    assert.equal(await cli(['plan', '--run', 'nope'], ctx), 1);
  } finally {
    console.log = log; console.error = err;
  }
});

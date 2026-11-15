import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBoard } from '../src/board/index.ts';
import { MovedError } from '../src/ports.ts';
import { fakeCtx } from './helpers.ts';

const mk = () => createBoard(fakeCtx(mkdtempSync(join(tmpdir(), 'bl-')), {}, () => ({})).ctx);

test('create, list, move with only-from, set, label, close', async () => {
  const b = mk();
  const a = await b.create({ title: 'Fix login', body: 'the button', status: 'Backlog' });
  assert.equal(a.id, '1');
  assert.equal((await b.create({ title: 'Other', body: '', status: 'Ready', parent: '1' })).id, '2');
  assert.deepEqual((await b.get('1')).children, ['2']);
  assert.equal((await b.list({ status: ['Ready'] })).length, 1);
  assert.equal((await b.list({ search: 'LOGIN button' })).length, 1);
  await assert.rejects(b.move('1', 'Ready', 'Ready'), MovedError);
  assert.equal((await b.get('1')).status, 'Backlog');
  assert.equal((await b.move('1', 'Ready', 'Backlog')).status, 'Ready');
  assert.equal((await b.set('1', 'size', 'M')).fields.size, 'M');
  assert.equal((await b.set('1', 'size', null)).fields.size, undefined);
  assert.deepEqual((await b.label('1', 'add', 'bug')).labels, ['bug']);
  assert.equal((await b.close('1', 'not_planned')).status, 'Cancelled');
});

test('comments come newest first and narrow by marker, last and author, with --last counted after the filter', async () => {
  const { cli } = await import('../src/board/index.ts');
  const f = fakeCtx(mkdtempSync(join(tmpdir(), 'bl-')), {}, () => ({}));
  const b = createBoard(f.ctx);
  await b.create({ title: 't', body: '', status: 'Backlog' });
  await b.comment('1', '<!-- heartbeat -->\ntrusted');
  await b.comment('1', '<!-- heartbeat -->\nforged');
  const file = join(f.ctx.root, '.agents', 'board.json');
  const db = JSON.parse(readFileSync(file, 'utf8'));
  db.comments['1'][1].author = 'stranger';
  writeFileSync(file, JSON.stringify(db));
  const out: string[] = [];
  const log = console.log;
  console.log = (s: string) => out.push(s);
  try {
    assert.equal(await cli(['comments', '1', '--marker', 'heartbeat', '--last', '1', '--author', 'nobody', '--author', 'LOCAL'], f.ctx), 0);
  } finally { console.log = log; }
  assert.deepEqual(JSON.parse(out[0]).map((c: { body: string }) => c.body), ['<!-- heartbeat -->\ntrusted']);
});

test('cli comments --trusted keeps the binding bots and owners only', async () => {
  const { cli } = await import('../src/board/index.ts');
  const f = fakeCtx(mkdtempSync(join(tmpdir(), 'bl-')), {}, () => ({}));
  const b = createBoard(f.ctx);
  await b.create({ title: 't', body: '', status: 'Backlog' });
  for (const body of ['by bot', 'by po', 'by stranger']) await b.comment('1', body);
  const file = join(f.ctx.root, '.agents', 'board.json');
  const db = JSON.parse(readFileSync(file, 'utf8'));
  ['Bot', 'po', 'stranger'].forEach((a, i) => { db.comments['1'][i].author = a; });
  writeFileSync(file, JSON.stringify(db));
  f.ctx.binding = { ...f.ctx.binding, owners: { bots: ['bot'], product: 'PO', factory: 'fo' } } as any;
  const out: string[] = [];
  const log = console.log;
  console.log = (s: string) => out.push(s);
  try { assert.equal(await cli(['comments', '1', '--trusted'], f.ctx), 0); } finally { console.log = log; }
  assert.deepEqual(JSON.parse(out[0]).map((c: { body: string }) => c.body), ['by po', 'by bot']);
});

test('board.scope: many repos on one board; a repo lists its own label, the home repo also the unlabelled, create adds the label', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bl-'));
  const at = (scope: unknown) => {
    const f = fakeCtx(root, {}, () => ({}));
    f.ctx.binding = { ...f.ctx.binding, board: { ...f.ctx.binding.board, scope } } as any;
    return createBoard(f.ctx);
  };
  const a = at({ label: 'repo:a' }), home = at({ label: 'repo:b', home: true, repos: ['repo:a', 'repo:b'] });
  const mine = await a.create({ title: 'A work', body: '', status: 'Backlog' });
  assert.deepEqual(mine.labels, ['repo:a']);
  await at(undefined).create({ title: 'New signal', body: '', status: 'Signals', labels: ['signal:alert'] });
  await home.create({ title: 'B work', body: '', status: 'Backlog' });
  const titles = async (b: typeof a) => (await b.list()).map((i) => i.title).sort();
  assert.deepEqual(await titles(a), ['A work']);
  assert.deepEqual(await titles(home), ['B work', 'New signal']);
  assert.equal((await at(undefined).list()).length, 3);
});

test('create and move refuse a status the binding does not list', async () => {
  const f = fakeCtx(mkdtempSync(join(tmpdir(), 'bl-')), {}, () => ({}));
  f.ctx.binding = { ...f.ctx.binding, board: { ...f.ctx.binding.board, statuses: ['Backlog', 'Ready', 'Done', 'Cancelled'] } } as any;
  const b = createBoard(f.ctx);
  await assert.rejects(b.create({ title: 't', body: '', status: 'Nope' }), /status 'Nope' is not in board\.statuses/);
  await b.create({ title: 't', body: '', status: 'Backlog' });
  await assert.rejects(b.move('1', 'Nope'), /not in board\.statuses/);
  assert.equal((await b.get('1')).status, 'Backlog');
  assert.equal((await b.move('1', 'Ready')).status, 'Ready');
});

test('milestone sets and clears the milestone of an existing ticket', async () => {
  const b = mk();
  await b.create({ title: 't', body: '', status: 'Backlog' });
  assert.equal((await b.milestone('1', 'M1')).milestone, 'M1');
  assert.equal((await b.get('1')).milestone, 'M1');
  assert.equal((await b.milestone('1', null)).milestone, undefined);
  await assert.rejects(b.milestone('9', 'M1'), /no item 9/);
});

test('board cli: an unknown flag, a flag without a value and an unreadable --body-file are usage errors, --k=v works, milestone sets and clears', async () => {
  const { cli } = await import('../src/board/index.ts');
  const f = fakeCtx(mkdtempSync(join(tmpdir(), 'bl-')), {}, () => ({}));
  const run = async (...argv: string[]) => {
    const out: string[] = [], err: string[] = [];
    const log = console.log, error = console.error;
    console.log = (s: string) => out.push(s); console.error = (s: string) => err.push(s);
    try { return { code: await cli(argv, f.ctx), out: out.join(''), err: err.join('') }; } finally { console.log = log; console.error = error; }
  };
  let r = await run('list', '--bogus');
  assert.deepEqual([r.code, r.err], [2, 'unknown flag --bogus for board list']);
  r = await run('list', '--label');
  assert.deepEqual([r.code, r.err], [2, '--label needs a value']);
  r = await run('create', '--title', 't', '--status', 'Backlog', '--body-file', join(f.ctx.root, 'missing.md'));
  assert.equal(r.code, 2);
  assert.match(r.err, /--body-file cannot be read: .*missing\.md/);
  writeFileSync(join(f.ctx.root, 'b.md'), 'body');
  r = await run('create', '--title=t', '--status=Backlog', `--body-file=${join(f.ctx.root, 'b.md')}`, '--milestone=M1');
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.out).milestone, 'M1');
  r = await run('milestone', '1', '--clear');
  assert.equal(JSON.parse(r.out).milestone, undefined);
  r = await run('milestone', '1', 'M2');
  assert.equal(JSON.parse(r.out).milestone, 'M2');
  r = await run('set', '1', 'size', '--clear', '--oops');
  assert.equal(r.code, 2);
  r = await run('milestone', '1', 'M3', '--clear');
  assert.equal(r.code, 2);
  assert.match(r.err, /a name and --clear together/);
  for (const v of ['abc', '1.5', '-1', '']) {
    r = await run('comments', '1', '--last', v);
    assert.deepEqual([r.code, r.err], [2, `--last needs a whole number, got '${v}'`]);
  }
  assert.equal((await run('comments', '1', '--last=1')).code, 0);
});

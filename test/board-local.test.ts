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

test('comments newest first with marker and last', async () => {
  const b = mk();
  await b.create({ title: 't', body: '', status: 'Backlog' });
  await b.comment('1', '<!-- heartbeat -->\none');
  await b.comment('1', 'plain');
  assert.equal((await b.comments('1'))[0].body, 'plain');
  assert.equal((await b.comments('1', { marker: 'heartbeat' })).length, 1);
  assert.equal((await b.comments('1', { last: 1 })).length, 1);
});

test('cli comments --author keeps only those authors, and --last counts after the filter', async () => {
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

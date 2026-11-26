// The cycle's next work: `next` run in-process on the local board (.agents/board.json, written by the fixtures) and a
// fake forge port holding the scenario's open CRs; the routes are the package's skills/sdlc/routes.yml.
// `ledger heartbeat` runs as the CLI. State on w.state: crs (the open CRs), next (the result of `next`).
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { next } from '../../src/next.ts';
import { createLocalBoard } from '../../src/board/local.ts';
import { stamp } from '../../src/comments.ts';
import { parseHeartbeat } from '../../src/ledger.ts';
import type { AdapterContext, CR, Forge } from '../../src/ports.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { writePack } from '../support/skillfix.ts';
import type { World } from '../support/world.ts';

type Db = { items: Record<string, unknown>[]; comments: Record<string, Record<string, unknown>[]> };
const file = (w: World) => w.path('.agents', 'board.json');
const load = (w: World): Db => JSON.parse(readFileSync(file(w), 'utf8'));
const save = (w: World, db: Db) => writeFileSync(file(w), JSON.stringify(db));
const item = (id: string, status: string, labels: string[] = [], fields: Record<string, string> = {}, createdAt = '2026-11-01T00:00:00Z') =>
  ({ id, title: id, url: '', status, labels, fields, children: [], assignees: [], createdAt, updatedAt: createdAt });

Given('a cycle on the local board', (w) => {
  w.binding({
    owners: { product: 'po', factory: 'fo', bots: ['bot'] }, heartbeat: { ticket: '1' }, parallel_agents: 3,
    board: { labels: { human: 'needs-human', bug: 'bug', feature: 'feature', release: 'release' }, done_statuses: ['Done', 'Cancelled'], env_labels: ['env:staging', 'env:production'] },
    priorities: ['P0', 'High', 'Default', 'Low'], cycle: { max_implementations: 1, min_ready: 2, failure_limit: 2 },
    models: { fast: 'f', balanced: 'b', deep: 'd' }, product: { environments: ['staging', 'production'] }, forge: { review_identity: '', required_checks: ['ci'] },
  });
  mkdirSync(w.path('.agents'), { recursive: true });
  save(w, { items: [item('1', 'Cancelled')], comments: {} });
  writePack(w.path('.agents', 'skills'));
});
Given('these tickets:', (w, t: DataTable) => {
  const db = load(w);
  for (const r of t.hashes()) db.items.push(item(r.id, r.status, (r.labels ?? '').split(',').map((x) => x.trim()).filter(Boolean), r.priority ? { priority: r.priority } : {}, r.created || undefined));
  save(w, db);
});
Given('the owner replied to the ask on {string}', (w, id: string) => {
  const db = load(w);
  db.comments[id] = [
    { id: '1', author: 'bot', createdAt: '2026-11-01T00:00:00Z', body: `${stamp('ask', 'Sign-off')}\n\nmay it ship?` },
    { id: '2', author: 'po', createdAt: '2026-11-01T01:00:00Z', body: 'yes' },
  ];
  save(w, db);
});
Given('the open CR {string} closes {string}', (w, n: string, ticket: string) => {
  const cr: CR = { n, url: '', title: '', source: `${ticket}/x`, target: 'main', headSha: 'h1', baseSha: 'b', draft: false, state: 'open', behind: false, closes: [ticket], checks: [], body: '', author: 'bot', pushedAt: new Date().toISOString() };
  (w.state.crs ??= []).push(cr);
});
Given('parallel_agents is {int}', (w, n: number) => w.binding({ parallel_agents: n }));
Given('the cycle report {string} with a build run on {string} that ended {string}', (w, name: string, ticket: string, outcome: string) => {
  w.write(name, JSON.stringify({ runs: [{ id: 'r1', skill: 'build', ticket, outcome, tokens: 10 }], did: [`built ${ticket}`] }));
});

When('the cycle asks what is next', async (w) => {
  const ctx = w.adapterContext() as AdapterContext;
  const crs: CR[] = w.state.crs ?? [];
  const forge = { list: async () => crs, comments: async () => [] } as unknown as Forge;
  w.state.next = await next({ b: ctx.binding, root: w.root, board: createLocalBoard(ctx), forge, classOf: async () => ({ class: 'product-fast', who: [] }) });
});

const rows = (list: { step: string; ticket?: string; cr?: string }[]) => list.map((x) => ({ step: x.step, ticket: x.ticket ?? '', cr: x.cr ?? '' }));
const want = (t: DataTable) => t.hashes().map((r) => ({ step: r.step, ticket: r.ticket, cr: r.cr }));
Then('the cycle is idle', (w) => assert.equal(w.state.next.idle, true, JSON.stringify(w.state.next)));
Then('there is no work', (w) => assert.deepEqual([...w.state.next.work, ...w.state.next.later], []));
Then('the work is:', (w, t: DataTable) => assert.deepEqual(rows(w.state.next.work), want(t), JSON.stringify(w.state.next)));
Then('the later work is:', (w, t: DataTable) => assert.deepEqual(rows(w.state.next.later), want(t)));
Then('the holds to release are {string}', (w, ids: string) => assert.deepEqual(w.state.next.holds, ids.split(',').map((x) => x.trim())));

const hbComments = (w: World) => (load(w).comments['1'] ?? []) as { body: string }[];
Then('the heartbeat posted is a cycle heartbeat whose run {string} has the tier {string} and the executor {string}', (w, id: string, tier: string, executor: string) => {
  const hb = hbComments(w).map((c) => parseHeartbeat(c.body)).find(Boolean);
  assert.ok(hb, 'no heartbeat was posted');
  const run = hb.runs.find((r: { id: string }) => r.id === id);
  assert.deepEqual([hb.kind, run?.tier, run?.executor, run?.model], ['cycle', tier, executor, 'd']);
});
Then('the last comment on the heartbeat ticket is the done line of the key {string}', (w, key: string) => {
  assert.equal(String(hbComments(w).at(-1)?.body).split('\n')[0], stamp('done', key));
});


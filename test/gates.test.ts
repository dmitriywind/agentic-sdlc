import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CR, Item, Run } from '../src/ports.ts';
import { boardSync, branchNames, diffPaths, factoryClass, globToRegExp, linkage, shipped, shippedOptions, signalOnRed, skillRegression, type Deps } from '../src/gates.ts';
import { compare } from '../src/bench.ts';

const binding = {
  board: { statuses: ['Backlog', 'In review', 'Done', 'Signals'], done_statuses: ['Done'], labels: { human: 'needs-human' } },
  vcs: { trunk: 'main', release_prefix: 'release/', tag_prefix: 'v', change_pattern: '<ticket>/<name>', factory_change_pattern: 'factory/<name>' },
  paths: { factory: ['.agents/**', 'skills/**'] },
  models: { fast: 'f', balanced: 'b', deep: 'd' },
  learning: { auto_merge_classes: ['tuning'] },
  product: { environments: ['staging', 'production'] },
} as any;

const item = (id: string, status: string, fields: Item['fields'] = {}, extra: Partial<Item> = {}): Item =>
  ({ id, title: id, url: '', status, labels: [], fields, children: [], assignees: [], createdAt: '', updatedAt: '', ...extra });

function fakes(items: Item[], crs: Record<string, Partial<CR>> = {}, diffs: Record<string, string> = {}, runs: Run[] = []) {
  const created: any[] = [];
  const statuses: any[] = [];
  const tags: string[] = [];
  const get = (id: string) => items.find((i) => i.id === id)!;
  const board: any = {
    list: async (q: any = {}) => items.filter((i) => (!q.status || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label))),
    get: async (id: string) => { if (!get(id)) throw new Error('nf'); return get(id); },
    move: async (id: string, s: string) => { get(id).status = s; return get(id); },
    set: async (id: string, f: string, v: string | null) => { if (v === null) delete (get(id).fields as any)[f]; else (get(id).fields as any)[f] = v; return get(id); },
    create: async (t: any) => { created.push(t); const i = item(`n${created.length}`, t.status, {}, { title: t.title }); i.labels = t.labels ?? []; items.push(i); return i; },
  };
  const cr = (n: string): CR => ({ n, url: '', title: '', source: '', target: 'main', headSha: '', baseSha: '', draft: false, state: 'open', behind: false, closes: [], checks: [], body: '', ...crs[n] });
  const forge: any = {
    view: async (n: string) => cr(n),
    viewBySha: async (sha: string) => cr(Object.keys(crs).find((k) => crs[k].mergeSha === sha)!),
    diff: async (n: string) => diffs[n] ?? '',
    runs: async () => runs,
    list: async () => Object.keys(crs).map(cr).filter((c) => c.state === 'merged'),
    status: async (sha: string, s: any) => { statuses.push({ sha, ...s }); },
  };
  const vcs: any = { tag: async (n: string) => { tags.push(n); }, head: async () => ({ ref: 'main', sha: 's' }) };
  const d: Deps = { binding, root: '.', board, forge, vcs };
  return { d, items, created, tags, statuses };
}

test('globToRegExp: **, *, ?', () => {
  assert.ok(globToRegExp('.agents/**').test('.agents/skills/a/SKILL.md'));
  assert.ok(globToRegExp('**/x.md').test('x.md'));
  assert.ok(globToRegExp('a/*.md').test('a/b.md'));
  assert.ok(!globToRegExp('a/*.md').test('a/b/c.md'));
  assert.ok(globToRegExp('a?.md').test('ab.md'));
  assert.ok(!globToRegExp('a.md').test('axmd'));
});

test('branch-names', () => {
  const ok = ['main', 'release/2026.1', 'PROJ-45/add-login', '12/fix-it', 'factory/tune-tiers', 'dependabot/npm/x', 'renovate/y'];
  assert.deepEqual(branchNames(binding, ok), []);
  assert.deepEqual(branchNames(binding, ['feature/Foo', '12/Bad_Name', 'wip']), ['feature/Foo', '12/Bad_Name', 'wip']);
});

test('linkage: product CR needs exactly one open ticket named by the source', async () => {
  const { d } = fakes([item('12', 'Backlog'), item('13', 'Done')], {
    ok: { closes: ['12'], source: '12/add-x' },
    two: { closes: ['12', '13'], source: '12/add-x' },
    closed: { closes: ['13'], source: '13/add-x' },
    unnamed: { closes: ['12'], source: 'other/add-x' },
    fac: { closes: [], source: 'factory/tune' },
    mixed: { closes: [], source: 'factory/tune' },
  }, {
    ok: 'diff --git a/src/x.ts b/src/x.ts\n', two: 'diff --git a/src/x.ts b/src/x.ts\n', closed: 'diff --git a/src/x.ts b/src/x.ts\n',
    unnamed: 'diff --git a/src/x.ts b/src/x.ts\n',
    fac: 'diff --git a/.agents/skills/a/SKILL.md b/.agents/skills/a/SKILL.md\n',
    mixed: 'diff --git a/.agents/x b/.agents/x\ndiff --git a/src/y.ts b/src/y.ts\n',
  });
  assert.equal((await linkage(d, 'ok')).ok, true);
  assert.equal((await linkage(d, 'two')).ok, false);
  assert.match((await linkage(d, 'closed')).errors.join(), /not open/);
  assert.match((await linkage(d, 'unnamed')).errors.join(), /does not name/);
  assert.deepEqual(await linkage(d, 'fac'), { ok: true, factory: true, class: 'tuning', errors: [] });
  assert.equal((await linkage(d, 'mixed')).ok, false);
});

test('board-sync: opened -> In review; merged (by cr or sha) -> Done + Not shipped', async () => {
  const f = fakes([item('12', 'Backlog')], { c1: { n: 'c1', closes: ['12'], mergeSha: 'abc' } });
  await boardSync(f.d, { cr: 'c1', event: 'opened' });
  assert.equal(f.items[0].status, 'In review');
  await boardSync(f.d, { sha: 'abc', event: 'merged' });
  assert.equal(f.items[0].status, 'Done');
  assert.equal(f.items[0].fields.shipped, 'Not shipped');
  await assert.rejects(boardSync(f.d, { cr: 'c1', event: 'nope' }));
});

test('shippedOptions derives from environments', () => {
  assert.deepEqual(shippedOptions(['staging', 'production']), ['Not shipped', 'On staging', 'In release', 'On production']);
  assert.deepEqual(shippedOptions(['live']), ['Not shipped', 'On live']);
});

test('shipped: staging, production + tag, failures, unknown env', async () => {
  const f = fakes([
    item('1', 'Done', { shipped: 'Not shipped' }),
    item('2', 'Done', { shipped: 'In release', release_version: '2026.1' }),
    item('3', 'Backlog', { shipped: 'Not shipped' }),
  ], { m1: { state: 'merged', closes: ['1'], mergeSha: 'm1' }, m2: { state: 'merged', closes: ['2'], mergeSha: 'm2' } });
  f.d.isAncestor = () => true;
  await shipped(f.d, 'staging', 'sha1', 'success');
  assert.equal(f.items[0].fields.shipped, 'On staging');
  assert.equal(f.items[1].fields.shipped, 'In release');
  assert.equal(f.items[2].fields.shipped, 'Not shipped');

  await shipped(f.d, 'production', 'sha1', 'failure');
  assert.equal(f.items[1].fields.shipped, 'On staging');
  assert.equal(f.items[1].fields.release_version, undefined);
  assert.deepEqual(f.created[0].labels, ['signal:deploy', 'needs-human']);

  f.items[1].fields.release_version = '2026.1';
  await shipped(f.d, 'production', 'sha1', 'success');
  assert.equal(f.items[0].fields.shipped, 'On production');
  assert.deepEqual(f.tags, ['v2026.1']);

  await shipped(f.d, 'staging', 'sha2', 'failure');
  assert.deepEqual(f.created[1].labels, ['signal:deploy']);
  await assert.rejects(shipped(f.d, 'qa', 'x', 'success'), { name: 'Error' });
});

test('signal-on-red: redacted summary, deduplicated, string ids', async () => {
  const run: Run = { id: '987', name: 'ci', ref: 'main', sha: 'a'.repeat(40), state: 'failure', url: 'https://u:p@ci.example/run/987?token=SECRET', at: '' };
  const f = fakes([], {}, {}, [run]);
  assert.deepEqual(await signalOnRed(f.d, '987'), { created: true, id: 'n1' });
  const body = f.created[0].body as string;
  assert.ok(!body.includes('SECRET') && !body.includes('u:p@'));
  assert.deepEqual(f.created[0].labels, ['signal:ci']);
  assert.equal((await signalOnRed(f.d, '987')).created, false);
  await assert.rejects(signalOnRed(f.d, '1'), /not found/);
});

test('skill-regression: valid pack passes, bad frontmatter and broken links listed', () => {
  const root = mkdtempSync(join(tmpdir(), 'sk-'));
  const mkSkill = (n: string, text: string) => { mkdirSync(join(root, '.agents', 'skills', n), { recursive: true }); writeFileSync(join(root, '.agents', 'skills', n, 'SKILL.md'), text); };
  mkSkill('good', '---\nname: good\ndescription: d\ntier: fast\n---\nsee [x](https://x.y) and [r](SKILL.md#a)\n');
  assert.deepEqual(skillRegression(root), []);
  mkSkill('bad', '---\nname: bad\ntier: huge\n---\n[l](missing.md)\n');
  const errs = skillRegression(root).join('\n');
  assert.match(errs, /bad: frontmatter description missing/);
  assert.match(errs, /tier huge invalid/);
  assert.match(errs, /broken link missing.md/);
});

test('skill-regression: the shipped scorers pass; bad scorer frontmatter is listed', () => {
  const root = mkdtempSync(join(tmpdir(), 'sc-'));
  mkdirSync(join(root, '.agents', 'skills'), { recursive: true });
  cpSync(new URL('../scorers', import.meta.url), join(root, '.agents', 'scorers'), { recursive: true });
  assert.deepEqual(skillRegression(root), []);
  writeFileSync(join(root, '.agents', 'scorers', 'bad.md'), '---\nname: bad\napplies_to: implement-spec\ntier: huge\nscale: 1-10\n---\nq\n');
  assert.deepEqual(skillRegression(root), ['scorers/bad.md: applies_to must be "*" or a list of skills', 'scorers/bad.md: tier huge invalid', 'scorers/bad.md: scale 1-10 invalid']);
});

test('diffPaths: old and new path; quoted or ambiguous headers fail closed', () => {
  assert.deepEqual(diffPaths('diff --git a/src/app.ts b/.agents/app.ts\n'), ['src/app.ts', '.agents/app.ts']);
  assert.deepEqual(diffPaths('diff --git a/a b/c.md b/a b/c.md\n'), ['a b/c.md', 'a b/c.md']);
  assert.equal(diffPaths('diff --git "a/.agents/\\303\\251.md" "b/.agents/\\303\\251.md"\n'), null);
  assert.equal(diffPaths('diff --git a/x b/y b/z\n'), null);
});

test('linkage/factory-class: rename out of factory, quoted path, guardrail vs tuning binding', async () => {
  const headBinding = (over: Record<string, unknown>) => JSON.stringify({ ...binding, ...over });
  const md = '.agents/skills/a/SKILL.md';
  const bdiff = 'diff --git a/.agents/binding.yml b/.agents/binding.yml\n';
  const { d, statuses } = fakes([], {
    ren: {}, q: {}, skill: {}, del: {},
    tune: { headSha: 'tune' }, guard: { headSha: 'guard' }, gate: {}, nohead: { headSha: 'missing' },
  }, {
    ren: 'diff --git a/src/app.ts b/.agents/app.ts\n',
    q: 'diff --git "a/.agents/\\303\\251" "b/.agents/\\303\\251"\n',
    skill: `diff --git a/${md} b/${md}\n`,
    del: `diff --git a/${md} b/${md}\ndeleted file mode 100644\n`,
    tune: bdiff, guard: bdiff, nohead: bdiff,
    gate: 'diff --git a/.agents/gates.yml b/.agents/gates.yml\n',
  });
  d.headFile = (_p, sha) => sha === 'tune' ? headBinding({ models: { ...binding.models, fast: 'f2' } })
    : sha === 'guard' ? headBinding({ paths: { factory: [] } }) : undefined;
  assert.equal((await linkage(d, 'ren')).class, 'product');
  assert.equal((await linkage(d, 'q')).class, 'product');
  assert.equal((await linkage(d, 'skill')).class, 'tuning');
  assert.equal((await linkage(d, 'del')).class, 'guardrail');
  assert.equal((await linkage(d, 'tune')).class, 'tuning');
  assert.equal((await linkage(d, 'gate')).class, 'guardrail');
  assert.equal((await linkage(d, 'nohead')).class, 'guardrail');
  assert.deepEqual(await linkage(d, 'guard'), { ok: true, factory: true, class: 'guardrail', errors: [] });

  assert.equal((await factoryClass(d, 'guard')).state, 'failure');
  assert.equal((await factoryClass(d, 'tune')).state, 'success');
  d.binding = { ...binding, learning: { auto_merge_classes: [] } };
  assert.equal((await factoryClass(d, 'tune')).state, 'failure');
  d.binding = binding;
  assert.deepEqual(statuses.map((s) => [s.sha, s.context, s.state]), [['guard', 'factory-owner', 'failure'], ['tune', 'factory-owner', 'success'], ['tune', 'factory-owner', 'failure']]);
});

test('shipped: only Done tickets whose merge sha is an ancestor; unknown ancestry ships nothing', async () => {
  const mk = () => fakes([
    item('1', 'Done', { shipped: 'Not shipped' }),
    item('2', 'Done', { shipped: 'Not shipped' }),
    item('3', 'Cancelled', { shipped: 'Not shipped' }),
    item('4', 'Done', { shipped: 'Not shipped' }),
  ], {
    a: { state: 'merged', closes: ['1'], mergeSha: 'old' },
    b: { state: 'merged', closes: ['2'], mergeSha: 'new' },
    c: { state: 'merged', closes: ['3'], mergeSha: 'old' },
  });
  const f = mk();
  f.d.binding = { ...binding, board: { ...binding.board, done_statuses: ['Done', 'Cancelled'] } };
  f.d.isAncestor = (x) => x === 'old';
  assert.deepEqual((await shipped(f.d, 'staging', 'dep', 'success')).changed, ['1']);
  assert.equal(f.items[2].fields.shipped, 'Not shipped');

  const g = mk();
  assert.deepEqual(await shipped(g.d, 'staging', 'dep', 'success'), { env: 'staging', result: 'success', changed: [], tags: [], unknown: true });
  g.d.isAncestor = (x) => (x === 'old' ? true : undefined);
  assert.equal((await shipped(g.d, 'staging', 'dep', 'success') as any).unknown, true);
  assert.equal(g.items[0].fields.shipped, 'Not shipped');

  const h = fakes([
    item('5', 'Done', { shipped: 'In release', release_version: '1' }),
    item('6', 'Done', { shipped: 'On staging', release_version: '1' }),
    item('7', 'Done', { shipped: 'On production', release_version: '0' }),
  ]);
  assert.deepEqual((await shipped(h.d, 'production', 'x', 'failure')).changed, ['5']);
});

test('board-sync: sha must resolve, trunk-only merged, keeps shipped, one closes, skips done/held, in-release', async () => {
  const f = fakes([item('12', 'Backlog'), item('13', 'Done'), item('14', 'Backlog', {}, { labels: ['needs-human'] }), item('15', 'In review', { shipped: 'On staging' })], {
    side: { closes: ['12'], target: 'release/1' },
    two: { closes: ['12', '13'] },
    done: { closes: ['13'] },
    held: { closes: ['14'] },
    re: { closes: ['15'] },
  });
  await assert.rejects(boardSync(f.d, { sha: 'nope', event: 'merged' }), /no CR/);
  assert.match((await boardSync(f.d, { cr: 'side', event: 'merged' })).reason!, /not trunk/);
  assert.equal(f.items[0].status, 'Backlog');
  assert.match((await boardSync(f.d, { cr: 'two', event: 'opened' })).reason!, /exactly one/);
  assert.match((await boardSync(f.d, { cr: 'done', event: 'ready' })).reason!, /Done/);
  assert.match((await boardSync(f.d, { cr: 'held', event: 'opened' })).reason!, /held/);
  assert.equal(f.items[2].status, 'Backlog');
  await boardSync(f.d, { cr: 're', event: 'merged' });
  assert.equal(f.items[3].status, 'Done');
  assert.equal(f.items[3].fields.shipped, 'On staging');

  f.items[0].fields = { release_version: '2026.2', shipped: 'On staging' };
  f.items[3].fields = { release_version: '2026.2', shipped: 'On production' };
  f.items[1].fields = { release_version: '2026.1', shipped: 'On staging' };
  assert.deepEqual((await boardSync(f.d, { event: 'in-release', release: '2026.2' })).moved, ['12']);
  assert.equal(f.items[0].fields.shipped, 'In release');
  assert.equal(f.items[3].fields.shipped, 'On production');
  assert.equal(f.items[1].fields.shipped, 'On staging');
  await assert.rejects(boardSync(f.d, { event: 'in-release' }));
});

test('signal-on-red: only trunk or release refs; strict title', async () => {
  const run = (id: string, ref: string, name = 'ci'): Run => ({ id, name, ref, sha: 's', state: 'failure', url: '', at: '' });
  const f = fakes([], {}, {}, [run('1', 'feature/x'), run('2', 'release/2026.1', 'build <script>`$x`' + 'z'.repeat(200))]);
  const r = await signalOnRed(f.d, '1');
  assert.equal(r.created, false);
  assert.match((r as any).reason, /not trunk/);
  assert.equal((await signalOnRed(f.d, '2')).created, true);
  const t = f.created[0].title as string;
  assert.ok(t.length <= 100 && /^[A-Za-z0-9 ._/:@()-]+$/.test(t), t);
});

test('bench compare: no common cases or fewer cases in b is a regression', () => {
  const r = (ids: string[]) => ({ model: 'm', executor: 'harness', at: '', passRate: 1, cost_usd: 0, minutes: 0, cases: ids.map((id) => ({ id, pass: true, minutes: 1 })) }) as any;
  assert.equal(compare(r(['1']), r(['2'])).regressed, true);
  assert.equal(compare(r(['1', '2']), r(['1'])).regressed, true);
  assert.equal(compare(r(['1']), r(['1', '2'])).regressed, false);
});

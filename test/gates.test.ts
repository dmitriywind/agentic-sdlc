import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CR, Item, Run } from '../src/ports.ts';
import { approval, approvers, boardSync, branchNames, diffPaths, globToRegExp, linkage, classify, proofRunner, proofFiles, proofsOnBase, shipped, signalOnRed, skillRegression, type Deps } from '../src/gates.ts';
import { PROOF_FILE } from '../src/bench.ts';

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
  assert.deepEqual(await linkage(d, 'fac'), { ok: true, factory: true, class: 'guardrail', errors: [] }); // skill text change
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
  assert.equal((await signalOnRed(f.d, '1')).created, false);
});

test('skill-regression: valid pack passes, bad frontmatter and broken links listed', () => {
  const root = mkdtempSync(join(tmpdir(), 'sk-'));
  const mkSkill = (n: string, text: string) => { mkdirSync(join(root, '.agents', 'skills', n), { recursive: true }); writeFileSync(join(root, '.agents', 'skills', n, 'SKILL.md'), text); };
  mkSkill('good', '---\nname: good\ndescription: d\nmetadata:\n  tier: fast\n---\nsee [x](https://x.y) and [r](SKILL.md#a)\n');
  assert.deepEqual(skillRegression(root), { errors: [], warnings: [] });
  mkSkill('old', '---\nname: old\ndescription: d\ntier: deep\n---\nx\n');
  assert.deepEqual(skillRegression(root), { errors: [], warnings: ['old: top-level tier is deprecated; move it to metadata.tier'] });
  mkSkill('none', '---\nname: none\ndescription: d\n---\nx\n');
  mkSkill('bad', '---\nname: bad\nmetadata:\n  tier: huge\n---\n[l](missing.md)\n');
  const errs = skillRegression(root).errors.join('\n');
  assert.match(errs, /none: frontmatter metadata.tier missing/);
  assert.match(errs, /bad: frontmatter description missing/);
  assert.match(errs, /tier huge invalid/);
  assert.match(errs, /broken link missing.md/);
});

test('skill-regression: a good scorer passes; bad scorer frontmatter is listed', () => {
  const root = mkdtempSync(join(tmpdir(), 'sc-'));
  mkdirSync(join(root, '.agents', 'skills'), { recursive: true });
  mkdirSync(join(root, '.agents', 'scorers'), { recursive: true });
  writeFileSync(join(root, '.agents', 'scorers', 'good.md'), '---\nname: good\napplies_to: [implement-spec]\nscale: pass-fail\n---\nq\n');
  assert.deepEqual(skillRegression(root).errors, []);
  writeFileSync(join(root, '.agents', 'scorers', 'bad.md'), '---\nname: bad\napplies_to: implement-spec\ntier: huge\nscale: 1-10\n---\nq\n');
  assert.deepEqual(skillRegression(root).errors, ['scorers/bad.md: applies_to must be "*" or a list of skills', 'scorers/bad.md: scale 1-10 invalid']);
});

test('diffPaths: old and new path; quoted or ambiguous headers fail closed', () => {
  assert.deepEqual(diffPaths('diff --git a/src/app.ts b/.agents/app.ts\n'), ['src/app.ts', '.agents/app.ts']);
  assert.deepEqual(diffPaths('diff --git a/a b/c.md b/a b/c.md\n'), ['a b/c.md', 'a b/c.md']);
  assert.equal(diffPaths('diff --git "a/.agents/\\303\\251.md" "b/.agents/\\303\\251.md"\n'), null);
  assert.equal(diffPaths('diff --git a/x b/y b/z\n'), null);
});

const skillMd = (tier: string, body = 'rules\n', extra = '') => `---\nname: a\ndescription: d\nmetadata:\n  tier: ${tier}\n${extra}---\n${body}`;

/** Classes the CRs whose diffs and files at base/head shas are given; a suite for skill `a` lives in d.root. */
function classFakes(benched: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'cls-'));
  if (benched) {
    mkdirSync(join(root, '.agents', 'bench', 'suites'), { recursive: true });
    writeFileSync(join(root, '.agents', 'bench', 'suites', 's.json'), JSON.stringify({ name: 's', skill: 'a', cases: [{ id: '1' }] }));
  }
  const md = '.agents/skills/a/SKILL.md';
  const bdiff = 'diff --git a/.agents/binding.yml b/.agents/binding.yml\n';
  const mdiff = `diff --git a/${md} b/${md}\n`;
  const files: Record<string, string> = {
    'base:binding': JSON.stringify(binding),
    'tune:binding': JSON.stringify({ ...binding, models: { ...binding.models, fast: 'f2' } }),
    'guard:binding': JSON.stringify({ ...binding, paths: { factory: [] } }),
    'base:skill': skillMd('fast'),
    'tier:skill': skillMd('deep'),
    'text:skill': skillMd('fast', 'other rules\n'),
    'both:skill': skillMd('deep', 'other rules\n'),
    'desc:skill': skillMd('deep', 'rules\n', 'license: x\n'),
    'badtier:skill': skillMd('huge'),
  };
  const crs: Record<string, Partial<CR>> = {}, diffs: Record<string, string> = {};
  for (const [n, d] of Object.entries({ tune: bdiff, guard: bdiff, nohead: bdiff, tier: mdiff, text: mdiff, both: mdiff, desc: mdiff, badtier: mdiff })) {
    crs[n] = { headSha: n, baseSha: 'base', source: `factory/${n}` };
    diffs[n] = d;
  }
  Object.assign(crs, { ren: {}, q: {}, del: {}, gate: {}, mix: {} });
  Object.assign(diffs, {
    mix: 'diff --git a/src/app.ts b/src/app.ts\ndiff --git a/.agents/binding.yml b/.agents/binding.yml\n',
    ren: 'diff --git a/src/app.ts b/.agents/app.ts\n',
    q: 'diff --git "a/.agents/\\303\\251" "b/.agents/\\303\\251"\n',
    del: `${mdiff}deleted file mode 100644\n`,
    gate: 'diff --git a/.agents/gates.yml b/.agents/gates.yml\n',
  });
  const f = fakes([], crs, diffs);
  f.d.root = root;
  f.d.fileAt = (p, sha) => files[`${sha}:${p.endsWith('binding.yml') ? 'binding' : 'skill'}`];
  return f;
}

test('classify: rename out of factory, quoted path, models-only binding, metadata.tier with a bench suite', async () => {
  const { d } = classFakes(true);
  const cls = async (n: string) => (await classify(d, (await d.forge.view(n)) as CR, await d.forge.diff(n)));
  // Mixed product and factory paths, or an unparsed header, fail closed to guardrail.
  assert.equal(await cls('ren'), 'guardrail');
  assert.equal(await cls('q'), 'guardrail');
  assert.equal(await cls('mix'), 'guardrail');
  assert.equal(await cls('tune'), 'tuning');
  assert.equal(await cls('tier'), 'tuning');
  for (const n of ['del', 'gate', 'nohead', 'guard', 'text', 'both', 'desc', 'badtier']) assert.equal(await cls(n), 'guardrail', n);
  assert.deepEqual(await linkage(d, 'guard'), { ok: true, factory: true, class: 'guardrail', errors: [] });
  // No bench suite for the skill: a tier change cannot be measured, so it is guardrail.
  assert.equal((await linkage(classFakes(false).d, 'tier')).class, 'guardrail');
});

test('approvers: latest decisive review per user, on the head only', () => {
  assert.deepEqual(approvers([
    { user: 'Ann', state: 'approved', sha: 'h' }, { user: 'ann', state: 'commented', sha: 'h' },
    { user: 'bob', state: 'approved', sha: 'h' }, { user: 'bob', state: 'changes_requested', sha: 'h' },
    { user: 'cy', state: 'approved', sha: 'old' },
  ], 'h'), ['ann']);
});

test('approval: classes and the human-approval status per forge.human_approval', async () => {
  const f = classFakes(true);
  const prod = (n: string, lane?: string) => {
    f.items.push(item(n, 'In review', lane ? { lane } : {}));
    return { closes: [n], headSha: `h${n}`, source: `${n}/x` };
  };
  const reviews: Record<string, { user: string; state: string; sha: string }[]> = {
    full: [{ user: 'factory-bot', state: 'approved', sha: 'hfull' }],
    fullok: [{ user: 'Dana', state: 'approved', sha: 'hfullok' }],
    guard: [{ user: 'dana', state: 'approved', sha: 'guard' }],
    guardok: [{ user: 'fo', state: 'approved', sha: 'guard' }],
  };
  const crs: Record<string, Partial<CR>> = { fast: prod('fast', 'Fast'), full: prod('full', 'Full'), fullok: prod('fullok', 'Full'), nolane: prod('nolane') };
  const view = f.d.forge.view;
  f.d.forge.view = async (n: string) => (crs[n] ? { ...(await view(n)), ...crs[n] } : n === 'guardok' ? view('guard') : view(n));
  const diff = f.d.forge.diff;
  f.d.forge.diff = async (n: string) => (crs[n] ? 'diff --git a/src/x.ts b/src/x.ts\n' : diff(n === 'guardok' ? 'guard' : n));
  f.d.forge.approvals = async (n: string) => reviews[n] ?? [];
  f.d.binding = { ...binding, owners: { factory: 'fo', bots: ['factory-bot'] }, forge: { review_identity: 'reviewer' } };
  const st = async (n: string) => { const r = await approval(f.d, n); return `${r.class}:${r.state}`; };
  assert.equal(await st('fast'), 'product-fast:success');
  assert.equal(await st('full'), 'product-full:pending'); // a bot's approval is not a human's
  assert.equal(await st('fullok'), 'product-full:success');
  assert.equal(await st('nolane'), 'product-full:pending'); // no lane fails closed to Full
  assert.equal(await st('tune'), 'tuning:success');
  assert.equal(await st('guard'), 'guardrail:pending'); // a human, but not owners.factory
  assert.equal(await st('guardok'), 'guardrail:success');
  // A path in paths.lane_areas forces Full, whatever the ticket's Lane says.
  f.d.binding = { ...f.d.binding, paths: { ...f.d.binding.paths, lane_areas: ['src/**'] } } as any;
  assert.equal(await st('fast'), 'product-full:pending');
  f.d.binding = { ...f.d.binding, paths: { ...f.d.binding.paths, lane_areas: [] } } as any;
  f.d.binding ={ ...f.d.binding, forge: { human_approval: 'always' }, learning: { auto_merge_classes: [] } } as any;
  assert.equal(await st('fast'), 'product-fast:pending');
  assert.equal(await st('tune'), 'tuning:pending');
  f.d.binding = { ...f.d.binding, forge: { human_approval: 'never' } } as any;
  assert.equal(await st('full'), 'product-full:success');
  assert.ok(f.statuses.every((s) => s.context === 'human-approval'));
  assert.equal(f.statuses.find((s) => s.sha === 'hfullok').description, 'product-full: approved by dana');
});

test('proofFiles: new and changed proof paths, deletions skipped', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts',
    'diff --git a/test/a.test.ts b/test/a.test.ts', 'new file mode 100644',
    'diff --git a/test/old.test.ts b/test/old.test.ts', 'deleted file mode 100644',
    'diff --git a/src/b.spec.ts b/src/b.spec.ts', '',
  ].join('\n');
  assert.deepEqual(proofFiles(diff, PROOF_FILE), ['test/a.test.ts', 'src/b.spec.ts']);
});

test('proofs-on-base: each new proof must fail on the merge base; factory CRs pass; unset command fails closed', async () => {
  const diff = 'diff --git a/src/a.ts b/src/a.ts\ndiff --git a/test/a.test.ts b/test/a.test.ts\ndiff --git a/test/b.test.ts b/test/b.test.ts\n';
  const f = fakes([], { p: { headSha: 'h' }, fac: { headSha: 'fh' }, none: { headSha: 'nh' } }, { p: diff, fac: 'diff --git a/.agents/x b/.agents/x\n', none: 'diff --git a/src/a.ts b/src/a.ts\n' });
  const tree: string[] = [];
  f.d.vcs.head = async () => ({ ref: 'x', sha: 'HEAD1' });
  f.d.vcs.base = async () => ({ sha: 'BASE1' });
  f.d.vcs.checkoutTests = async (rev: string, paths: string[]) => { tree.push(`${rev}:${paths.join(',')}`); };
  const ran: string[] = [];
  let passing = new Set<string>();
  f.d.run = (cmd) => { ran.push(cmd); return [...passing].some((p) => cmd.includes(p)); };
  f.d.binding = { ...binding, commands: { proofs_on_base: 'npx test {files}' } };
  const ok = await proofsOnBase(f.d, 'p');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.files, ['test/a.test.ts', 'test/b.test.ts']);
  assert.equal(ran.length, 2);
  assert.match(ran[0], /^npx test .test\/a\.test\.ts.$/);
  assert.deepEqual(tree, ['BASE1:test/a.test.ts,test/b.test.ts', 'HEAD1:']); // reset to HEAD afterwards
  passing = new Set(['b.test']);
  const bad = await proofsOnBase(f.d, 'p');
  assert.deepEqual([bad.ok, bad.passedOnBase], [false, ['test/b.test.ts']]);
  assert.equal((await proofsOnBase(f.d, 'fac')).ok, true);
  assert.match((await proofsOnBase(f.d, 'none')).errors[0], /no new or changed proof/);
  f.d.binding = binding;
  assert.match((await proofsOnBase(f.d, 'p')).errors[0], /proofs_on_base is not set/);
  assert.deepEqual(f.statuses.map((s) => [s.sha, s.context, s.state]), [
    ['h', 'proofs-on-base', 'success'], ['h', 'proofs-on-base', 'failure'], ['fh', 'proofs-on-base', 'success'], ['nh', 'proofs-on-base', 'failure'], ['h', 'proofs-on-base', 'failure'],
  ]);
  f.d.forge.status = async () => { throw new Error('env var named by options.review_token_env (unset) is not set'); };
  assert.equal((await proofsOnBase(f.d, 'fac')).posted, false);
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
  ], { m5: { state: 'merged', closes: ['5'], mergeSha: 'm5' } });
  h.d.isAncestor = () => true;
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

test('shipped: a last-env failure resets only tickets whose CRs are in the failed sha', async () => {
  const f = fakes([
    item('1', 'Done', { shipped: 'In release', release_version: '2026.11.1' }),
    item('2', 'Done', { shipped: 'In release', release_version: '2026.11.2' }),
  ], { a: { state: 'merged', closes: ['1'], mergeSha: 'A' }, b: { state: 'merged', closes: ['2'], mergeSha: 'B' } });
  f.d.isAncestor = (s) => s === 'A';
  const r = await shipped(f.d, 'production', 'failed', 'failure');
  assert.deepEqual(r.changed, ['1']);
  assert.equal(f.items[0].fields.shipped, 'On staging');
  assert.equal(f.items[1].fields.shipped, 'In release');
  assert.equal(f.items[1].fields.release_version, '2026.11.2');
});

test('signal-on-red: a run outside the recent runs is reported, not thrown', async () => {
  const f = fakes([], {}, {}, []);
  assert.equal((await signalOnRed(f.d, 'nope')).created, false);
});

test('proofRunner: only a real non-zero exit is a failing proof; anything else is not a test result', () => {
  assert.equal(proofRunner(() => 'ok')('c'), true);
  assert.equal(proofRunner(() => { throw Object.assign(new Error('x'), { status: 1 }); })('c'), false);
  assert.throws(() => proofRunner(() => { throw Object.assign(new Error('big'), { code: 'ENOBUFS' }); })('c'), /proof runner failed/);
  assert.throws(() => proofRunner(() => { throw Object.assign(new Error('kill'), { status: null }); })('c'), /proof runner failed/);
});

test('an unreadable forge diff fails closed to guardrail in approval, linkage and proofs-on-base', async () => {
  const f = fakes([item('12', 'Backlog')], { big: { closes: ['12'], source: '12/x', headSha: 'hbig' } });
  f.d.forge.diff = async () => { throw new Error('HTTP 406: diff too large'); };
  f.d.forge.approvals = async () => [{ user: 'dana', state: 'approved', sha: 'hbig' }];
  f.d.binding = { ...binding, owners: { factory: 'fo' }, forge: {} } as any;
  const a = await approval(f.d, 'big');
  assert.equal(a.class, 'guardrail');
  assert.notEqual(a.state, 'success'); // dana is not owners.factory
  const l = await linkage(f.d, 'big');
  assert.deepEqual([l.class, l.ok, l.factory], ['guardrail', true, false]);
  f.d.forge.view = async () => ({ n: 'bad', closes: [], source: 'x', headSha: '', baseSha: '' }) as any;
  assert.equal((await linkage(f.d, 'bad')).ok, false); // ticket rules still apply
  const p = await proofsOnBase(f.d, 'big');
  assert.deepEqual([p.class, p.ok, p.files], ['guardrail', true, []]);
});

test('shipped: a Done ticket with no merged CR is listed as unmatched, unless labelled release', async () => {
  const f = fakes([item('1', 'Done', { shipped: 'Not shipped' }), item('2', 'Done', { shipped: 'Not shipped' }, { labels: ['rel'] })]);
  f.d.isAncestor = () => true;
  f.d.binding = { ...binding, board: { ...binding.board, labels: { release: 'rel' } } } as any;
  const r: any = await shipped(f.d, 'staging', 'sha1', 'success');
  assert.deepEqual(r.unmatched, ['1']);
  assert.equal(f.items[0].fields.shipped, 'Not shipped');
});

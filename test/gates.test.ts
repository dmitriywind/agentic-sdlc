import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CR, Item, Run } from '../src/ports.ts';
import { shippedOptions } from '../src/binding.ts';
import { approvalWho, merged, branchNames, diffPaths, globToRegExp, linkage, classify, proofRunner, proofFiles, proofsOnBase, provenance, review, shipped, trailers, signalOnRed, skillRegression, type Deps } from '../src/gates.ts';
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
  const cr = (n: string): CR => ({ n, url: '', title: '', source: '', target: 'main', headSha: '', baseSha: '', draft: false, state: crs[n]?.mergeSha ? 'merged' : 'open', behind: false, closes: [], checks: [], body: '', author: 'bot', ...crs[n] });
  const forge: any = {
    view: async (n: string) => cr(n),
    viewBySha: async (sha: string) => cr(Object.keys(crs).find((k) => crs[k].mergeSha === sha)!),
    diff: async (n: string) => diffs[n] ?? '',
    runs: async () => runs,
    run: async (id: string) => { const r = runs.find((x) => x.id === id); if (!r) throw new Error(`no run ${id}`); return r; },
    list: async () => Object.keys(crs).map(cr).filter((c) => c.state === 'merged'),
    status: async (sha: string, s: any) => { statuses.push({ sha, ...s }); },
  };
  const vcs: any = { tag: async (n: string) => { tags.push(n); }, tags: async () => tags.map((name) => ({ name, sha: 's' })), head: async () => ({ ref: 'main', sha: 's' }) };
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

test('merged: the CR at a trunk sha moves its one ticket to Done, Not shipped when empty', async () => {
  const f = fakes([item('12', 'In review')], { c1: { n: 'c1', closes: ['12'], mergeSha: 'abc' } });
  assert.deepEqual((await merged(f.d, 'abc')).moved, ['12']);
  assert.equal(f.items[0].status, 'Done');
  assert.equal(f.items[0].fields.shipped, 'Not shipped');
  assert.match((await merged(f.d, 'nope')).reason!, /no CR/);
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
  await assert.rejects(signalOnRed(f.d, '1'), /no run 1/);
});

test('skill-regression: a valid pack passes; bad frontmatter, steps, links, forbidden words and verbs are listed with file:line', async () => {
  const { packRoot } = await import('./skillfix.ts');
  const root = packRoot();
  const sk = (...p: string[]) => join(root, '.agents', 'skills', ...p);
  assert.deepEqual(skillRegression(root), { errors: [], warnings: [] });
  writeFileSync(sk('sdlc-build', 'SKILL.md'), '---\nname: sdlc-build\ndescription: d\ntier: deep\n---\nx\n');
  assert.deepEqual(skillRegression(root), { errors: [], warnings: ['sdlc-build: top-level tier is deprecated; move it to metadata.tier'] });
  mkdirSync(sk('none'), { recursive: true }); writeFileSync(sk('none', 'SKILL.md'), '---\nname: none\ndescription: d\n---\nx\n');
  mkdirSync(sk('bad'), { recursive: true }); writeFileSync(sk('bad', 'SKILL.md'), '---\nname: bad\nmetadata:\n  tier: huge\n---\n[l](missing.md)\n');
  mkdirSync(sk('sdlc-ghost', 'steps'), { recursive: true });
  writeFileSync(sk('sdlc-ghost', 'SKILL.md'), '---\nname: sdlc-ghost\ndescription: d\nmetadata:\n  steps:\n    one: { tier: fast }\n    two: { tier: nope }\n---\n');
  writeFileSync(sk('sdlc-ghost', 'steps', 'extra.md'), 'x\n');
  const errs = skillRegression(root).errors.join('\n');
  assert.match(errs, /none: frontmatter metadata.tier or metadata.steps missing/);
  assert.match(errs, /bad: frontmatter description missing/);
  assert.match(errs, /tier huge invalid/);
  assert.match(errs, /bad: broken link missing.md/);
  assert.match(errs, /sdlc-ghost: step one has no file steps\/one.md/);
  assert.match(errs, /sdlc-ghost: tier nope invalid/);
  assert.match(errs, /sdlc-ghost: steps\/extra.md is not in metadata.steps/);
  rmSync(sk('none'), { recursive: true }); rmSync(sk('bad'), { recursive: true }); rmSync(sk('sdlc-ghost'), { recursive: true });
  writeFileSync(sk('sdlc-build', 'SKILL.md'), '---\nname: sdlc-build\ndescription: d\nmetadata:\n  tier: deep\n---\nok\nUse the review token on GitHub.\nRun `agentic-sdlc board nope` then `agentic-sdlc forge verdict`.\nRun `agentic-sdlc gate proofs-on-base` and `dispatch review/review`, then `agentic-sdlc dispatch plan`.\nThen `forge land <n> --force` and `board comment 1\n  --body-file f --kind done --ref k`.\n');
  const e2 = skillRegression(root).errors;
  assert.ok(e2.some((m) => /sdlc-build\/SKILL\.md:8: forbidden 'review token'/.test(m)), e2.join('\n'));
  assert.ok(e2.some((m) => /SKILL\.md:8: forbidden 'GitHub'/.test(m)));
  assert.ok(e2.some((m) => /SKILL\.md:9: 'board nope' is not a verb/.test(m)));
  assert.ok(e2.some((m) => /SKILL\.md:10: 'dispatch plan' is not a step id/.test(m)));
  assert.ok(e2.some((m) => /SKILL\.md:11: '--force' is not a flag of 'forge land'/.test(m)));
  assert.ok(!e2.some((m) => /SKILL\.md:12/.test(m)), 'a span that wraps over lines is read whole, and its flags exist');
  assert.ok(!e2.some((m) => /proofs-on-base/.test(m) && /forbidden/.test(m)), 'a gate verb is a CLI verb, not a hard-coded check name');
});

test('forbidden content: each pattern has a reason and the hits carry their line', async () => {
  const { FORBIDDEN, forbiddenHits } = await import('../src/skills.ts');
  assert.ok(FORBIDDEN.every((f) => f.reason.length > 10));
  for (const bad of ['two identities', 'the review_identity key', 'review runtime', 'Claude', 'a plugin', 'a subagent', 'MCP', 'GitHub', 'run gh pr', 'a pull request', 'npm test', 'npx x', 'node x', 'cloud session', 'HTTP 404', 'status 429', 'jira', '`Required`', 'DORA', 'GDPR'])
    assert.equal(forbiddenHits(`ok\n${bad}\n`)[0]?.line, 2, bad);
  for (const good of ['change request', 'agentic-sdlc gate proofs-on-base', 'a node of the tree is fine? no, use item', 'the board status', 'retry in 500 ms'].filter((g) => !/node/.test(g)))
    assert.deepEqual(forbiddenHits(good), [], good);
});

test('skill-regression: a good scorer passes; scorers name real step ids, skills or *', async () => {
  const { packRoot } = await import('./skillfix.ts');
  const root = packRoot();
  mkdirSync(join(root, '.agents', 'scorers'), { recursive: true });
  writeFileSync(join(root, '.agents', 'scorers', 'good.md'), '---\nname: good\napplies_to: [build, review/verify, plan]\nscale: pass-fail\n---\nq\n');
  writeFileSync(join(root, '.agents', 'scorers', 'star.md'), '---\nname: star\napplies_to: "*"\nscale: 0-4\n---\nq\n');
  assert.deepEqual(skillRegression(root).errors, []);
  writeFileSync(join(root, '.agents', 'scorers', 'bad.md'), '---\nname: bad\napplies_to: implement-spec\ntier: huge\nscale: 1-10\n---\nq\n');
  writeFileSync(join(root, '.agents', 'scorers', 'old.md'), '---\nname: old\napplies_to: [review-pr, plan/nope]\nscale: pass-fail\n---\nq\n');
  assert.deepEqual(skillRegression(root).errors.map((m) => m.replace(/ \(steps:.*/, '')), [
    'scorers/bad.md: applies_to must be "*" or a list of step ids or skills', 'scorers/bad.md: scale 1-10 invalid',
    "scorers/old.md: applies_to 'review-pr' names no step or skill", "scorers/old.md: applies_to 'plan/nope' names no step or skill",
  ]);
});

test('diffPaths: old and new path; quoted or ambiguous headers fail closed', () => {
  assert.deepEqual(diffPaths('diff --git a/src/app.ts b/.agents/app.ts\n'), ['src/app.ts', '.agents/app.ts']);
  assert.deepEqual(diffPaths('diff --git a/a b/c.md b/a b/c.md\n'), ['a b/c.md', 'a b/c.md']);
  assert.equal(diffPaths('diff --git "a/.agents/\\303\\251.md" "b/.agents/\\303\\251.md"\n'), null);
  assert.equal(diffPaths('diff --git a/x b/y b/z\n'), null);
});

const stepsMd = (t1: string, t2: string) => `---\nname: a\ndescription: d\nmetadata:\n  steps:\n    one: { tier: ${t1} }\n    two: { tier: ${t2} }\n---\nrules\n`;
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
    'sbase:skill': stepsMd('fast', 'balanced'),
    'stier:skill': stepsMd('fast', 'deep'),
    'sbad:skill': stepsMd('fast', 'huge'),
  };
  const crs: Record<string, Partial<CR>> = {}, diffs: Record<string, string> = {};
  for (const [n, d] of Object.entries({ tune: bdiff, guard: bdiff, nohead: bdiff, tier: mdiff, text: mdiff, both: mdiff, desc: mdiff, badtier: mdiff })) {
    crs[n] = { headSha: n, baseSha: 'base', source: `factory/${n}` };
    diffs[n] = d;
  }
  Object.assign(crs, { ren: {}, q: {}, del: {}, gate: {}, mix: {}, stier: { headSha: 'stier', baseSha: 'sbase' }, sbad: { headSha: 'sbad', baseSha: 'sbase' } });
  Object.assign(diffs, {
    stier: mdiff, sbad: mdiff,
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
  assert.equal(await cls('stier'), 'tuning'); // one step's tier in metadata.steps
  assert.equal(await cls('sbad'), 'guardrail');
  for (const n of ['del', 'gate', 'nohead', 'guard', 'text', 'both', 'desc', 'badtier']) assert.equal(await cls(n), 'guardrail', n);
  assert.deepEqual(await linkage(d, 'guard'), { ok: true, factory: true, class: 'guardrail', errors: [] });
  // No bench suite for the skill: a tier change cannot be measured, so it is guardrail.
  assert.equal((await linkage(classFakes(false).d, 'tier')).class, 'guardrail');
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

test('shipped: only Done tickets whose merge sha is an ancestor; a ticket of unknown ancestry waits alone', async () => {
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
  assert.deepEqual((await shipped(g.d, 'staging', 'dep', 'success') as any).unknown, ['2']); // only that ticket waits
  assert.equal(g.items[0].fields.shipped, 'On staging');

  const h = fakes([
    item('5', 'Done', { shipped: 'In release', release_version: '1' }),
    item('6', 'Done', { shipped: 'On staging', release_version: '1' }),
    item('7', 'Done', { shipped: 'On production', release_version: '0' }),
  ], { m5: { state: 'merged', closes: ['5'], mergeSha: 'm5' } });
  h.d.isAncestor = () => true;
  assert.deepEqual((await shipped(h.d, 'production', 'x', 'failure')).changed, ['5']);
});

test('merged: trunk only, exactly one ticket, keeps Shipped, moves a held ticket, leaves Cancelled', async () => {
  const f = fakes([item('12', 'In progress'), item('13', 'Done'), item('14', 'In review', {}, { labels: ['needs-human'] }), item('15', 'In review', { shipped: 'On staging' }), item('16', 'Cancelled')], {
    side: { closes: ['12'], target: 'release/1', mergeSha: 's1' },
    two: { closes: ['12', '13'], mergeSha: 's2' },
    held: { closes: ['14'], mergeSha: 's3' },
    re: { closes: ['15'], mergeSha: 's4' },
    can: { closes: ['16'], mergeSha: 's5' },
    late: { closes: ['12'], mergeSha: 's6' },
  });
  assert.match((await merged(f.d, 's1')).reason!, /not trunk/);
  assert.match((await merged(f.d, 's2')).reason!, /exactly one/);
  assert.equal(f.items[0].status, 'In progress');
  await merged(f.d, 's3');
  assert.equal(f.items[2].status, 'Done');
  assert.deepEqual(f.items[2].labels, ['needs-human']);
  await merged(f.d, 's4');
  assert.equal(f.items[3].fields.shipped, 'On staging');
  assert.match((await merged(f.d, 's5')).reason!, /Cancelled/);
  assert.equal(f.items[4].status, 'Cancelled');
  await merged(f.d, 's6');
  assert.equal(f.items[0].status, 'Done');
});

test('shipped: a deploy that beats the merge gate ships the In review ticket and moves it to Done', async () => {
  const f = fakes([item('7', 'In review')], { m7: { state: 'merged', closes: ['7'], mergeSha: 'm7' } });
  f.d.isAncestor = () => true;
  assert.deepEqual((await shipped(f.d, 'staging', 'x', 'success')).changed, ['7']);
  assert.equal(f.items[0].status, 'Done');
  assert.equal(f.items[0].fields.shipped, 'On staging');
});

test('shipped: a last-env failure before In release is set still resets the cut tickets', async () => {
  const f = fakes([item('8', 'Done', { shipped: 'On staging', release_version: '2026.3' }), item('9', 'Done', { shipped: 'On production', release_version: '2026.2' })],
    { m8: { state: 'merged', closes: ['8'], mergeSha: 'm8' }, m9: { state: 'merged', closes: ['9'], mergeSha: 'm9' } });
  f.d.isAncestor = () => true;
  assert.deepEqual((await shipped(f.d, 'production', 'x', 'failure')).changed, ['8']);
  assert.equal(f.items[0].fields.release_version, undefined);
  assert.equal(f.items[1].fields.release_version, '2026.2');
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

test('signal-on-red: a run id that does not exist fails the gate', async () => {
  const f = fakes([], {}, {}, []);
  await assert.rejects(signalOnRed(f.d, 'nope'), /no run nope/);
  assert.equal(f.created.length, 0);
});

test('proofRunner: only a real non-zero exit is a failing proof; anything else is not a test result', () => {
  assert.equal(proofRunner(() => 'ok')('c'), true);
  assert.equal(proofRunner(() => { throw Object.assign(new Error('x'), { status: 1 }); })('c'), false);
  assert.throws(() => proofRunner(() => { throw Object.assign(new Error('big'), { code: 'ENOBUFS' }); })('c'), /proof runner failed/);
  assert.throws(() => proofRunner(() => { throw Object.assign(new Error('kill'), { status: null }); })('c'), /proof runner failed/);
});

test('an unreadable forge diff fails closed to guardrail in linkage and proofs-on-base', async () => {
  const f = fakes([item('12', 'Backlog')], { big: { closes: ['12'], source: '12/x', headSha: 'hbig' } });
  f.d.forge.diff = async () => { throw new Error('HTTP 406: diff too large'); };
  f.d.binding = { ...binding, owners: { factory: 'fo' }, forge: {} } as any;
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

test('shipped: an existing tag is kept and the board still moves; a tag failure leaves the board untouched', async () => {
  const mkf = () => {
    const f = fakes([item('1', 'Done', { shipped: 'On staging', release_version: '2026.1' })], { m1: { state: 'merged', closes: ['1'], mergeSha: 'm1' } });
    f.d.isAncestor = () => true;
    return f;
  };
  const f = mkf();
  f.tags.push('v2026.1');
  const r: any = await shipped(f.d, 'production', 'sha1', 'success');
  assert.deepEqual(f.tags, ['v2026.1']);
  assert.deepEqual(r.tags, ['v2026.1']);
  assert.equal(f.items[0].fields.shipped, 'On production');
  const g = mkf();
  g.d.vcs.tag = async () => { throw new Error('push rejected'); };
  await assert.rejects(shipped(g.d, 'production', 'sha1', 'success'), /push rejected/);
  assert.equal(g.items[0].fields.shipped, 'On staging');
});

test('proofs-on-base: a product CR that changes only paths.no_proof passes with no proof file', async () => {
  const f = fakes([], { docs: { headSha: 'dh' }, code: { headSha: 'ch' } }, { docs: 'diff --git a/docs/a.md b/docs/a.md\n', code: 'diff --git a/docs/a.md b/docs/a.md\ndiff --git a/src/a.ts b/src/a.ts\n' });
  f.d.binding = { ...binding, paths: { ...binding.paths, no_proof: ['docs/**', '**/*.md'] }, commands: { proofs_on_base: 'npx test {files}' } };
  assert.equal((await proofsOnBase(f.d, 'docs')).ok, true);
  assert.match((await proofsOnBase(f.d, 'code')).errors[0], /no new or changed proof/);
});

test('shipped: --version records the artifact version and tags it; continuous delivery has no In release', async () => {
  const f = fakes([item('20', 'Done', { shipped: 'Not shipped' })], { m20: { state: 'merged', closes: ['20'], mergeSha: 'm20' } });
  f.d.isAncestor = () => true;
  f.d.binding = { ...binding, product: { environments: ['production'], delivery: 'continuous' } };
  await shipped(f.d, 'production', 'x', 'success', '4.1.0');
  assert.equal(f.items[0].fields.shipped, 'On production');
  assert.equal(f.items[0].fields.release_version, '4.1.0');
  assert.deepEqual(f.tags, ['v4.1.0']);
  assert.deepEqual(shippedOptions(['staging', 'production'], 'continuous'), ['Not shipped', 'On staging', 'On production']);
  assert.deepEqual(shippedOptions(['staging', 'production']), ['Not shipped', 'On staging', 'In release', 'On production']);
});

test('shipped: rolled-back steps back only the tickets not in the revision now running', async () => {
  const f = fakes([item('30', 'Done', { shipped: 'On production', release_version: '5' }), item('31', 'Done', { shipped: 'On production', release_version: '4' })],
    { m30: { state: 'merged', closes: ['30'], mergeSha: 'new' }, m31: { state: 'merged', closes: ['31'], mergeSha: 'old' } });
  f.d.isAncestor = (x) => x === 'old';
  assert.deepEqual((await shipped(f.d, 'production', 'old', 'rolled-back')).changed, ['30']);
  assert.equal(f.items[0].fields.shipped, 'On staging');
  assert.equal(f.items[0].fields.release_version, '5');
  assert.equal(f.items[1].fields.shipped, 'On production');
  assert.equal(f.created.length, 0);
});

test('shipped: a forge that searches by ticket is asked per candidate ticket, not for every merged CR', async () => {
  const f = fakes([item('40', 'Done', { shipped: 'Not shipped' }), item('41', 'Done', { shipped: 'On production' })]);
  const asked: string[] = [];
  f.d.forge.list = async () => { throw new Error('list must not be called'); };
  f.d.forge.closing = async (id: string) => { asked.push(id); return [{ mergeSha: 'm40', closes: [id] } as any]; };
  f.d.isAncestor = () => true;
  assert.deepEqual((await shipped(f.d, 'staging', 'x', 'success')).changed, ['40']);
  assert.deepEqual(asked, ['40']);
});

test('shipped: a merge the search index does not show yet is found in the merged list', async () => {
  const f = fakes([item('42', 'Done', { shipped: 'Not shipped' })], { m42: { state: 'merged', closes: ['42'], mergeSha: 'm42' } });
  f.d.forge.closing = async () => []; // the index trails the merge
  f.d.isAncestor = () => true;
  assert.deepEqual((await shipped(f.d, 'staging', 'x', 'success')).changed, ['42']);
});

test('shipped: a slower earlier-environment deploy never lowers a newer Shipped; a re-run failure opens one Signal', async () => {
  const f = fakes([item('50', 'Done', { shipped: 'Not shipped' })], { m50: { state: 'merged', closes: ['50'], mergeSha: 'm50' } });
  f.d.isAncestor = () => true;
  const get = f.d.board.get;
  f.d.board.get = async (id: string) => { const it = await get(id); it.fields.shipped = 'On production'; return it; }; // production landed meanwhile
  assert.deepEqual((await shipped(f.d, 'staging', 'x', 'success')).changed, []);
  f.d.board.get = get;
  f.d.binding = { ...binding, board: { ...binding.board, env_labels: ['env:staging'] } };
  assert.equal((await shipped(f.d, 'staging', 'bad', 'failure')).signal, true);
  assert.equal((await shipped(f.d, 'staging', 'bad', 'failure')).signal, false);
  assert.deepEqual(f.created[0].labels, ['signal:deploy', 'env:staging']);
});

test('linkage: posts status ticket-linkage on the head; a CR by a dependency bot needs no ticket, its branch name alone does not', async () => {
  const f = fakes([item('12', 'Ready')], { ok: { closes: ['12'], source: '12/x', headSha: 'h1' }, dep: { closes: [], source: 'dependabot/npm/yaml-2', headSha: 'h2', author: 'dependabot[bot]' }, bad: { closes: [], source: 'feature/x', headSha: 'h3' }, fake: { closes: [], source: 'renovate/x', headSha: 'h4', author: 'mallory' } },
    { ok: 'diff --git a/src/a.ts b/src/a.ts\n', dep: 'diff --git a/package.json b/package.json\n', bad: 'diff --git a/src/a.ts b/src/a.ts\n' });
  assert.equal((await linkage(f.d, 'ok')).ok, true);
  assert.equal((await linkage(f.d, 'dep')).ok, true);
  assert.equal((await linkage(f.d, 'bad')).ok, false);
  assert.equal((await linkage(f.d, 'fake')).ok, false); // a dependency branch name from another author needs a ticket
  f.statuses.pop();
  assert.deepEqual(f.statuses.map((s) => [s.sha, s.context, s.state]), [['h1', 'ticket-linkage', 'success'], ['h2', 'ticket-linkage', 'success'], ['h3', 'ticket-linkage', 'failure']]);
});

test('shipped: a rollback in an earlier environment leaves tickets that are further on', async () => {
  const f = fakes([item('60', 'Done', { shipped: 'On staging' }), item('61', 'Done', { shipped: 'On production', release_version: '5' })],
    { m60: { state: 'merged', closes: ['60'], mergeSha: 'new' }, m61: { state: 'merged', closes: ['61'], mergeSha: 'new2' } });
  f.d.isAncestor = () => false;
  assert.deepEqual((await shipped(f.d, 'staging', 'old', 'rolled-back')).changed, ['60']);
  assert.equal(f.items[1].fields.shipped, 'On production');
});

test('merged: a forge error fails the gate; only "no change request" is a direct push', async () => {
  const f = fakes([item('70', 'In review')]);
  f.d.forge.viewBySha = async () => { throw new Error('HTTP 502'); };
  await assert.rejects(merged(f.d, 's'), /502/);
  f.d.forge.viewBySha = async (sha: string) => { throw new Error(`no change request for ${sha}`); };
  assert.match((await merged(f.d, 's')).reason!, /no CR/);
});

test('gate review: with one identity the newest trusted review-pr report for the head becomes the review status, posted as ci', async () => {
  const f = fakes([], { 5: { headSha: 'h2' } });
  const posted: any[] = [];
  f.d.forge.status = async (sha: string, s: any, o: any) => { posted.push({ sha, state: s.state, context: s.context, as: o?.as }); };
  const c = (author: string, body: string) => ({ id: body, author, createdAt: '', body, url: `u-${body.length}` });
  let list = [c('factory-bot', '<!-- review-pr h1 -->\nVerdict: PASS'), c('mallory', '<!-- review-pr h2 -->\nVerdict: PASS')];
  f.d.forge.comments = async () => list;
  f.d.binding = { ...binding, owners: { factory: 'fo', bots: ['factory-bot'] }, forge: { review_identity: '', review_check_name: 'review' } } as any;
  assert.equal((await review(f.d, '5') as any).state, 'pending'); // the PASS is for an old head, or by an untrusted author
  list = [...list, c('factory-bot', '<!-- review-pr h2 -->\nVerdict: REMEDIATION REQUIRED'), c('factory-bot', '<!-- review-pr h2 -->\nfixed\nVerdict: PASS')];
  assert.equal((await review(f.d, '5') as any).state, 'success'); // the newest trusted report wins
  list = [...list, c('fo', '<!-- review-pr h2 -->\nVerdict: REMEDIATION REQUIRED')];
  assert.equal((await review(f.d, '5') as any).state, 'failure');
  assert.deepEqual(posted.map((p) => [p.sha, p.context, p.as]), [['h2', 'review', 'ci'], ['h2', 'review', 'ci'], ['h2', 'review', 'ci']]);
  f.d.binding = { ...f.d.binding, forge: { review_identity: 'reviewer' } } as any;
  assert.ok((await review(f.d, '5')).skipped);
  assert.equal(posted.length, 3);
});

test('gate evidence: runs commands.evidence_check with the sha; empty product.evidence passes; evidence without the command is an error', async () => {
  const { cli } = await import('../src/gates.ts');
  const ran: string[] = [];
  const run = (b: any) => {
    const exec: any = (c: string, a: string[], o: any) => { ran.push([c, ...a, o?.env?.AGENTIC_SDLC_CMD ?? ''].join(' ')); return ''; };
    const out: string[] = [];
    const w = process.stdout.write, e = process.stderr.write;
    process.stdout.write = ((s: string) => { out.push(String(s)); return true; }) as any;
    process.stderr.write = (() => true) as any;
    return Promise.resolve(cli(['evidence', '--sha', 'abc123'], { binding: b, root: '.', exec, env: {} } as any))
      .then((code) => ({ code, out: out.join('') }))
      .finally(() => { process.stdout.write = w; process.stderr.write = e; });
  };
  assert.equal((await run({ ...binding, product: { ...binding.product, evidence: [] } })).code, 0);
  assert.deepEqual(ran, []);
  const b = { ...binding, product: { ...binding.product, evidence: ['report'] } };
  assert.equal((await run({ ...b, commands: {} })).code, 1);
  assert.equal((await run({ ...b, commands: { evidence_check: 'check {sha}' } })).code, 0);
  assert.ok((ran as string[]).some((c) => /check ["']?abc123["']?/.test(c)), ran.join('|'));
});

test('gate cli: --k=v is the same as --k v', async () => {
  const { cli } = await import('../src/gates.ts');
  const out: string[] = [], err: string[] = [];
  const w = process.stdout.write, e = process.stderr.write;
  process.stdout.write = ((s: string) => { out.push(String(s)); return true; }) as any;
  process.stderr.write = ((s: string) => { err.push(String(s)); return true; }) as any;
  try {
    const ctx: any = { binding: { board: { adapter: 'local', options: {} }, forge: { adapter: 'github', options: { repo: 'o/r' } }, vcs: { adapter: 'git', trunk: 'main' } }, root: '.', exec: () => '', env: {} };
    const first = await cli(['provenance', '--cr=1'], ctx);
    assert.equal(first, 0, err.join(''));
    assert.equal(await cli(['provenance', '--cr', '1'], ctx), 0);
    assert.equal(await cli(['provenance', '--cr'], ctx), 2);
  } finally { process.stdout.write = w; process.stderr.write = e; }
  assert.equal(JSON.parse(out[0]).cr, '1');
  assert.deepEqual(out[0], out[1]);
  assert.match(err.join(''), /--cr needs a value/);
});

test('shipped: a failure with one environment returns the tickets of the failed revision to Not shipped', async () => {
  const f = fakes([item('1', 'Done', { shipped: 'In release', release_version: '1' })], { m1: { state: 'merged', closes: ['1'], mergeSha: 'm1' } });
  f.d.binding = { ...binding, product: { environments: ['production'] } } as any;
  f.d.isAncestor = () => true;
  await shipped(f.d, 'production', 'sha1', 'failure');
  assert.equal(f.items[0].fields.shipped, 'Not shipped');
});

test('merged: a CR that is not merged moves nothing', async () => {
  const f = fakes([item('12', 'In review')], { open1: { n: 'open1', closes: ['12'], state: 'open' } });
  f.d.forge.viewBySha = async () => ({ ...(await f.d.forge.view('open1')), state: 'open' });
  assert.match((await merged(f.d, 'x')).reason!, /not merged/);
  assert.equal(f.items[0].status, 'In review');
});

test('gate review: a report holding both verdicts fails; one repeated verdict is fine; the marker must open the comment', async () => {
  const f = fakes([], { 5: { headSha: 'h2' } });
  const c = (body: string) => ({ id: body, author: 'factory-bot', createdAt: '', body, url: 'u' });
  let list = [c('<!-- review-pr h2 -->\n> Verdict: PASS\nVerdict: REMEDIATION REQUIRED')];
  f.d.forge.comments = async () => list;
  f.d.binding = { ...binding, owners: { factory: 'fo', bots: ['factory-bot'] }, forge: { review_identity: '' } } as any;
  assert.equal((await review(f.d, '5') as any).state, 'failure'); // a quoted "> Verdict" line is no verdict line
  list = [c('<!-- review-pr h2 -->\nVerdict: PASS\nquoted:\nVerdict: REMEDIATION REQUIRED')];
  assert.equal((await review(f.d, '5') as any).state, 'failure');
  list = [c('<!-- review-pr h2 -->\nVerdict: PASS\nVerdict: PASS')];
  assert.equal((await review(f.d, '5') as any).state, 'success');
  list = [c('see below\n<!-- review-pr h2 -->\nVerdict: PASS')];
  assert.equal((await review(f.d, '5') as any).state, 'pending');
});

test('signal-on-red: a run that did not fail opens no Signal; an unset release_prefix matches no ref or branch', async () => {
  const run = (id: string, state: Run['state'], ref = 'main'): Run => ({ id, name: 'ci', ref, sha: 's', state, url: '', at: '' });
  const f = fakes([], {}, {}, [run('1', 'success'), run('2', 'pending'), run('3', 'failure', 'undefined/x')]);
  assert.match((await signalOnRed(f.d, '1') as any).reason, /did not fail/);
  assert.equal((await signalOnRed(f.d, '2')).created, false);
  const cd = { ...binding, vcs: { ...binding.vcs, release_prefix: undefined } } as any;
  f.d.binding = cd;
  assert.equal((await signalOnRed(f.d, '3')).created, false);
  assert.equal(f.created.length, 0);
  assert.deepEqual(branchNames(cd, ['undefinedwip', 'main']), ['undefinedwip']);
});

const commit = (sha: string, author: string, message: string, parents = 1) => ({ sha, message, author, committer: author, authorName: author, committerName: author, parents });
const TRAILERS = '\n\nAgent-Run: 12-implement-spec-r1\nAgent-Model: claude-sonnet-5-5\nCo-Authored-By: Claude <noreply@anthropic.com>';

function provFakes(mode: string | undefined, commits: any[] | Error) {
  const f = fakes([], { c: { headSha: 'h1' } });
  f.d.binding = { ...binding, owners: { bots: ['bot[bot]', { board: 'b', forge: 'Agent' }] }, forge: { ...(mode ? { provenance: mode } : {}) } } as any;
  (f.d.forge as any).commits = async () => { if (commits instanceof Error) throw commits; return commits; };
  return f;
}

test('provenance: agent commits with well-formed trailers pass; human and merge commits are listed and ignored', async () => {
  const f = provFakes('require', [
    commit('a'.repeat(40), 'bot[bot]', `fix: x${TRAILERS}`),
    commit('b'.repeat(40), 'alice', 'fix: y'),
    commit('c'.repeat(40), 'AGENT', `fix: z${TRAILERS}`),
    { ...commit('d'.repeat(40), 'bot[bot]', "Merge branch 'main' into 12/x", 2), committer: 'web-flow', committerName: 'GitHub' },
    { ...commit('e'.repeat(40), 'alice', "Merge branch 'main' into 12/x", 2), committer: '', committerEmail: 'noreply@github.com' },
  ]);
  const r = await provenance(f.d, 'c') as any;
  assert.equal(r.ok, true);
  assert.equal(r.agentCommits, 2);
  assert.equal(r.humanCommits, 2);
  assert.deepEqual(r.commits.map((c: any) => c.by), ['agent', 'human', 'agent', 'merge', 'human']);
  assert.equal(r.commits[0].run, '12-implement-spec-r1');
  assert.equal(r.commits[0].model, 'claude-sonnet-5-5');
  assert.deepEqual(r.missing, []);
  assert.deepEqual(f.statuses.map((s) => [s.sha, s.context, s.state]), [['h1', 'agent-provenance', 'success']]);
});

test('provenance: a merge commit by anyone but the forge web identity is checked like an agent commit', async () => {
  const f = provFakes('require', [
    commit('a'.repeat(40), 'bot[bot]', "Merge branch 'main' into 12/x", 2),
    { ...commit('b'.repeat(40), 'bot[bot]', 'Merge x', 2), committer: 'alice', committerEmail: 'alice@example.com' },
    commit('c'.repeat(40), 'alice', 'Merge y', 2),
  ]);
  const r = await provenance(f.d, 'c') as any;
  assert.equal(r.ok, false);
  assert.deepEqual(r.commits.map((c: any) => c.by), ['agent', 'agent', 'human']);
  assert.match(r.errors.join('\n'), /aaaaaaaaaaaa: Agent-Run trailer is missing/);
});

test('provenance: a missing, malformed or body-only trailer fails under require and passes under warn', async () => {
  const bad = [
    commit('a'.repeat(40), 'bot[bot]', 'fix: no trailers'),
    commit('b'.repeat(40), 'bot[bot]', 'fix: body\n\nAgent-Run: r1\nAgent-Model: m1\n\nmore text after'),
    commit('c'.repeat(40), 'bot[bot]', 'fix: bad\n\nAgent-Run: has spaces!\nAgent-Model: m1'),
    commit('d'.repeat(40), 'bot[bot]', 'fix: two\n\nAgent-Run: r1\nAgent-Run: r2\nAgent-Model: m1'),
  ];
  const req = await provFakes('require', bad);
  const r = await provenance(req.d, 'c') as any;
  assert.equal(r.ok, false);
  assert.equal(r.state, 'failure');
  assert.equal(r.missing.length, 6);
  assert.match(r.errors.join('\n'), /aaaaaaaaaaaa: Agent-Run trailer is missing/);
  assert.match(r.errors.join('\n'), /cccccccccccc: Agent-Run trailer is malformed/);
  assert.equal(req.statuses[0].state, 'failure');
  const warn = provFakes('warn', bad);
  const w = await provenance(warn.d, 'c') as any;
  assert.equal(w.state, 'success');
  assert.equal(w.ok, false);
  assert.equal(w.missing.length, 6);
  assert.equal(w.errors, undefined);
  assert.equal(warn.statuses[0].state, 'success');
});

test('provenance: off, or no key, does nothing and posts nothing', async () => {
  for (const mode of ['off', undefined]) {
    const f = provFakes(mode, new Error('must not be read'));
    const r = await provenance(f.d, 'c') as any;
    assert.match(r.skipped, /off/);
    assert.deepEqual(f.statuses, []);
  }
});

test('provenance: commits the forge cannot list fail closed under require', async () => {
  const req = provFakes('require', new Error('forge: CR c has 250 or more commits'));
  const r = await provenance(req.d, 'c') as any;
  assert.equal(r.ok, false);
  assert.equal(r.state, 'failure');
  assert.match(r.errors[0], /commits unreadable: forge: CR c has 250/);
  assert.equal(req.statuses[0].state, 'failure');
  const warn = await provenance(provFakes('warn', new Error('boom')).d, 'c') as any;
  assert.equal(warn.state, 'success');
  assert.match(warn.missing[0], /unreadable/);
});

test('provenance: trailers are the key: value lines of the last paragraph only', () => {
  assert.deepEqual(trailers('subject only'), {});
  assert.deepEqual(trailers('s\n\nAgent-Run: r1 \nnot a trailer\nCo-Authored-By: A <a@b>'), { 'agent-run': ['r1'], 'co-authored-by': ['A <a@b>'] });
  assert.deepEqual(trailers('s\n\nAgent-Run: in body\n\nfooter text'), {});
});

test('approvalWho: the class and the owner entries that may approve it, shared with forge land and forge queue', async () => {
  const f = fakes([item('1', 'In review')], { g: { closes: ['1'] }, p: { closes: ['1'] } }, { g: 'diff --git a/.agents/binding.yml b/.agents/binding.yml\n', p: 'diff --git a/src/x.ts b/src/x.ts\n' });
  f.d.binding = { ...binding, owners: { product: 'po', factory: ['fo', 'fo2'], bots: ['factory-bot'] }, forge: { review_identity: 'reviewer' } };
  const cr = (n: string) => ({ ...({ n, closes: ['1'], baseSha: 'b', headSha: 'h' } as any) });
  assert.deepEqual(await approvalWho(f.d, cr('g')), { class: 'guardrail', who: ['fo', 'fo2'] });
  assert.deepEqual(await approvalWho(f.d, cr('p')), { class: 'product-full', who: ['po'] });
});

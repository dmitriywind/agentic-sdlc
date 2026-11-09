import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdapterContext } from '../src/ports.ts';
import { exec } from '../src/exec.ts';
import { createVcs } from '../src/vcs/index.ts';

const binding = (adapter: string, options: object = {}) =>
  ({ vcs: { adapter, options, trunk: 'main', release_prefix: 'release/', tag_prefix: 'v' } }) as any;
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

test('git: start, changed, base, cut, tag, tags on a real repo', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'vcs-'));
  const origin = join(tmp, 'origin.git');
  const root = join(tmp, 'work');
  execFileSync('git', ['init', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['clone', origin, root], { stdio: 'pipe' });
  git(root, 'config', 'user.email', 'a@b.c');
  git(root, 'config', 'user.name', 'a');
  git(root, 'checkout', '-b', 'main');
  writeFileSync(join(root, 'a.txt'), '1');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'init');
  git(root, 'push', '-u', 'origin', 'main');

  const vcs = createVcs({ root, binding: binding('git'), options: {}, env: process.env, exec, http: async () => ({}) });
  const { workdir, ref } = await vcs.start('t-1-x');
  assert.equal(ref, 't-1-x');
  assert.ok(workdir.replace(/\\/g, '/').endsWith('.agents/work/t-1-x'));
  assert.equal(git(workdir, 'rev-parse', '--abbrev-ref', 'HEAD'), 't-1-x');

  // operate inside the worktree
  git(workdir, 'config', 'user.email', 'a@b.c');
  git(workdir, 'config', 'user.name', 'a');
  writeFileSync(join(workdir, 'b.txt'), '2');
  git(workdir, 'add', '.');
  git(workdir, 'commit', '-m', 'b');
  const w = createVcs({ root: workdir, binding: binding('git'), options: {}, env: process.env, exec, http: async () => ({}) });
  assert.deepEqual(await w.changed(), ['b.txt']);
  assert.equal((await w.base()).sha, git(root, 'rev-parse', 'main'));
  const head = await w.head();
  assert.equal(head.ref, 't-1-x');
  await w.push();
  assert.match(git(origin, 'branch', '--list', 't-1-x'), /t-1-x/);
  assert.deepEqual(await w.cut(head.sha, '2026.1'), { ref: 'refs/heads/release/2026.1' });
  assert.equal(git(origin, 'rev-parse', 'release/2026.1'), head.sha);
  await w.tag('v1', head.sha);
  await w.tag('v2', head.sha);
  const tags = await w.tags('v');
  assert.deepEqual(tags.map((t) => t.name).sort(), ['v1', 'v2']);
  assert.equal(tags[0].sha, head.sha);

  // checkout-tests: product code from base, keep the given test path from HEAD
  mkdirSync(join(workdir, 't'));
  writeFileSync(join(workdir, 't', 'x.test'), 'T');
  writeFileSync(join(workdir, 'a.txt'), 'changed');
  git(workdir, 'add', '.');
  git(workdir, 'commit', '-m', 'c');
  await w.checkoutTests(git(root, 'rev-parse', 'main'), ['t']);
  assert.equal(git(workdir, 'show', ':a.txt'), '1');
  assert.equal(git(workdir, 'show', ':t/x.test'), 'T');

  await vcs.drop('t-1-x');
  assert.equal(git(root, 'branch', '--list', 't-1-x'), '');
  assert.ok(!existsSync(workdir));
});

const fakeCtx = (adapter: string, options: object, out: (cmd: string, a: string[]) => string) => {
  const calls: string[][] = [];
  const ctx = {
    root: join(tmpdir(), 'r'), binding: binding(adapter, options), options, env: {} as any,
    exec: (c: string, a: string[]) => { calls.push([c, ...a]); return out(c, a); }, http: async () => ({}),
  } as AdapterContext;
  return { ctx, calls };
};

test('hg: topic start shares and names the topic; cut bookmarks', async () => {
  const { ctx, calls } = fakeCtx('hg', { mode: 'topic' }, () => 'abc');
  const v = createVcs(ctx);
  const s = await v.start('t-1');
  assert.equal(s.ref, 't-1');
  assert.ok(calls.some((c) => c.slice(0, 2).join(' ') === 'hg share'));
  assert.ok(calls.some((c) => c.join(' ') === 'hg topic t-1'));
  assert.deepEqual(await v.cut('rev1', '1.0'), { ref: 'release/1.0' });
  assert.ok(calls.some((c) => c.join(' ') === 'hg bookmark -f -r rev1 release/1.0'));
  await v.push();
  assert.ok(calls.some((c) => c.join(' ') === 'hg push -r .'));
});

test('hg: bookmark mode pushes the bookmark', async () => {
  const { ctx, calls } = fakeCtx('hg', { mode: 'bookmark' }, () => 'bm');
  await createVcs(ctx).push();
  assert.ok(calls.some((c) => c.join(' ') === 'hg push -B bm'));
});

test('p4: stream start creates a task stream; push shelves; cut populates release stream', async () => {
  const { ctx, calls } = fakeCtx('p4', { mainline: '//d/main', depot: 'd', mode: 'stream' }, (_c, a) =>
    a.includes('pending') ? 'Change 42 on 2026/01/01 by u@c *pending* x' : a.includes('changes') ? 'Change 40 on x' : 'spec');
  const v = createVcs(ctx);
  const s = await v.start('t-1');
  assert.equal(s.ref, '//d/t-1');
  assert.ok(calls.some((c) => c.join(' ').includes('stream -o -t task -P //d/main //d/t-1')));
  await v.push();
  assert.ok(calls.some((c) => c.join(' ').includes('shelve -f -c 42')));
  assert.deepEqual(await v.cut('40', '1.0'), { ref: '//d/release/1.0' });
  assert.ok(calls.some((c) => c.join(' ').includes('populate')));
  assert.equal((await v.base()).sha, '40');
});

test('p4: changelist mode start makes a pending changelist', async () => {
  const { ctx } = fakeCtx('p4', { mode: 'changelist', depot: 'd' }, (_c, a) => (a.includes('-i') ? 'Change 77 created.' : 'spec'));
  assert.equal((await createVcs(ctx).start('t-2')).ref, '77');
});

test('git: snapshot is a detached tree outside the root; changed sees edits, adds and deletes; drop removes it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'snap-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'a@b.c');
  git(root, 'config', 'user.name', 'a');
  writeFileSync(join(root, 'a.txt'), '1');
  writeFileSync(join(root, 'gone.txt'), 'g');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'one');
  const base = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'later.txt'), 'oracle');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'two');

  const vcs = createVcs({ root, binding: binding('git'), options: {}, env: process.env, exec, http: async () => ({}) });
  const s = await vcs.snapshot!(base);
  assert.ok(!s.workdir.startsWith(root));
  assert.ok(!existsSync(join(s.workdir, 'later.txt')), 'a later commit leaked into the snapshot');
  writeFileSync(join(s.workdir, 'a.txt'), '2');
  writeFileSync(join(s.workdir, 'new.txt'), 'n');
  rmSync(join(s.workdir, 'gone.txt'));
  assert.deepEqual((await s.changed()).sort(), ['a.txt', 'gone.txt', 'new.txt']);
  await s.drop();
  assert.ok(!existsSync(s.workdir));
  assert.doesNotMatch(git(root, 'worktree', 'list'), /agentic-bench-/);
});

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
  writeFileSync(join(workdir, 'new.txt'), 'product code the proof could lean on');
  git(workdir, 'add', '.');
  git(workdir, 'commit', '-m', 'c');
  await w.checkoutTests(git(root, 'rev-parse', 'main'), ['t']);
  assert.equal(git(workdir, 'show', ':a.txt'), '1');
  assert.equal(git(workdir, 'show', ':t/x.test'), 'T');
  assert.ok(!existsSync(join(workdir, 'new.txt')), 'a file HEAD added is not on the base');
  await w.checkoutTests(git(workdir, 'rev-parse', 'HEAD'), []);
  assert.ok(existsSync(join(workdir, 'new.txt')), 'checkout-tests HEAD restores the tree');

  await vcs.drop('t-1-x');
  assert.equal(git(root, 'branch', '--list', 't-1-x'), '');
  assert.ok(!existsSync(workdir));
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

test('git: start resumes an existing change line', async () => {
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
  const first = await vcs.start('t-2-x');
  assert.equal((await vcs.start('t-2-x')).workdir, first.workdir);
  git(first.workdir, 'config', 'user.email', 'a@b.c');
  git(first.workdir, 'config', 'user.name', 'a');
  writeFileSync(join(first.workdir, 'b.txt'), '2');
  git(first.workdir, 'add', '.');
  git(first.workdir, 'commit', '-m', 'b');
  const sha = git(first.workdir, 'rev-parse', 'HEAD');
  git(first.workdir, 'push', '-u', 'origin', 't-2-x');
  git(root, 'worktree', 'remove', '--force', first.workdir);
  git(root, 'branch', '-D', 't-2-x');
  const again = await vcs.start('t-2-x');
  assert.equal(git(again.workdir, 'rev-parse', 'HEAD'), sha);
});

test('git start: no remote branch starts from trunk; a reused branch or workdir fast-forwards to the remote', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'vcs-ff-'));
  const origin = join(tmp, 'origin.git');
  const clone = (dir: string) => {
    execFileSync('git', ['clone', origin, dir], { stdio: 'pipe' });
    git(dir, 'config', 'user.email', 'a@b.c');
    git(dir, 'config', 'user.name', 'a');
  };
  execFileSync('git', ['init', '--bare', '-b', 'main', origin]);
  const root = join(tmp, 'work'), other = join(tmp, 'other');
  clone(root);
  git(root, 'checkout', '-b', 'main');
  writeFileSync(join(root, 'a.txt'), '1');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'init');
  git(root, 'push', '-u', 'origin', 'main');
  const vcs = createVcs({ root, binding: binding('git'), options: {}, env: process.env, exec, http: async () => ({}) });
  const first = await vcs.start('t-2-x');
  assert.equal(git(first.workdir, 'rev-parse', 'HEAD'), git(root, 'rev-parse', 'main'));
  git(first.workdir, 'push', '-u', 'origin', 't-2-x');

  clone(other);
  git(other, 'checkout', 't-2-x');
  writeFileSync(join(other, 'r.txt'), 'rework');
  git(other, 'add', '.');
  git(other, 'commit', '-m', 'remote work');
  git(other, 'push', 'origin', 't-2-x');
  const remoteSha = git(other, 'rev-parse', 'HEAD');

  await vcs.start('t-2-x'); // workdir exists
  assert.equal(git(first.workdir, 'rev-parse', 'HEAD'), remoteSha);

  git(other, 'commit', '--allow-empty', '-m', 'more');
  git(other, 'push', 'origin', 't-2-x');
  git(root, 'worktree', 'remove', '--force', first.workdir); // branch stays, workdir gone
  const again = await vcs.start('t-2-x');
  assert.equal(git(again.workdir, 'rev-parse', 'HEAD'), git(other, 'rev-parse', 'HEAD'));

  // a fetch error that is not a missing ref is not 'start from trunk'
  git(root, 'remote', 'set-url', 'origin', join(tmp, 'gone.git'));
  await assert.rejects(vcs.start('t-3-y'));
});

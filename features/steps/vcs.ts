// The git vcs port on real repositories in the scenario's temp folder (the vcs port called in-process).
// State on w.state: vcs (the port on the main checkout), lines (name -> {workdir, vcs}), starts (name -> workdirs returned),
// pushed (name -> sha), other (a second clone), otherSha, repo (root of a plain repository), base (its first commit),
// snap, listed, error.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Given, When, Then } from '../support/steps.ts';
import type { World } from '../support/world.ts';
import { exec } from '../../src/exec.ts';
import { createVcs } from '../../src/vcs/index.ts';
import type { Vcs } from '../../src/ports.ts';

const binding = { vcs: { adapter: 'git', options: {}, trunk: 'main', release_prefix: 'release/', tag_prefix: 'v' } } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const portAt = (root: string): Vcs => createVcs({ root, binding, options: {}, env: process.env, exec, http: async () => ({}) });
const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (dir: string, name: string, text: string) => { mkdirSync(dirname(join(dir, name)), { recursive: true }); writeFileSync(join(dir, name), text); };
const commitAll = (dir: string, msg: string) => { git(dir, 'add', '.'); git(dir, 'commit', '-m', msg); };

const origin = (w: World) => w.path('origin.git');
const main = (w: World): string => w.path('work');
const port = (w: World): Vcs => w.state.vcs;
const line = (w: World, name: string): { workdir: string; vcs: Vcs } => {
  const l = w.state.lines?.[name];
  assert.ok(l, `the change line ${name} was not started`);
  return l;
};
const names = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

// ---- Given ----
Given('a trunk with one commit, pushed to an origin', (w) => {
  execFileSync('git', ['init', '--bare', '-b', 'main', origin(w)], { stdio: 'pipe' });
  execFileSync('git', ['clone', origin(w), main(w)], { stdio: 'pipe' });
  git(main(w), 'checkout', '-b', 'main');
  put(main(w), 'a.txt', '1');
  commitAll(main(w), 'init');
  git(main(w), 'push', '-u', 'origin', 'main');
  w.state.vcs = portAt(main(w));
  w.state.lines = {};
  w.state.starts = {};
  w.state.pushed = {};
});


/** A plain repository (no origin): a.txt and gone.txt, then a later commit adding one file. */
Given('a repository with a commit, and a later commit that adds {string}', (w, later: string) => {
  const r = (w.state.repo = w.path('repo'));
  mkdirSync(r);
  git(r, 'init', '-b', 'main');
  put(r, 'a.txt', '1');
  put(r, 'gone.txt', 'g');
  commitAll(r, 'one');
  w.state.base = git(r, 'rev-parse', 'HEAD');
  put(r, later, 'oracle');
  commitAll(r, 'two');
  w.state.vcs = portAt(r);
});


Given('a snapshot is taken of the first commit', async (w) => { w.state.snap = await w.state.vcs.snapshot!(w.state.base); });

Given('the change line {string} is started', async (w, name: string) => { await startLine(w, name); });
When('the change line {string} is started again', async (w, name: string) => {
  const was = line(w, name).workdir; // a line deleted locally has no entry to keep
  (w.state.starts[name] ??= [was]);
  await startLine(w, name);
});

async function startLine(w: World, name: string) {
  const { workdir } = await port(w).start(name);
  (w.state.starts[name] ??= []).push(workdir);
  w.state.lines[name] = { workdir, vcs: portAt(workdir) };
}

Given('the line {string} commits the file {string} containing {string}', (w, name: string, file: string, text: string) => {
  const { workdir } = line(w, name);
  put(workdir, file, text);
  commitAll(workdir, `add ${file}`);
});

Given('the line {string} is pushed', async (w, name: string) => {
  const l = line(w, name);
  await l.vcs.push();
  w.state.pushed[name] = git(l.workdir, 'rev-parse', 'HEAD');
});

Given('the line {string} is deleted locally, worktree and branch', (w, name: string) => {
  git(main(w), 'worktree', 'remove', '--force', line(w, name).workdir);
  git(main(w), 'branch', '-D', name);
});
Given('the worktree of the line {string} is removed but its branch stays', (w, name: string) => git(main(w), 'worktree', 'remove', '--force', line(w, name).workdir));

Given('another clone pushes a commit to {string}', (w, name: string) => {
  const other = w.path('other');
  if (!existsSync(other)) { execFileSync('git', ['clone', origin(w), other], { stdio: 'pipe' }); git(other, 'checkout', name); }
  put(other, 'r.txt', 'rework');
  commitAll(other, 'remote work');
  git(other, 'push', 'origin', name);
  w.state.otherSha = git(other, 'rev-parse', 'HEAD');
});


// ---- When: the port ----
When('the line {string} cuts the release {string} at its head', async (w, name: string, release: string) => {
  const l = line(w, name);
  w.state.cut = await l.vcs.cut((await l.vcs.head()).sha, release);
});
When('the line {string} tags its head {string} and {string}', async (w, name: string, a: string, b: string) => {
  const l = line(w, name);
  const sha = (await l.vcs.head()).sha;
  await l.vcs.tag(a, sha);
  await l.vcs.tag(b, sha);
});
When('the line {string} checks out the trunk tip keeping the paths {string}', async (w, name: string, paths: string) => {
  await line(w, name).vcs.checkoutTests(git(main(w), 'rev-parse', 'main'), names(paths));
});
When('the line {string} checks out its head keeping no path', async (w, name: string) => {
  const l = line(w, name);
  await l.vcs.checkoutTests(git(l.workdir, 'rev-parse', 'HEAD'), []);
});
When('the change line {string} is dropped', async (w, name: string) => { await port(w).drop(name); });

const attempt = async (w: World, f: () => Promise<unknown>) => {
  w.state.error = undefined;
  try { await f(); } catch (e) { w.state.error = e; w.state.failed = true; return; }
  w.state.failed = false;
};
When('I try the vcs verb {string} with {string} and {string}', (w, verb: string, a: string, b: string) => attempt(w, async () => {
  const v = port(w);
  if (verb === 'changed') await v.changed(a);
  else if (verb === 'tag') await v.tag(a, b);
  else if (verb === 'cut') await v.cut(a, b);
  else if (verb === 'snapshot') await v.snapshot!(a);
  else if (verb === 'checkout-tests') await v.checkoutTests(a, b ? [b] : []);
  else throw new Error(`unknown verb ${verb}`);
}));

When('the snapshot gets the file {string} containing {string}', (w, file: string, text: string) => put(w.state.snap.workdir, file, text));
When('the snapshot loses the file {string}', (w, file: string) => rmSync(join(w.state.snap.workdir, file)));
When('the snapshot is dropped', async (w) => { await w.state.snap.drop(); });

// ---- Then ----
Then('the files the line {string} changed are {string}', async (w, name: string, files: string) => assert.deepEqual(await line(w, name).vcs.changed(), names(files)));
Then('the base of the line {string} is the trunk tip', async (w, name: string) => assert.equal((await line(w, name).vcs.base()).sha, git(main(w), 'rev-parse', 'main')));
Then('the cut ref is {string}', (w, ref: string) => assert.deepEqual(w.state.cut, { ref }));
Then('the origin has {string} at the head of the line {string}', (w, ref: string, name: string) =>
  assert.equal(git(origin(w), 'rev-parse', ref), git(line(w, name).workdir, 'rev-parse', 'HEAD')));
Then('the tags with the prefix {string} are {string}, both at the head of the line {string}', async (w, prefix: string, list: string, name: string) => {
  const l = line(w, name);
  const tags = await l.vcs.tags(prefix);
  assert.deepEqual(tags.map((t) => t.name).sort(), names(list));
  for (const t of tags) assert.equal(t.sha, (await l.vcs.head()).sha);
});
Then('the line {string} has the file {string}', (w, name: string, file: string) => assert.ok(existsSync(join(line(w, name).workdir, file)), `${file} is missing`));
Then('the line {string} has no worktree', (w, name: string) => assert.ok(!existsSync(line(w, name).workdir)));
Then('the project has no branch {string}', (w, name: string) => assert.equal(git(main(w), 'branch', '--list', name), ''));

Then('the line {string} is at the commit that was pushed', (w, name: string) => assert.equal(git(line(w, name).workdir, 'rev-parse', 'HEAD'), w.state.pushed[name]));
Then('the line {string} is at the commit the other clone pushed', (w, name: string) => assert.equal(git(line(w, name).workdir, 'rev-parse', 'HEAD'), w.state.otherSha));

Then('the call fails', (w) => assert.ok(w.state.failed, 'the call succeeded'));
Then('the call fails saying {string}', (w, text: string) => {
  assert.ok(w.state.failed, 'the call succeeded');
  assert.match(String(w.state.error?.message ?? w.state.error), new RegExp(text));
});


Then('the files the snapshot changed are {string}', async (w, files: string) => assert.deepEqual((await w.state.snap.changed()).sort(), names(files)));
Then('the snapshot folder is gone', (w) => assert.ok(!existsSync(w.state.snap.workdir)));
Then('git lists no bench worktree', (w) => assert.doesNotMatch(git(w.state.repo, 'worktree', 'list'), /agentic-bench-/));

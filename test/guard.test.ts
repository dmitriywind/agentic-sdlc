import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(new URL('../hooks/guard.mjs', import.meta.url));
let tmp = '';

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'guard-'));
  const git = (...a: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: tmp });
  git('init', '-b', 'main');
  git('commit', '--allow-empty', '-m', 'init');
  git('checkout', '-b', 'feat');
  mkdirSync(join(tmp, '.agents'));
  writeFileSync(join(tmp, '.agents', 'binding.yml'), 'vcs:\n  trunk: main\n');
});

const run = (command: string, env: Record<string, string> = {}, cwd = tmp) =>
  spawnSync('node', [guard], {
    input: JSON.stringify({ cwd, tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, AGENTIC_SDLC_ROLE: '', ...env },
    encoding: 'utf8',
  }).status;

test('blocks pushes that reach the trunk', () => {
  for (const c of [
    'git push --all origin',
    'git push --mirror origin',
    "git push origin 'refs/heads/*:refs/heads/*'",
    "git push 'refs/heads/*:refs/heads/*'",
    'git push origin main',
    'git push origin HEAD:main',
  ]) assert.equal(run(c), 2, c);
});

test('allows pushing a named change line', () => {
  for (const c of ['git push origin feat', 'git push -u origin feat']) assert.equal(run(c), 0, c);
});

test('forge approve is for the review role only', () => {
  assert.equal(run('agentic-sdlc forge approve 3'), 2);
  assert.equal(run('agentic-sdlc forge approve 3', { AGENTIC_SDLC_ROLE: 'review' }), 0);
});

const repo = (trunk: string, binding?: string) => {
  const d = mkdtempSync(join(tmpdir(), 'guard-'));
  const git = (...a: string[]) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: d });
  git('init', '-b', trunk);
  git('commit', '--allow-empty', '-m', 'init');
  git('checkout', '-b', 'feat');
  mkdirSync(join(d, 'sub'));
  if (binding) {
    mkdirSync(join(d, '.agents'));
    writeFileSync(join(d, '.agents', 'binding.yml'), binding);
  }
  return d;
};

test('finds the binding from a subdirectory', () => {
  const d = repo('master', 'vcs:\n  trunk: master\n');
  assert.equal(run('git push origin master', {}, join(d, 'sub')), 2);
});

test('without a binding, main and master are both trunks', () => {
  const d = repo('master');
  assert.equal(run('git push origin master', {}, d), 2);
  assert.equal(run('git push origin main', {}, d), 2);
  assert.equal(run('git push origin feature-x', {}, d), 0);
});

test('sees through command substitution', () => {
  assert.equal(run('echo $(git push origin main)'), 2);
  assert.equal(run('echo `git push origin main`'), 2);
  assert.equal(run('echo $(agentic-sdlc forge approve 1)'), 2);
});

test('a push from a checkout of the trunk with at most one argument is blocked', () => {
  const d = repo('main', 'vcs:\n  trunk: main\n');
  spawnSync('git', ['checkout', 'main'], { cwd: d });
  for (const c of ['git push', 'git push origin', 'git push -u origin']) assert.equal(run(c, {}, d), 2, c);
  assert.equal(run('git push origin feat', {}, d), 0);
});

test('input that is not JSON is let through', () => {
  const r = spawnSync('node', [guard], { input: 'not json {', encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('pre-push: branch-names --stdin-prepush checks pushed branches and skips deletes', () => {
  const bin = fileURLToPath(new URL('../src/bin.ts', import.meta.url));
  const d = mkdtempSync(join(tmpdir(), 'prepush-'));
  mkdirSync(join(d, '.agents'));
  writeFileSync(join(d, '.agents', 'binding.yml'), 'vcs:\n  trunk: main\n  release_prefix: release/\n  change_pattern: "<ticket>-<name>"\n  factory_change_pattern: "factory/<name>"\n');
  const gate = (lines: string) => spawnSync('node', [bin, '--root', d, 'gate', 'branch-names', '--stdin-prepush'], { input: lines, encoding: 'utf8' });
  const sha = 'a'.repeat(40), zero = '0'.repeat(40);
  assert.equal(gate(`refs/heads/12-fix-x ${sha} refs/heads/12-fix-x ${zero}\n`).status, 0);
  const bad = gate(`refs/heads/wip ${sha} refs/heads/wip ${zero}\n`);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /branch name not allowed: wip/);
  assert.equal(gate(`(delete) ${zero} refs/heads/wip ${sha}\n`).status, 0, 'a delete is not checked');
});

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

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    'git push --repo=origin main',
    'git push origin feat:"main"',
    'git push origin feat:main>/dev/null',
    'git push origin feat:main#',
    'git push origin {feat,main}',
  ]) assert.equal(run(c), 2, c);
});

test('allows pushing a named change line', () => {
  for (const c of ['git push origin feat', 'git push -u origin feat']) assert.equal(run(c), 0, c);
});

test('forge approve is for the review role only', () => {
  assert.equal(run('agentic-sdlc forge approve 3'), 2);
  assert.equal(run('agentic-sdlc forge approve 3', { AGENTIC_SDLC_ROLE: 'review' }), 0);
  for (const c of ['node dist/bin.js forge approve 3', 'agentic-sdlc.cmd forge approve 3']) assert.equal(run(c), 2, c);
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

test('a cd to another checkout is followed, or the push is refused', () => {
  const main = repo('main', 'vcs:\n  trunk: main\n');
  spawnSync('git', ['checkout', 'main'], { cwd: main });
  const feat = repo('main', 'vcs:\n  trunk: main\n');
  const at = join(feat, 'sub');
  assert.equal(run(`cd ${main} && git push`, {}, at), 2, 'cd to a trunk checkout');
  assert.equal(run(`cd ${main}; git push origin`, {}, at), 2);
  assert.equal(run(`git -C ${main} push`, {}, at), 2, 'git -C to a trunk checkout');
  assert.equal(run(`git --git-dir=${join(main, '.git')} push`, {}, at), 2, '--git-dir to a trunk checkout');
  assert.equal(run(`pushd ${main} && git push`, {}, at), 2);
  assert.equal(run(`cd ${feat} && git push origin feat`, {}, main), 0, 'cd to a feature checkout is fine');
  assert.equal(run('cd $WT && git push origin feat', {}, at), 2, 'computed cd');
  assert.equal(run('cd "$(pwd)/x" && git push origin feat', {}, at), 2);
  assert.equal(run('cd nowhere-here && git push origin feat', {}, at), 2, 'cd to a missing path');
  assert.equal(run('git -C $WT push origin feat', {}, at), 2, 'computed git -C');
  assert.match(String(spawnSync('node', [guard], { input: JSON.stringify({ cwd: at, tool_name: 'Bash', tool_input: { command: 'cd $WT && git push' } }), encoding: 'utf8' }).stderr), /without cd/);
});

test('indirection in a push is blocked', () => {
  for (const c of [
    'B=main; git push origin $B',
    'g=git; $g push origin main',
    'git -c alias.p=push p origin main',
    'git push origin feat#1:main',
    'git push origin $(echo main)',
    'git push origin `echo main`',
    'git push "$REMOTE" feat',
    'X=push; git $X origin main',
    "eval 'g=git; $g push origin main'",
    'bash -c "$CMD push origin main"',
  ]) assert.equal(run(c), 2, c);
});

test('forge approve through another launcher or a variable is blocked', () => {
  for (const c of [
    'npx agentic-sdlc@latest forge approve 1',
    'a=approve; agentic-sdlc forge $a 1',
    'node node_modules/agentic-sdlc/dist/bin.js forge approve 1',
    'node node_modules/agentic-sdlc/dist/cli.js forge approve 1',
    'agentic-sdlc forge `echo approve` 1',
  ]) assert.equal(run(c), 2, c);
  assert.equal(run('npx agentic-sdlc@latest forge approve 1', { AGENTIC_SDLC_ROLE: 'review' }), 0);
});

test('forge status is for the review role, or a runner that sets AGENTIC_SDLC_ALLOW_STATUS', () => {
  const st = 'agentic-sdlc forge status abc --context review --state success';
  assert.equal(run(st), 2);
  assert.equal(run('npx --no agentic-sdlc forge status abc --context review --state success'), 2);
  assert.equal(run('echo $(agentic-sdlc forge status abc)'), 2);
  assert.equal(run(st, { AGENTIC_SDLC_ROLE: 'review' }), 0);
  assert.equal(run(st, { AGENTIC_SDLC_ALLOW_STATUS: '1' }), 0);
  assert.equal(run('agentic-sdlc forge approve 3', { AGENTIC_SDLC_ALLOW_STATUS: '1' }), 2, 'the status opt-in does not open approve');
  const mcp = (tool: string, env: Record<string, string> = {}) => spawnSync('node', [guard], {
    input: JSON.stringify({ cwd: tmp, tool_name: tool, tool_input: {} }),
    env: { ...process.env, AGENTIC_SDLC_ROLE: '', ...env }, encoding: 'utf8' }).status;
  assert.equal(mcp('mcp__plugin_agentic-sdlc_agentic-sdlc__forge_status'), 2);
  assert.equal(mcp('mcp__plugin_agentic-sdlc_agentic-sdlc__forge_status', { AGENTIC_SDLC_ROLE: 'review' }), 0);
  assert.equal(mcp('mcp__agentic-sdlc__forge_status', { AGENTIC_SDLC_ALLOW_STATUS: '1' }), 0);
  assert.equal(mcp('mcp__agentic-sdlc__forge_approve', { AGENTIC_SDLC_ALLOW_STATUS: '1' }), 2);
  const matcher = JSON.parse(readFileSync(fileURLToPath(new URL('../hooks/hooks.json', import.meta.url)), 'utf8')).hooks.PreToolUse[1].matcher;
  for (const t of ['mcp__plugin_agentic-sdlc_agentic-sdlc__forge_status', 'mcp__agentic-sdlc__forge_approve']) assert.match(t, new RegExp(`^${matcher}$`));
});

test('the sdlc-reviewer agent runs only the agentic-sdlc CLI in Bash', () => {
  const as = (agent_type: string | undefined, command: string, env: Record<string, string> = {}) => spawnSync('node', [guard], {
    input: JSON.stringify({ cwd: tmp, agent_type, tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, AGENTIC_SDLC_ROLE: '', ...env }, encoding: 'utf8' }).status;
  const rev = 'agentic-sdlc:sdlc-reviewer';
  for (const c of ['agentic-sdlc forge view 3', 'npx --no agentic-sdlc forge diff 3', 'agentic-sdlc forge view 3 | agentic-sdlc ledger summary',
    'node node_modules/agentic-sdlc/dist/bin.js board get 4', '/p/bin/agentic-sdlc forge comments 3 --last 1']) assert.equal(as(rev, c), 0, c);
  for (const c of ['npm test', 'cat .env', 'node script.js', 'agentic-sdlc forge view 3 && npm test', 'agentic-sdlc forge view 3 > out.txt',
    'echo $(npm test)', 'x=agentic-sdlc; $x forge view 3', 'cd sub']) assert.equal(as(rev, c), 2, c);
  assert.equal(as(rev, 'agentic-sdlc forge approve 3'), 2, 'the approve rule still applies');
  assert.equal(as(rev, 'agentic-sdlc forge approve 3', { AGENTIC_SDLC_ROLE: 'review' }), 0);
  for (const a of [undefined, 'agentic-sdlc:sdlc-fast', 'sdlc-fast']) assert.equal(as(a, 'npm test'), 0, String(a));
});

test('ordinary commands still pass', () => {
  for (const c of [
    'git push',
    'git push origin feat/x',
    'cd sub && npm test',
    'git -c user.name=x commit -m "fix #1"',
    'git commit -m "wip # push" && git push origin feat',
    'agentic-sdlc forge view 1',
    'echo $HOME && ls "$PWD"',
    'for f in a b; do echo $f; done',
    'v=$(git rev-parse HEAD); echo $v',
  ]) assert.equal(run(c), 0, c);
});

test('both guard hook entries block when the hook fails', () => {
  const h = JSON.parse(readFileSync(fileURLToPath(new URL('../hooks/hooks.json', import.meta.url)), 'utf8')).hooks.PreToolUse;
  assert.equal(h.length, 2);
  for (const e of h) assert.equal(e.hooks[0].onFailure, 'block');
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

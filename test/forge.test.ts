import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCloses, type AdapterContext } from '../src/ports.ts';
import { proofFiles } from '../src/gates.ts';
import { createForge, cli } from '../src/forge/index.ts';

type Call = { m: string; url: string; body?: any };
const mk = (adapter: string, options: Record<string, unknown>, routes: (m: string, url: string, body?: any) => any, execOut: (a: string[]) => string = () => '') => {
  const calls: Call[] = [];
  const execs: string[][] = [];
  const envs: (string | undefined)[] = [];
  const ctx = {
    root: '.',
    env: { TOK: 't', U: 'u', REV: 'r' },
    options,
    binding: { forge: { adapter, options, required_checks: ['ci'] }, vcs: { trunk: 'main' } },
    exec: (_c: string, a: string[], o: any = {}) => { execs.push(a); envs.push(o.env?.GH_TOKEN); return execOut(a); },
    http: async (m: string, url: string, o: any = {}) => { calls.push({ m, url, body: o.body }); return routes(m, url, o.body); },
  } as unknown as AdapterContext;
  return { ctx, calls, execs, envs };
};

test('parseCloses never reads an id from the next line and dedupes', () => {
  assert.deepEqual(parseCloses('Closes \nRefactor\n'), []);
  assert.deepEqual(parseCloses('Closes #12\nCloses #12'), ['12']);
});

test('github: uses gh with body on stdin, draft = ready --undo, status via api', async () => {
  const pull = { number: 5, html_url: 'u', title: 'T', head: { ref: 'b', sha: 'h' }, base: { ref: 'main', sha: 'm' }, draft: false, state: 'open', body: 'Closes 1', mergeable_state: 'behind' };
  const { ctx, execs, envs } = mk('github', { repo: 'o/r', token_env: 'TOK', review_token_env: 'REV' }, () => ({}), (a) =>
    a[0] === 'api' ? JSON.stringify(pull) : a[0] === 'pr' && a[1] === 'view' ? JSON.stringify({ statusCheckRollup: [{ __typename: 'CheckRun', name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) : '');
  const f = createForge(ctx);
  const cr = await f.draft('5');
  assert.ok(execs.some((a) => a.join(' ').startsWith('pr ready 5 --undo')));
  assert.equal(cr.behind, true);
  assert.deepEqual(cr.checks, [{ name: 'ci', state: 'success' }]);
  await f.status('abc', { context: 'c', state: 'pending', description: 'd' });
  const i = execs.findIndex((a) => a[0] === 'api' && a.includes('repos/o/r/statuses/abc'));
  assert.ok(i >= 0);
  assert.equal(envs[i], 'r', 'status runs with the review token');
  assert.equal(envs[0], 't', 'other verbs run with token_env');
  await f.approve('5');
  assert.deepEqual(execs.at(-1)!.slice(0, 4), ['pr', 'review', '5', '--approve']);
  assert.equal(envs.at(-1), 'r');
});

const stdout = async (fn: () => Promise<unknown>) => {
  const out: string[] = [];
  const w = process.stdout.write;
  process.stdout.write = ((s: string) => (out.push(s), true)) as any;
  try { await fn(); } finally { process.stdout.write = w; }
  return JSON.parse(out.join(''));
};

test('comments: github follows pages from gh api', async () => {
  const row = (id: number, author: string) => JSON.stringify({ id: String(id), author, createdAt: String(id), body: `b${id}`, url: 'u' });
  const { ctx, execs } = mk('github', { repo: 'o/r' }, () => '', () => `${row(1, 'a')}\n${row(2, 'b')}\n${row(3, 'c')}\n`);
  assert.deepEqual((await createForge(ctx).comments('4')).map((c) => c.author), ['a', 'b', 'c']);
  assert.ok(execs[0].includes('--paginate') && execs[0].includes('repos/o/r/issues/4/comments'));
});

const ghPull = { number: 7, html_url: 'u', title: 'T', head: { ref: 'b', sha: 'h' }, base: { ref: 'main', sha: 'm' }, draft: false, state: 'open', body: 'Closes 1', user: { login: 'ann' } };
const ghExec = (a: string[]) => a[0] === 'api' && a.at(-1)!.endsWith('/pulls/7') ? JSON.stringify(ghPull) : a[0] === 'pr' && a[1] === 'view' ? '{"statusCheckRollup":[]}' : a[0] === 'api' ? (() => { throw new Error('HTTP 404'); })() : '';

test('cli: JSON on stdout, usage error is 2, failure is 1', async () => {
  const { ctx } = mk('github', { repo: 'o/r' }, () => ({}), ghExec);
  const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
  const out: string[] = [];
  const w = process.stdout.write;
  const e = process.stderr.write;
  process.stdout.write = ((s: string) => (out.push(s), true)) as any;
  process.stderr.write = (() => true) as any;
  try {
    assert.equal(await cli(['view', '7'], base), 0);
    assert.equal(await cli(['view'], base), 2);
    assert.equal(await cli(['bogus'], base), 2);
    assert.equal(await cli(['comment', '7'], base), 2);
    assert.equal(await cli(['view', '8'], base), 1);
  } finally {
    process.stdout.write = w;
    process.stderr.write = e;
  }
  assert.equal(JSON.parse(out[0]).n, '7');
  assert.equal(JSON.parse(out[0]).author, 'ann');
});

test('github: missing token env fails without leaking', async () => {
  const { ctx } = mk('github', { repo: 'o/r', token_env: 'NOPE' }, () => ({}), ghExec);
  await assert.rejects(createForge(ctx).view('7'), /NOPE/);
});

test('cli: comments --trusted --last 1 returns the newest trusted comment past a newer untrusted one', async () => {
  const row = (id: number, author: string) => JSON.stringify({ id: String(id), author, createdAt: String(id), body: `b${id}`, url: 'u' });
  const { ctx } = mk('github', { repo: 'o/r' }, () => ({}), () => [row(1, 'owner'), row(2, 'Bot'), row(3, 'mallory')].join(String.fromCharCode(10)));
  (ctx.binding as any).owners = { product: 'owner', factory: 'fac', bots: ['bot'] };
  const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
  const out = await stdout(() => cli(['comments', '7', '--trusted', '--last', '1'], base));
  assert.deepEqual(out.map((c: any) => c.id), ['2']);
});

test('cli: status refuses the contexts only a gate posts', async () => {
  const { ctx, execs } = mk('github', { repo: 'o/r', review_token_env: 'REV' }, () => ({}));
  const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
  const e = process.stderr.write; process.stderr.write = (() => true) as any;
  try {
    for (const c of ['human-approval', 'ticket-linkage', 'proofs-on-base'])
      assert.equal(await cli(['status', 'abc', '--context', c, '--state', 'success', '--description', 'd'], base), 2, c);
  } finally { process.stderr.write = e; }
  assert.deepEqual(execs, []);
});

test('list: merged CRs come from gh pr list --state merged', async () => {
  const gh = mk('github', {}, () => ({}), () => '[]');
  await createForge(gh.ctx).list({ state: 'merged' });
  assert.ok(gh.execs.some((a) => a.join(' ').includes('--state merged')));
});

test('status and approve need review_token_env and never use the implementer token', async () => {
  const st = { context: 'review', state: 'success' as const, description: 'd' };
  const gh = mk('github', { repo: 'o/r' }, () => ({}));
  await assert.rejects(createForge(gh.ctx).status('abc', st), /review_token_env/);
  await assert.rejects(createForge(gh.ctx).approve('5'), /review_token_env/);
});

test('approvals: { user, state, sha } from the PR reviews', async () => {
  const gh = mk('github', { repo: 'o/r' }, () => ({}), (a) =>
    a.includes('--paginate') ? '{"user":"ann","state":"approved","sha":"h1"}\n{"user":"bob","state":"changes_requested","sha":"h0"}\n' : '');
  assert.deepEqual(await createForge(gh.ctx).approvals('5'), [{ user: 'ann', state: 'approved', sha: 'h1' }, { user: 'bob', state: 'changes_requested', sha: 'h0' }]);
  assert.ok(gh.execs[0].includes('repos/o/r/pulls/5/reviews'));
});

test('cut: dispatches the release workflow and returns the run newer than any before it', async () => {
  let listed = 0;
  const gh = mk('github', { repo: 'o/r' }, () => ({}), (a) =>
    a[0] === 'run' ? JSON.stringify(listed++ === 0 ? [{ databaseId: 10, url: 'old' }] : [{ databaseId: 11, url: 'new' }, { databaseId: 10, url: 'old' }]) : '');
  assert.deepEqual(await createForge(gh.ctx).cut('abc', '1.2.0'), { requested: true, run: '11', url: 'new' });
  assert.ok(gh.execs.some((a) => a.join(' ').startsWith('workflow run agentic-sdlc-release.yml -f revision=abc -f version=1.2.0')));
});

test('view: pushedAt is the first check suite on the head; absent when none can be read', async () => {
  const at = (a: string[]) => a.join(' ').includes('/check-suites') ? '2026-11-14T10:00:00Z\n' : ghExec(a);
  const { ctx, execs } = mk('github', { repo: 'o/r' }, () => ({}), at);
  assert.equal((await createForge(ctx).view('7')).pushedAt, '2026-11-14T10:00:00Z');
  assert.ok(execs.some((a) => a.includes('repos/o/r/commits/h/check-suites')));
  assert.equal((await createForge(mk('github', { repo: 'o/r' }, () => ({}), ghExec).ctx).view('7')).pushedAt, undefined);
});

test('cli: forge comments --trusted uses the forge name of an owner with { board, forge }', async () => {
  const row = (id: number, author: string) => JSON.stringify({ id: String(id), author, createdAt: String(id), body: `b${id}`, url: 'u' });
  const { ctx } = mk('github', { repo: 'o/r' }, () => ({}), () => [row(1, 'ann-gh'), row(2, 'acc-123')].join(String.fromCharCode(10)));
  (ctx.binding as any).owners = { product: { board: 'acc-123', forge: 'ann-gh' }, factory: 'fac', bots: [{ board: 'acc-bot', forge: 'bot[bot]' }] };
  const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
  const out = await stdout(() => cli(['comments', '7', '--trusted'], base));
  assert.deepEqual(out.map((c: any) => c.id), ['1']);
});

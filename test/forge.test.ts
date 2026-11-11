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

const glMr = (o = {}) => ({ iid: 7, web_url: 'u', title: 'Draft: T', source_branch: 'b', target_branch: 'main', sha: 's1', diff_refs: { base_sha: 'b0' }, state: 'opened', description: 'x\nCloses 12', ...o });

test('gitlab: view maps fields, ready strips Draft, automerge uses merge_when_pipeline_succeeds', async () => {
  const { ctx, calls } = mk('gitlab', { project: 'g/p', base_url: 'https://gl', token_env: 'TOK' }, (_m, url) =>
    url.includes('/statuses') ? [{ name: 'ci', status: 'success' }] : url.includes('/merge_requests/7') ? glMr() : []);
  const f = createForge(ctx);
  const cr = await f.view('7');
  assert.equal(cr.draft, true);
  assert.equal(cr.title, 'T');
  assert.deepEqual(cr.closes, ['12']);
  assert.deepEqual(cr.checks, [{ name: 'ci', state: 'success' }]);
  assert.ok(calls.some((c) => c.url.includes('/statuses?per_page=100')));
  await f.ready('7');
  assert.equal(calls.find((c) => c.m === 'PUT')!.body.title, 'T');
  await f.automerge('7');
  assert.equal(calls.filter((c) => c.m === 'PUT').at(-1)!.body.merge_when_pipeline_succeeds, true);
  await f.viewBySha('abc').catch(() => {});
  assert.ok(calls.some((c) => c.url.endsWith('/repository/commits/abc/merge_requests')));
});

test('gitlab: a deleted file diffs as deleted, so it is not a proof file', async () => {
  const { ctx } = mk('gitlab', { project: 'p', base_url: 'https://gl', token_env: 'TOK' }, (_m, url) =>
    url.includes('/changes') ? { changes: [{ old_path: 't/a.test.ts', new_path: 't/a.test.ts', deleted_file: true, diff: '@@ -1 +0,0 @@\n-x\n' }] } : {});
  assert.deepEqual(proofFiles(await createForge(ctx).diff('7'), /\.test\.ts$/), []);
});

test('parseCloses never reads an id from the next line and dedupes', () => {
  assert.deepEqual(parseCloses('Closes \nRefactor\n'), []);
  assert.deepEqual(parseCloses('Closes #12\nCloses #12'), ['12']);
});

test('gitlab: missing token env fails without leaking', async () => {
  const { ctx } = mk('gitlab', { project: 'p', base_url: 'https://gl', token_env: 'NOPE' }, () => ({}));
  await assert.rejects(createForge(ctx).view('1'), /NOPE/);
});

const bbPr = { id: 3, links: { html: { href: 'u' } }, title: 'T', source: { branch: { name: 'b' }, commit: { hash: 'h' } }, destination: { branch: { name: 'main' }, commit: { hash: 'd' } }, state: 'OPEN', description: 'Closes 5' };
const bbRoutes = (ci: string, comments: any[] = []) => (_m: string, url: string) =>
  url.includes('/statuses') ? { values: [{ key: 'ci', state: ci }] }
  : url.includes('/refs/branches') ? { target: { hash: 'd' } }
  : url.includes('/comments') ? { values: comments, id: 9 }
  : bbPr;

test('bitbucket: automerge merges when green, else records the marker once', async () => {
  const green = mk('bitbucket', { workspace: 'w', repo: 'r', token_env: 'TOK' }, bbRoutes('SUCCESSFUL'));
  await createForge(green.ctx).automerge('3');
  assert.ok(green.calls.some((c) => c.m === 'POST' && c.url.endsWith('/pullrequests/3/merge')));

  const red = mk('bitbucket', { workspace: 'w', repo: 'r', token_env: 'TOK' }, bbRoutes('INPROGRESS'));
  await createForge(red.ctx).automerge('3');
  assert.ok(!red.calls.some((c) => c.url.endsWith('/merge')));
  assert.match(red.calls.find((c) => c.m === 'POST')!.body.content.raw, /agentic-sdlc:automerge/);

  const again = mk('bitbucket', { workspace: 'w', repo: 'r', token_env: 'TOK' }, bbRoutes('INPROGRESS', [{ content: { raw: '<!-- agentic-sdlc:automerge -->' } }]));
  await createForge(again.ctx).automerge('3');
  assert.ok(!again.calls.some((c) => c.m === 'POST'));
});

test('azure: draft toggles isDraft; automerge sets autoCompleteSetBy', async () => {
  const pr = { pullRequestId: 4, title: 'T', sourceRefName: 'refs/heads/b', targetRefName: 'refs/heads/main', isDraft: true, status: 'active', description: '' };
  const { ctx, calls } = mk('azure', { org_url: 'https://dev.azure.com/o', project: 'p', repo: 'r', token_env: 'TOK' }, (_m, url) =>
    url.includes('connectionData') ? { authenticatedUser: { id: 'me' } } : url.includes('/statuses') ? { value: [{ context: { name: 'ci' }, state: 'succeeded' }] } : pr);
  const f = createForge(ctx);
  assert.equal((await f.view('4')).draft, true);
  await f.ready('4');
  assert.deepEqual(calls.find((c) => c.m === 'PATCH')!.body, { isDraft: false });
  await f.automerge('4');
  assert.equal(calls.filter((c) => c.m === 'PATCH').at(-1)!.body.autoCompleteSetBy.id, 'me');
  await assert.rejects(f.sync('4'), /not supported/);
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

test('cli: JSON on stdout, usage error is 2, failure is 1', async () => {
  const { ctx } = mk('gitlab', { project: 'p', base_url: 'https://gl', token_env: 'TOK' }, (_m, url) => (url.includes('/statuses') ? [] : url.includes('/merge_requests/7') ? glMr() : {}));
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
    const f = join(mkdtempSync(join(tmpdir(), 'f-')), 'b.md');
    writeFileSync(f, 'hi');
    assert.equal(await cli(['comment', '7', '--body-file', f], base), 0);
    assert.equal(await cli(['view', '8'], { ...base, env: {} }), 1);
  } finally {
    process.stdout.write = w;
    process.stderr.write = e;
  }
  assert.equal(JSON.parse(out[0]).n, '7');
});

test('list: state maps per forge and merged CRs carry mergeSha', async () => {
  const gl = mk('gitlab', { project: 'p', base_url: 'https://gl', token_env: 'TOK' }, (_m, url) =>
    url.includes('/merge_requests?') ? [glMr({ state: 'merged', merge_commit_sha: 'mm' })] : []);
  const crs = await createForge(gl.ctx).list({ state: 'merged' });
  assert.equal(crs[0].mergeSha, 'mm');
  assert.ok(gl.calls.some((c) => c.url.includes('state=merged')));

  const bb = mk('bitbucket', { workspace: 'w', repo: 'r', token_env: 'TOK' }, () => ({ values: [] }));
  await createForge(bb.ctx).list({ state: 'all' });
  assert.ok(bb.calls[0].url.includes('state=MERGED') && bb.calls[0].url.includes('state=OPEN'));

  const gh = mk('github', {}, () => ({}), () => '[]');
  await createForge(gh.ctx).list({ state: 'merged' });
  assert.ok(gh.execs.some((a) => a.join(' ').includes('--state merged')));
});

test('status and approve need review_token_env and never use the implementer token', async () => {
  const st = { context: 'review', state: 'success' as const, description: 'd' };
  const gh = mk('github', { repo: 'o/r' }, () => ({}));
  await assert.rejects(createForge(gh.ctx).status('abc', st), /review_token_env/);
  await assert.rejects(createForge(gh.ctx).approve('5'), /review_token_env/);

  const gl = mk('gitlab', { project: 'p', base_url: 'https://gl', token_env: 'TOK', review_token_env: 'REV' }, () => ({}));
  const auth: string[] = [];
  const http = gl.ctx.http;
  gl.ctx.http = async (m, url, o) => { auth.push(o!.headers!['PRIVATE-TOKEN']); return http(m, url, o); };
  await createForge(gl.ctx).status('abc', st);
  await createForge(gl.ctx).approve('7');
  assert.deepEqual(auth, ['r', 'r']);
  assert.ok(gl.calls.at(-1)!.url.endsWith('/merge_requests/7/approve'));

  const bb = mk('bitbucket', { workspace: 'w', repo: 'r', token_env: 'TOK', review_token_env: 'REV' }, () => ({}));
  await createForge(bb.ctx).approve('3');
  assert.ok(bb.calls.at(-1)!.url.endsWith('/pullrequests/3/approve'));
  await assert.rejects(createForge(mk('bitbucket', { workspace: 'w', repo: 'r', token_env: 'TOK' }, () => ({})).ctx).status('abc', st), /review_token_env/);

  const az = mk('azure', { org_url: 'https://dev.azure.com/o', project: 'p', repo: 'r', token_env: 'TOK', review_token_env: 'REV' }, (_m, url) =>
    url.includes('connectionData') ? { authenticatedUser: { id: 'rev' } } : {});
  await createForge(az.ctx).approve('4');
  assert.ok(az.calls.at(-1)!.url.includes('/pullrequests/4/reviewers/rev'));
  assert.equal(az.calls.at(-1)!.body.vote, 10);

  // Azure: the status goes on the PR iteration whose head is the sha; { as: 'ci' } uses token_env.
  const az2 = mk('azure', { org_url: 'https://dev.azure.com/o', project: 'p', repo: 'r', token_env: 'TOK' }, (_m, url) =>
    url.includes('/iterations') ? { value: [{ id: 1 }, { id: 2 }] }
      : url.includes('searchCriteria') ? { value: [{ pullRequestId: 9, lastMergeSourceCommit: { commitId: 'abc' } }] } : {});
  await assert.rejects(createForge(az2.ctx).status('abc', st), /review_token_env/);
  await createForge(az2.ctx).status('abc', st, { as: 'ci' });
  assert.ok(az2.calls.at(-1)!.url.includes('/pullrequests/9/statuses'));
  assert.equal(az2.calls.at(-1)!.body.iterationId, 2);
  await assert.rejects(createForge(az2.ctx).status('zzz', st, { as: 'ci' }), /no active pull request/);
});

test('gitlab: base_url is required, no default host', () => {
  assert.throws(() => createForge(mk('gitlab', { project: 'p', token_env: 'TOK' }, () => ({})).ctx), /base_url/);
});


test('approvals: { user, state, sha } from every forge', async () => {
  const gh = mk('github', { repo: 'o/r' }, () => ({}), (a) =>
    a.includes('--paginate') ? '{"user":"ann","state":"approved","sha":"h1"}\n{"user":"bob","state":"changes_requested","sha":"h0"}\n' : '');
  assert.deepEqual(await createForge(gh.ctx).approvals('5'), [{ user: 'ann', state: 'approved', sha: 'h1' }, { user: 'bob', state: 'changes_requested', sha: 'h0' }]);
  assert.ok(gh.execs[0].includes('repos/o/r/pulls/5/reviews'));

  const gl = mk('gitlab', { project: 'p', base_url: 'https://gl', token_env: 'TOK' }, (_m, url) =>
    url.endsWith('/approvals') ? { approved_by: [{ user: { username: 'ann' } }] } : glMr());
  assert.deepEqual(await createForge(gl.ctx).approvals('7'), [{ user: 'ann', state: 'approved', sha: 's1' }]);

  const az = mk('azure', { org_url: 'https://dev.azure.com/o', project: 'p', repo: 'r', token_env: 'TOK' }, () =>
    ({ lastMergeSourceCommit: { commitId: 'h' }, reviewers: [{ uniqueName: 'ann', vote: 10 }, { uniqueName: 'bob', vote: -10 }, { uniqueName: 'cy', vote: 0 }] }));
  assert.deepEqual((await createForge(az.ctx).approvals('4')).map((r) => `${r.user}:${r.state}:${r.sha}`), ['ann:approved:h', 'bob:changes_requested:h', 'cy:pending:h']);

  const bb = mk('bitbucket', { workspace: 'w', repo: 'r', token_env: 'TOK' }, () =>
    ({ source: { commit: { hash: 'h' } }, participants: [{ role: 'REVIEWER', approved: true, user: { nickname: 'ann' } }, { role: 'PARTICIPANT', approved: false, user: { nickname: 'x' } }] }));
  assert.deepEqual(await createForge(bb.ctx).approvals('3'), [{ user: 'ann', state: 'approved', sha: 'h' }]);
});

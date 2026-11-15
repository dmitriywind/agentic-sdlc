import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCloses, type AdapterContext } from '../src/ports.ts';
import { proofFiles } from '../src/gates.ts';
import { createForge, cli } from '../src/forge/index.ts';
import { setSleep } from '../src/exec.ts';

type Call = { m: string; url: string; body?: any };
const mk = (adapter: string, options: Record<string, unknown>, routes: (m: string, url: string, body?: any) => any, execOut: (a: string[]) => string = () => '') => {
  const calls: Call[] = [];
  const execs: string[][] = [];
  const envs: (string | undefined)[] = [];
  const ctx = {
    root: '.',
    env: { TOK: 't', U: 'u', REV: 'r' },
    options,
    binding: { forge: { adapter, options, required_checks: ['ci'], review_identity: options.review_token_env ? 'reviewer' : '' }, vcs: { trunk: 'main' } },
    exec: (_c: string, a: string[], o: any = {}) => { execs.push(a); envs.push(o.env?.GH_TOKEN); return execOut(a); },
    http: async (m: string, url: string, o: any = {}) => { calls.push({ m, url, body: o.body }); return routes(m, url, o.body); },
  } as unknown as AdapterContext;
  return { ctx, calls, execs, envs };
};

test('parseCloses never reads an id from the next line and dedupes', () => {
  assert.deepEqual(parseCloses('Closes \nRefactor\n'), []);
  assert.deepEqual(parseCloses('Closes #12\nCloses #12'), ['12']);
});

const pull = { number: 5, html_url: 'u', title: 'T', head: { ref: 'b', sha: 'h' }, base: { ref: 'main', sha: 'm' }, draft: false, state: 'open', body: 'Closes 1', mergeable_state: 'behind' };
const restExec = (a: string[]) => {
  const path = a.find((x) => x.startsWith('repos/')) ?? '';
  if (path.includes('/check-runs')) return [{ id: 3, name: 'ci', status: 'completed', conclusion: 'success' }, { id: 2, name: 'e2e', status: 'in_progress', conclusion: null }, { id: 1, name: 'ci', status: 'completed', conclusion: 'failure' }].map((r) => JSON.stringify(r)).join('\n');
  if (path.includes('/status?')) return JSON.stringify({ context: 'review', state: 'error' });
  // gh --paginate --slurp returns one array per page.
  if (path.includes('/pulls?')) return JSON.stringify([[{ ...pull, number: 5, merged_at: 'x' }, { ...pull, number: 6, merged_at: null }]]);
  if (path.includes('/check-suites') || a.includes('--paginate')) return '';
  if (path.endsWith('/comments')) return JSON.stringify({ id: 9, html_url: 'cu' });
  return JSON.stringify(pull);
};

test('github: draft = ready --undo outside the cloud, checks from REST (the newest run per name), status via api', async () => {
  const { ctx, execs, envs } = mk('github', { repo: 'o/r', token_env: 'TOK', review_token_env: 'REV' }, () => ({}), restExec);
  const f = createForge(ctx);
  const cr = await f.draft('5');
  assert.ok(execs.some((a) => a.join(' ').startsWith('pr ready 5 --undo')));
  assert.equal(cr.behind, true);
  assert.deepEqual(cr.checks, [{ name: 'ci', state: 'success' }, { name: 'e2e', state: 'pending' }, { name: 'review', state: 'failure' }]);
  await f.status('abcdef1', { context: 'c', state: 'pending', description: 'd' });
  const i = execs.findIndex((a) => a[0] === 'api' && a.includes('repos/o/r/statuses/abcdef1'));
  assert.ok(i >= 0);
  assert.equal(envs[i], 'r', 'status runs with the review token');
  assert.equal(envs[0], 't', 'other verbs run with token_env');
  await f.approve('5');
  assert.deepEqual(execs.at(-1), ['api', '-X', 'POST', 'repos/o/r/pulls/5/reviews', '--input', '-']);
  assert.equal(envs.at(-1), 'r');
});

test('github: in a cloud session every verb is REST under repos/ and ready, draft, automerge use the ccr routes; an unset token_env falls back to the proxy', async () => {
  const inputs: (string | undefined)[] = [];
  const { ctx, execs } = mk('github', { review_token_env: 'REV', token_env: 'UNSET_IN_CLOUD' }, () => ({}), restExec);
  ctx.env.CLAUDE_CODE_REMOTE = 'true';
  const exec = ctx.exec;
  ctx.exec = (c, a, o: any = {}) => (inputs.push(o.input), exec(c, a, o));
  const f = createForge(ctx);
  assert.equal((await f.open({ source: 'b', title: 'T', body: 'Closes 1', draft: true })).n, '5');
  assert.deepEqual(JSON.parse(inputs[0]!), { head: 'b', base: 'main', title: 'T', body: 'Closes 1', draft: true });
  await f.view('5'); await f.diff('5'); await f.list(); await f.ready('5'); await f.draft('5'); await f.sync('5'); await f.automerge('5');
  assert.deepEqual(await f.comment('5', 'hi'), { id: '9', url: 'cu' });
  await f.approve('5'); await f.comments('5'); await f.approvals('5');
  for (const a of execs) {
    assert.equal(a[0], 'api', a.join(' '));
    assert.ok(a.some((x) => x.startsWith('repos/{owner}/{repo}/')), a.join(' '));
    assert.ok(!a.some((x) => /graphql/.test(x)), a.join(' '));
  }
  const has = (s: string) => execs.some((a) => a.join(' ').includes(s));
  assert.ok(has('-X POST repos/{owner}/{repo}/pulls/5/ccr/ready_for_review'));
  assert.ok(has('-X POST repos/{owner}/{repo}/pulls/5/ccr/convert_to_draft'));
  assert.ok(has('-X PUT repos/{owner}/{repo}/pulls/5/ccr/auto_merge'));
  assert.ok(has('-X PUT repos/{owner}/{repo}/pulls/5/update-branch'));
  assert.ok(has('repos/{owner}/{repo}/pulls/5 -H Accept: application/vnd.github.diff'));
});

test('github: a repo without draft PRs marks drafts with the draft label; an unprotected trunk merges once required checks are green', async () => {
  let labels: { name: string }[] = [];
  const { ctx, execs } = mk('github', { repo: 'o/r' }, () => ({}), (a) => {
    const s = a.join(' ');
    if (s.startsWith('pr ') || s.includes('/ccr/')) throw new Error('gh: Draft pull requests are not supported in this repository. (HTTP 422)');
    if (s.includes('-X POST repos/o/r/pulls ')) {
      if (JSON.parse(String(inputs.at(-1))).draft) throw new Error('Command failed: gh api\ngh: Draft pull requests are not supported in this repository. (HTTP 422)');
      return JSON.stringify({ number: 5 });
    }
    if (s.includes('issues/5/labels/draft')) { labels = []; return '[]'; }
    if (s.includes('issues/5/labels')) { labels = [{ name: 'draft' }]; return '[]'; }
    return a.at(-1)?.startsWith('repos/o/r/pulls/5') && a.length === 2 ? JSON.stringify({ ...pull, labels }) : restExec(a);
  });
  const inputs: (string | undefined)[] = [];
  const exec = ctx.exec;
  ctx.exec = (c, a, o: any = {}) => (inputs.push(o.input), exec(c, a, o));
  const f = createForge(ctx);
  assert.equal((await f.open({ source: 'b', title: 'T', body: 'Closes 1', draft: true })).draft, true);
  assert.equal((await f.ready('5')).draft, false);
  assert.equal((await f.draft('5')).draft, true);
  await assert.rejects(f.automerge('5'), /not supported/, 'a draft never merges');
  await f.ready('5');
  await f.automerge('5');
  assert.ok(execs.some((a) => a.join(' ') === 'api -X PUT repos/o/r/pulls/5/merge -f merge_method=squash -f sha=h'));
});

const stdout = async (fn: () => Promise<unknown>) => {
  const out: string[] = [];
  const w = process.stdout.write;
  process.stdout.write = ((s: string) => (out.push(s), true)) as any;
  try { await fn(); } finally { process.stdout.write = w; }
  return JSON.parse(out.join(''));
};

const ghPull = { number: 7, html_url: 'u', title: 'T', head: { ref: 'b', sha: 'h' }, base: { ref: 'main', sha: 'm' }, draft: false, state: 'open', body: 'Closes 1', user: { login: 'ann' } };
const ghExec = (a: string[]) => a[0] === 'api' && a.at(-1)!.endsWith('/pulls/7') ? JSON.stringify(ghPull) : /\/(check-runs|status)\b/.test(a.join(' ')) ? '' : a[0] === 'api' ? (() => { throw new Error('HTTP 404'); })() : '';

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

test('cli: comments --trusted keeps the owners and bots by forge name, --last counts after the filter, and pages come from gh api', async () => {
  {
    const row = (id: number, author: string) => JSON.stringify({ id: String(id), author, createdAt: String(id), body: `b${id}`, url: 'u' });
    const { ctx } = mk('github', { repo: 'o/r' }, () => ({}), () => [row(1, 'owner'), row(2, 'Bot'), row(3, 'mallory')].join(String.fromCharCode(10)));
    (ctx.binding as any).owners = { product: 'owner', factory: 'fac', bots: ['bot'] };
    const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
    const out = await stdout(() => cli(['comments', '7', '--trusted', '--last', '1'], base));
    assert.deepEqual(out.map((c: any) => c.id), ['2']);
  }
  {
    const row = (id: number, author: string) => JSON.stringify({ id: String(id), author, createdAt: String(id), body: `b${id}`, url: 'u' });
    const { ctx, execs } = mk('github', { repo: 'o/r' }, () => '', () => `${row(1, 'a')}\n${row(2, 'b')}\n${row(3, 'c')}\n`);
    assert.deepEqual((await createForge(ctx).comments('4')).map((c) => c.author), ['a', 'b', 'c']);
    assert.ok(execs[0].includes('--paginate') && execs[0].includes('repos/o/r/issues/4/comments'));
  }
  {
    const row = (id: number, author: string) => JSON.stringify({ id: String(id), author, createdAt: String(id), body: `b${id}`, url: 'u' });
    const { ctx } = mk('github', { repo: 'o/r' }, () => ({}), () => [row(1, 'ann-gh'), row(2, 'acc-123')].join(String.fromCharCode(10)));
    (ctx.binding as any).owners = { product: { board: 'acc-123', forge: 'ann-gh' }, factory: 'fac', bots: [{ board: 'acc-bot', forge: 'bot[bot]' }] };
    const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
    const out = await stdout(() => cli(['comments', '7', '--trusted'], base));
    assert.deepEqual(out.map((c: any) => c.id), ['1']);
  }
});

test('cli: status refuses the contexts only a gate posts', async () => {
  const { ctx, execs } = mk('github', { repo: 'o/r', review_token_env: 'REV' }, () => ({}));
  const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
  const e = process.stderr.write; process.stderr.write = (() => true) as any;
  try {
    for (const c of ['human-approval', 'ticket-linkage', 'proofs-on-base'])
      assert.equal(await cli(['status', 'abcdef1', '--context', c, '--state', 'success', '--description', 'd'], base), 2, c);
  } finally { process.stderr.write = e; }
  assert.deepEqual(execs, []);
});

test('two identities: status and approve need review_token_env and never use the implementer token; a missing token env fails naming the variable', async () => {
  const st = { context: 'review', state: 'success' as const, description: 'd' };
  const gh = mk('github', { repo: 'o/r', token_env: 'TOK', review_token_env: 'UNSET' }, () => ({}));
  await assert.rejects(createForge(gh.ctx).status('abcdef1', st), /review_token_env/);
  await assert.rejects(createForge(gh.ctx).approve('5'), /review_token_env/);
  assert.deepEqual(gh.envs, []);
  const { ctx } = mk('github', { repo: 'o/r', token_env: 'NOPE' }, () => ({}), ghExec);
  await assert.rejects(createForge(ctx).view('7'), /NOPE/);
});

test('one identity: status posts with the implementer token; approve is refused, since GitHub refuses the author', async () => {
  const st = { context: 'review', state: 'success' as const, description: 'd' };
  const gh = mk('github', { repo: 'o/r', token_env: 'TOK' }, () => ({}));
  await createForge(gh.ctx).status('abcdef1', st);
  assert.ok(gh.execs[0].includes('repos/o/r/statuses/abcdef1'));
  assert.deepEqual(gh.envs, ['t']);
  await assert.rejects(createForge(gh.ctx).approve('5'), /one identity/);
});

test('github reads: merged CRs are the closed pulls with a merge, approvals are { user, state, sha }, pushedAt is the first check suite on the head', async () => {
  {
    const gh = mk('github', { repo: 'o/r' }, () => ({}), restExec);
    assert.equal((await createForge(gh.ctx).list({ state: 'merged' })).length, 1);
    assert.ok(gh.execs[0].includes('repos/o/r/pulls?state=closed&per_page=100'));
  }
  {
    const gh = mk('github', { repo: 'o/r' }, () => ({}), (a) =>
      a.includes('--paginate') ? '{"user":"ann","state":"approved","sha":"h1"}\n{"user":"bob","state":"changes_requested","sha":"h0"}\n' : '');
    assert.deepEqual(await createForge(gh.ctx).approvals('5'), [{ user: 'ann', state: 'approved', sha: 'h1' }, { user: 'bob', state: 'changes_requested', sha: 'h0' }]);
    assert.ok(gh.execs[0].includes('repos/o/r/pulls/5/reviews'));
  }
  {
    const at = (a: string[]) => a.join(' ').includes('/check-suites') ? '2026-11-14T10:00:00Z\n' : ghExec(a);
    const { ctx, execs } = mk('github', { repo: 'o/r' }, () => ({}), at);
    assert.equal((await createForge(ctx).view('7')).pushedAt, '2026-11-14T10:00:00Z');
    assert.ok(execs.some((a) => a.includes('repos/o/r/commits/h/check-suites')));
    assert.equal((await createForge(mk('github', { repo: 'o/r' }, () => ({}), ghExec).ctx).view('7')).pushedAt, undefined);
  }
});

test('cut: dispatches the release workflow and returns the run newer than any before it', async () => {
  let listed = 0;
  const gh = mk('github', { repo: 'o/r' }, () => ({}), (a) =>
    a[0] === 'run' ? JSON.stringify(listed++ === 0 ? [{ databaseId: 10, url: 'old' }] : [{ databaseId: 11, url: 'new' }, { databaseId: 10, url: 'old' }]) : '');
  assert.deepEqual(await createForge(gh.ctx).cut('abc', '1.2.0'), { requested: true, run: '11', url: 'new' });
  assert.ok(gh.execs.some((a) => a.join(' ').startsWith('workflow run agentic-sdlc-release.yml -f revision=abc -f version=1.2.0')));
});


test('github view reads every page of check runs and commit statuses', async () => {
  const gh = mk('github', { repo: 'o/r' }, () => ({}), restExec);
  await createForge(gh.ctx).view('5');
  const at = (frag: string) => gh.execs.find((a) => a.some((x) => x.includes(frag)))!;
  assert.ok(at('/check-runs').includes('--paginate'));
  assert.ok(at('/status?').includes('--paginate'));
});

test('github viewBySha prefers the merge commit, then the head, then the first pull', async () => {
  const pick = async (pulls: any[], sha: string) => {
    const gh = mk('github', { repo: 'o/r' }, () => ({}), (a) => {
      const path = a.find((x) => x.startsWith('repos/')) ?? '';
      if (path.endsWith('/pulls')) return JSON.stringify(pulls);
      if (path.includes('/check-runs') || path.includes('/status?') || path.includes('/check-suites')) return '';
      return JSON.stringify({ ...pull, number: Number(path.split('/pulls/')[1]) });
    });
    return (await createForge(gh.ctx).viewBySha(sha)).n;
  };
  const sha = 'abcdef1234';
  assert.equal(await pick([{ number: 1, head: { sha: 'x' } }, { number: 2, merge_commit_sha: sha }, { number: 3, head: { sha } }], sha), '2');
  assert.equal(await pick([{ number: 1, head: { sha: 'x' } }, { number: 3, head: { sha } }], sha), '3');
  assert.equal(await pick([{ number: 1, head: { sha: 'x' } }, { number: 4, head: { sha: 'y' } }], sha), '1');
});

test('github refuses a change request number or sha that is not an id before calling gh', async () => {
  const gh = mk('github', { repo: 'o/r' }, () => ({}), restExec);
  const f = createForge(gh.ctx);
  await assert.rejects(f.view('5/../../x'), /not a change request number/);
  await assert.rejects(f.diff('x'), /not a change request number/);
  await assert.rejects(f.comments('1;2'), /not a change request number/);
  await assert.rejects(f.viewBySha('../x'), /not a commit sha/);
  await assert.rejects(f.status('xyz', { context: 'c', state: 'success', description: 'd' }), /not a commit sha/);
  assert.equal(gh.execs.length, 0);
});

const quiet = async <T>(fn: () => Promise<T>) => {
  const w = process.stdout.write, e = process.stderr.write;
  const out: string[] = [], err: string[] = [];
  process.stdout.write = ((s: string) => (out.push(s), true)) as any;
  process.stderr.write = ((s: string) => (err.push(s), true)) as any;
  try { return { r: await fn(), out: out.join(''), err: err.join('') }; } finally { process.stdout.write = w; process.stderr.write = e; }
};

test('gh reads retry up to 3 tries on 429, a rate-limit 403 and 5xx, honouring a retry-after hint; writes retry only on a rate limit', async () => {
  const waits: number[] = [];
  const prev = setSleep(async (ms) => { waits.push(ms); });
  try {
    let n = 0;
    const flaky = (msg: string, times: number) => (a: string[]) => {
      if (++n <= times) throw new Error(msg);
      return a.some((x) => x === 'POST') ? JSON.stringify({ id: 9, html_url: 'cu' }) : JSON.stringify(pull);
    };
    const run = async (msg: string, times: number, fn: (f: ReturnType<typeof createForge>) => Promise<unknown>) => {
      n = 0; waits.length = 0;
      const { ctx } = mk('github', { repo: 'o/r' }, () => ({}), flaky(msg, times));
      return fn(createForge(ctx));
    };
    await run('gh: HTTP 502: Bad Gateway', 2, (f) => f.diff('5'));
    assert.deepEqual(waits, [1000, 2000]);
    await run('gh: HTTP 429: slow down\nRetry-After: 7', 1, (f) => f.diff('5'));
    assert.deepEqual(waits, [7000]);
    await run('gh: HTTP 403: You have exceeded a secondary rate limit. please retry after 3 seconds', 1, (f) => f.diff('5'));
    assert.deepEqual(waits, [3000]);
    await assert.rejects(run('gh: HTTP 503', 3, (f) => f.diff('5')), /503/);
    assert.equal(n, 3);
    await assert.rejects(run('gh: HTTP 403: Resource not accessible', 1, (f) => f.diff('5')), /403/);
    assert.equal(n, 1);
    // A write: a rate limit is retried, a 5xx is not (it may have happened).
    assert.deepEqual(await run('gh: HTTP 429', 1, (f) => f.comment('5', 'hi')), { id: '9', url: 'cu' });
    assert.equal(n, 2);
    await assert.rejects(run('gh: HTTP 502', 1, (f) => f.comment('5', 'hi')), /502/);
    assert.equal(n, 1);
  } finally { setSleep(prev); }
});

test('forge list: --limit and --since bound the read, and without --checks no check data is fetched', async () => {
  const row = (number: number, updated: string, merged?: string) => ({ ...pull, number, updated_at: updated, merged_at: merged ?? null, merge_commit_sha: `m${number}`, state: 'closed' });
  const rows = [row(9, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z'), row(8, '2026-11-05T00:00:00Z', '2026-11-05T00:00:00Z'), row(7, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')];
  const { ctx, execs } = mk('github', { repo: 'o/r' }, () => ({}), () => JSON.stringify(rows));
  const f = createForge(ctx);
  const two = await f.list({ state: 'merged', limit: 2 });
  assert.deepEqual(two.map((c) => c.n), ['9', '8']);
  assert.deepEqual([two[0].checks, two[0].mergeSha, two[0].state], [[], 'm9', 'merged']);
  assert.ok(execs[0].some((x) => x.includes('sort=updated&direction=desc')));
  assert.deepEqual((await f.list({ state: 'merged', since: '2026-11-01' })).map((c) => c.n), ['9', '8']);
  assert.ok(execs.every((a) => !a.join(' ').includes('check-runs')), 'no check data without checks');
  const withChecks = mk('github', { repo: 'o/r' }, () => ({}), (a) => (a.join(' ').includes('/pulls?') ? JSON.stringify([[{ ...pull, number: 5, merged_at: 'x' }]]) : restExec(a)));
  const crs = await createForge(withChecks.ctx).list({ state: 'merged', checks: true });
  assert.equal(crs[0].checks.length, 3);
});

test('forge run reads one CI run by id; a missing run fails; cli list and run take their flags', async () => {
  const run = { databaseId: 42, name: 'ci', headBranch: 'main', headSha: 's', status: 'completed', conclusion: 'failure', url: 'u', createdAt: 't' };
  const { ctx, execs } = mk('github', { repo: 'o/r' }, () => ({}), (a) => {
    if (a[0] === 'run' && a[1] === 'view' && a[2] === '42') return JSON.stringify(run);
    if (a[0] === 'run') throw new Error('gh: HTTP 404: Not Found');
    return JSON.stringify([]);
  });
  const f = createForge(ctx);
  assert.deepEqual(await f.run('42'), { id: '42', name: 'ci', ref: 'main', sha: 's', url: 'u', at: 't', state: 'failure' });
  assert.deepEqual(execs[0].slice(0, 3), ['run', 'view', '42']);
  await assert.rejects(f.run('43'), /404/);
  await assert.rejects(f.run('x; rm'), /not a run id/);
  const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
  assert.equal((await quiet(() => cli(['run', '42'], base))).r, 0);
  assert.equal((await quiet(() => cli(['run', '43'], base))).r, 1);
  assert.equal((await quiet(() => cli(['list', '--state', 'merged', '--limit', '5', '--since', '2026-01-01', '--checks'], base))).r, 0);
  assert.equal((await quiet(() => cli(['list', '--limit', 'x'], base))).r, 2);
  assert.equal((await quiet(() => cli(['list', '--since', 'never'], base))).r, 2);
});

test('forge and vcs cli: an unknown flag, a flag without a value and an unreadable --body-file are usage errors; --k=v works', async () => {
  const { ctx } = mk('github', { repo: 'o/r' }, () => ({}), ghExec);
  const base = { root: ctx.root, binding: ctx.binding, env: ctx.env, exec: ctx.exec, http: ctx.http };
  const t = async (argv: string[]) => { const x = await quiet(() => cli(argv, base)); return [x.r, x.err.trim()]; };
  assert.deepEqual(await t(['view', '7', '--bogus']), [2, 'unknown flag --bogus for forge view']);
  assert.deepEqual(await t(['list', '--state']), [2, '--state needs a value']);
  assert.deepEqual(await t(['list', '--checks=yes']), [2, '--checks takes no value']);
  const open = await t(['open', '--source', 'b', '--title', 't', '--body-file', '/nonexistent/body.md']);
  assert.equal(open[0], 2);
  assert.match(String(open[1]), /--body-file cannot be read: \/nonexistent\/body\.md/);
  const ok = await quiet(() => cli(['view', '--sha=abc1234'], { ...base, exec: (c, a, o) => (a.some((x) => x.includes('/commits/abc1234/pulls')) ? JSON.stringify([{ number: 7, head: { sha: 'abc1234' } }]) : ctx.exec(c, a, o)) }));
  assert.equal(ok.r, 0);
  const { cli: vcli } = await import('../src/vcs/index.ts');
  const vbase = { ...base, binding: { ...ctx.binding, vcs: { adapter: 'git', trunk: 'main' } } as any };
  const v = await quiet(() => vcli(['head', '--bogus'], vbase));
  assert.deepEqual([v.r, v.err.trim()], [2, 'unknown flag --bogus for vcs head']);
  const w = await quiet(() => vcli(['changed', '--since'], vbase));
  assert.deepEqual([w.r, w.err.trim()], [2, '--since needs a value']);
});

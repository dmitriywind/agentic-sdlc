import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../src/board/index.ts';
import { MovedError } from '../src/ports.ts';
import { binding, fakeCtx } from './helpers.ts';

const mk = (adapter: string, options: Record<string, unknown>, answer: (c: string) => unknown, env = {}) => {
  const f = fakeCtx('.', options, answer, env);
  f.ctx.binding = { ...binding, board: { ...binding.board, adapter } } as any;
  return { board: createBoard(f.ctx), calls: f.calls };
};

// github
const ghAnswer = (status: string) => (c: string) => {
  if (c.includes('project view')) return { id: 'P1' };
  if (c.includes('field-list')) return { fields: [{ id: 'F1', name: 'Status', options: [{ id: 'O1', name: 'Ready' }, { id: 'O2', name: 'In progress' }] }] };
  if (c.includes('item-add')) return { id: 'I7' };
  if (c.includes('item-list')) return { items: [{ id: 'I7', status, content: { number: 7, title: 't', url: 'u' } }] };
  if (c.includes('issue view')) return { body: '', createdAt: '', updatedAt: '', assignees: [], labels: [] };
  return [];
};
const gh = { owner: 'o', project_number: 1, repo: 'o/r' };

// jira
const jira = { base_url: 'https://x.atlassian.net', project_key: 'PROJ', email_env: 'JE', token_env: 'JT' };
const jiraAnswer = (status: string) => (c: string) => {
  if (c.includes('/transitions') && c.startsWith('GET')) return { transitions: [{ id: '31', to: { name: 'In progress' } }] };
  if (c.includes('/field')) return [{ id: 'cf1', name: 'Size' }, { id: 'cf2', name: 'Priority' }];
  if (c.includes('/issue/PROJ-1')) return { key: 'PROJ-1', fields: { summary: 's', status: { name: status }, labels: [], subtasks: [] } };
  return {};
};

// linear
const linearAnswer = (status: string) => (c: string) => {
  const issue = { id: 'U1', identifier: 'LIN-9', title: 't', url: 'u', createdAt: '', updatedAt: '', priority: 0, state: { name: status }, labels: { nodes: [] }, parent: null, children: { nodes: [] } };
  if (c.includes('teams(')) return { data: { teams: { nodes: [{ id: 'T1', states: { nodes: [{ id: 'S2', name: 'In progress' }] }, labels: { nodes: [] } }] } } };
  if (c.includes('issueUpdate')) return { data: { issueUpdate: { issue } } };
  return { data: { issue } };
};


test('github: a Project shared by two repos yields only the issues of this repo', async () => {
  const mine = String((gh as any).repo);
  const answer = (c: string) => (c.includes('item-list') ? { items: [
    { id: 'A', status: 'Ready', content: { number: 12, title: 'mine', url: 'u', repository: mine.toUpperCase() } },
    { id: 'B', status: 'Done', content: { number: 12, title: 'theirs', url: 'u', repository: 'other/repo' } },
  ] } : ghAnswer('Ready')(c));
  const list = await mk('github', gh, answer).board.list();
  assert.deepEqual(list.map((i) => i.title), ['mine']);
});

// github-issues: a fake REST repo behind `gh api`; every call is recorded with its JSON input.
const issuesRepo = (issues: any[], labels: string[] = []) => {
  const calls: { args: string[]; input?: any }[] = [];
  const f = fakeCtx('.', { repo: 'o/r' }, () => ({}));
  f.ctx.binding = { ...binding, board: { ...binding.board, adapter: 'github-issues', fields: { size: 'Size', release_version: 'Release Version' } } } as any;
  f.ctx.exec = (cmd, args, o) => {
    const input = o?.input ? JSON.parse(o.input) : undefined;
    calls.push({ args: [cmd, ...args], input });
    const [method, url] = [args[2], args[3]];
    const [path, qs] = url.replace('repos/o/r/', '').split('?');
    const page = Number(new URLSearchParams(qs).get('page') ?? 1);
    const pageOf = (xs: any[]) => JSON.stringify(xs.slice((page - 1) * 100, page * 100));
    const it = issues.find((i) => i.number === Number(path.split('/')[1]));
    const named = (ls: string[]) => ls.map((name) => ({ name }));
    if (path === 'issues' && method === 'GET') return pageOf(issues);
    if (path === 'issues') { const i = { number: 100 + issues.length, id: 9000, ...input, labels: named(input.labels) }; issues.push(i); return JSON.stringify(i); }
    if (path === 'labels') { if (method === 'POST') labels.push(input.name); return method === 'GET' ? pageOf(named(labels)) : '{}'; }
    if (path === 'milestones') return pageOf([{ number: 3, title: 'M1' }]);
    if (/^issues\/\d+$/.test(path)) {
      if (method === 'PATCH') Object.assign(it, input, input.labels ? { labels: named(input.labels) } : {});
      return JSON.stringify(it);
    }
    if (path.endsWith('/comments')) return method === 'POST' ? JSON.stringify({ id: 5, html_url: 'c5' }) : pageOf(it.comments ?? []);
    if (path.endsWith('/sub_issues')) return '[]';
    if (path.endsWith('/parent')) throw new Error('404');
    return '{}';
  };
  return { board: createBoard(f.ctx), calls, issues, labels };
};
const iss = (number: number, labels: string[], extra = {}) => ({ number, id: number * 10, title: `t${number}`, body: '', html_url: `u${number}`, labels: labels.map((name) => ({ name })), assignees: [], ...extra });
/** Every call is `gh api -X <method> repos/o/r/...`: no GraphQL, no `gh issue`, no `gh project`. */
const onlyRepoRest = (calls: { args: string[] }[]) => {
  for (const { args } of calls) {
    assert.deepEqual(args.slice(0, 3), ['gh', 'api', '-X'], args.join(' '));
    assert.ok(args[4].startsWith('repos/o/r/'), args.join(' '));
    assert.ok(!args.some((a) => /graphql|^issue$|^project$/.test(a)), args.join(' '));
  }
};

test('github-issues list reads status and fields from labels, pages by 100, skips PRs and unlabelled issues', async () => {
  const many = Array.from({ length: 150 }, (_, k) => iss(k + 1, k === 120 ? ['status:Ready', 'size:S', 'release version:1.2', 'bug'] : ['status:Backlog']));
  const { board, calls } = issuesRepo([...many, iss(200, []), iss(201, ['status:Ready'], { pull_request: {} })]);
  assert.equal((await board.list()).length, 150);
  const ready = await board.list({ status: ['Ready'] });
  assert.deepEqual(ready.map((i) => [i.id, i.status, i.fields, i.labels]), [['121', 'Ready', { size: 'S', release_version: '1.2' }, ['bug']]]);
  assert.ok(calls.some((c) => c.args[4].includes('per_page=100&page=2')));
  onlyRepoRest(calls);
});

test('github-issues move swaps the status label, and refuses with --only-from when the status differs', async () => {
  const { board, calls, issues } = issuesRepo([iss(7, ['status:Backlog', 'size:M'])], ['status:Backlog', 'size:M']);
  await assert.rejects(board.move('7', 'In progress', 'Ready'), MovedError);
  assert.ok(!calls.some((c) => c.args[3] === 'PATCH'));
  assert.equal((await board.move('7', 'In progress', 'Backlog')).status, 'In progress');
  assert.deepEqual(issues[0].labels.map((l: any) => l.name), ['size:M', 'status:In progress']);
  onlyRepoRest(calls);
});

test('github-issues create ensures every label exists, then sets the milestone and the parent', async () => {
  const { board, calls, labels } = issuesRepo([iss(1, ['status:Backlog'])], ['bug']);
  const it = await board.create({ title: 'n', body: 'b', status: 'Ready', labels: ['bug', 'feature'], milestone: 'M1', parent: '1' });
  assert.deepEqual(labels, ['bug', 'feature', 'status:Ready']);
  assert.equal(it.status, 'Ready');
  assert.equal(calls.find((c) => c.args[4] === 'repos/o/r/issues' && c.args[3] === 'POST')!.input.milestone, 3);
  assert.ok(calls.some((c) => c.args[4] === 'repos/o/r/issues/1/sub_issues' && c.input?.sub_issue_id === 9000));
  onlyRepoRest(calls);
});

test('github-issues set and label edit labels; close sets the state reason and Cancelled', async () => {
  const { board, calls, issues } = issuesRepo([iss(7, ['status:In review', 'size:M', 'bug'])]);
  assert.deepEqual((await board.set('7', 'size', 'L')).fields, { size: 'L' });
  assert.deepEqual((await board.set('7', 'size', null)).fields, {});
  assert.deepEqual((await board.label('7', 'remove', 'bug')).labels, []);
  assert.equal((await board.close('7', 'not_planned')).status, 'Cancelled');
  assert.equal(issues[0].state, 'closed');
  assert.equal(issues[0].state_reason, 'not_planned');
  onlyRepoRest(calls);
});

test('github-issues comments page, newest first, and filter by marker', async () => {
  const comments = Array.from({ length: 120 }, (_, k) => ({ id: k, user: { login: 'bot' }, created_at: String(k), body: k === 110 ? 'hb\nx' : 'hi', html_url: '' }));
  const { board, calls } = issuesRepo([iss(7, ['status:Ready'], { comments })]);
  const all = await board.comments('7');
  assert.equal(all.length, 120);
  assert.equal(all[0].id, '119');
  assert.deepEqual((await board.comments('7', { marker: 'hb' })).map((c) => c.id), ['110']);
  onlyRepoRest(calls);
});

// github, jira and linear: one behaviour, three adapters
const linCfg = { team_key: 'LIN', token_env: 'LT' };
const jEnv = { JE: 'a@b', JT: 'secret' };
const jFields = [{ id: 'cf1', name: 'Size' }, { id: 'cf2', name: 'Priority' }];
const jIssue = (k: string) => ({ key: k, fields: { summary: k, status: { name: 'Ready' }, labels: [], subtasks: [] } });
const lIssue = (id: string) => ({ id, identifier: id, title: 't', url: 'u', createdAt: '', updatedAt: '', priority: 0, state: { name: 'Ready' }, labels: { nodes: [] }, parent: null, children: { nodes: [] } });

test('board move on github, jira and linear refuses when the status differs and writes nothing, else writes the resolved id', async () => {
  const cases = [
    { make: (s: string) => mk('github', gh, ghAnswer(s)), id: '7', writes: (c: string) => c.includes('item-edit'), resolved: (cs: string[]) => cs.includes('gh project item-edit --project-id P1 --id I7 --field-id F1 --single-select-option-id O2') },
    { make: (s: string) => mk('jira', jira, jiraAnswer(s), jEnv), id: 'PROJ-1', writes: (c: string) => c.startsWith('POST') && c.includes('/transitions'), resolved: (cs: string[]) => cs.some((c) => c.startsWith('POST') && c.includes('/issue/PROJ-1/transitions') && c.includes('{"transition":{"id":"31"}}')) },
    { make: (s: string) => mk('linear', linCfg, linearAnswer(s), { LT: 'k' }), id: 'LIN-9', writes: (c: string) => c.includes('issueUpdate'), resolved: (cs: string[]) => cs.some((c) => c.includes('issueUpdate') && c.includes('"stateId":"S2"')) },
  ];
  for (const t of cases) {
    const stale = t.make('Backlog');
    await assert.rejects(stale.board.move(t.id, 'In progress', 'Ready'), MovedError);
    assert.ok(!stale.calls.some(t.writes), 'a refused move wrote');
    const ok = t.make('Ready');
    await ok.board.move(t.id, 'In progress', 'Ready');
    assert.ok(t.resolved(ok.calls), 'the move did not write the resolved id');
  }
});

test('a board adapter without its credential fails naming the variable, and github passes token_env as GH_TOKEN on every call', async () => {
  const f = fakeCtx('.', { ...gh, token_env: 'BT' }, ghAnswer('Ready'), { BT: 'pat' });
  f.ctx.binding = { ...binding, board: { ...binding.board, adapter: 'github' } } as any;
  const tokens: (string | undefined)[] = [];
  const exec = f.ctx.exec;
  f.ctx.exec = (c, a, o) => { tokens.push(o?.env?.GH_TOKEN); return exec(c, a, o); };
  await createBoard(f.ctx).move('7', 'In progress');
  assert.ok(tokens.length > 0 && tokens.every((t) => t === 'pat'));
  await assert.rejects(mk('github', { ...gh, token_env: 'BT' }, ghAnswer('Ready')).board.move('7', 'In progress'), /BT/);
  await assert.rejects(mk('jira', jira, jiraAnswer('Ready')).board.get('PROJ-1'), /JE and JT/);
});

test('board reads on jira, linear and github follow every page, and fail instead of returning a partial list', async () => {
  const jiraBoard = (answer: (c: string) => unknown) => mk('jira', jira, (c) => (c.includes('/field') ? jFields : answer(c)), jEnv);
  // jira list: nextPageToken until isLast
  const paged = jiraBoard((c) => (c.includes('"nextPageToken":"t2"') ? { issues: [jIssue('PROJ-2')], isLast: true } : c.includes('/search/jql') ? { issues: [jIssue('PROJ-1')], nextPageToken: 't2' } : undefined));
  assert.deepEqual((await paged.board.list()).map((i) => i.id), ['PROJ-1', 'PROJ-2']);
  assert.equal(paged.calls.filter((c) => c.includes('/search/jql')).length, 2);
  // jira comments: a marker on page 2 is found
  const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({
    id: String(from + i), created: '', body: { type: 'doc', content: [{ type: 'text', text: from + i === 120 ? 'marker-x' : 'hi' }] },
  }));
  const jc = mk('jira', jira, (c) => (c.includes('startAt=100') ? { total: 150, comments: page(100, 50) } : { total: 150, comments: page(0, 100) }), jEnv).board;
  assert.equal((await jc.comments('PROJ-1')).length, 150);
  assert.deepEqual((await jc.comments('PROJ-1', { marker: 'marker-x' })).map((c) => c.id), ['120']);
  // linear: list and comments follow endCursor
  const comment = (id: string) => ({ id, body: 'b', createdAt: id, url: 'u', user: null });
  const lin = mk('linear', linCfg, (c) => {
    const second = c.includes('"a":"c1"');
    const info = { hasNextPage: !second, endCursor: 'c1' };
    if (c.includes('comments(')) return { data: { issue: { comments: { nodes: [comment(second ? 'k2' : 'k1')], pageInfo: info } } } };
    return { data: { issues: { nodes: [lIssue(second ? 'L2' : 'L1')], pageInfo: info } } };
  }, { LT: 'k' }).board;
  assert.deepEqual((await lin.list()).map((i) => i.id), ['L1', 'L2']);
  assert.deepEqual((await lin.comments('LIN-1')).map((c) => c.id).sort(), ['k1', 'k2']);
  // a page that does not advance is an error, not a partial list
  await assert.rejects(jiraBoard((c) => (c.includes('/search/jql') ? { issues: [jIssue('PROJ-1')], nextPageToken: 't1' } : undefined)).board.list(), /jira: list does not advance/);
  const stuck = mk('linear', linCfg, () => ({ data: { issues: { nodes: [{ id: 'x' }], pageInfo: { hasNextPage: true, endCursor: 'c1' } } } }), { LT: 'k' });
  await assert.rejects(stuck.board.list(), /linear: list does not advance/);
  // github: a Project at the 5000-item cap is refused
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `I${i}`, status: 'Ready', content: { number: i + 1, title: 't', url: 'u' } }));
  const answer = (n: number) => (c: string) => (c.includes('item-list') ? { items: items(n) } : ghAnswer('Ready')(c));
  const full = mk('github', gh, answer(5000)).board;
  await assert.rejects(full.list(), /archive/);
  await assert.rejects(full.get('1'), /archive/);
  assert.equal((await mk('github', gh, answer(4999)).board.list()).length, 4999);
});

test('github-issues get refuses a pull request or an issue with no status label: it is not on the board', async () => {
  const { board } = issuesRepo([iss(1, ['status:Ready']), iss(2, []), iss(3, ['status:Ready'], { pull_request: {} })]);
  assert.equal((await board.get('1')).status, 'Ready');
  await assert.rejects(board.get('2'), /not on the board/);
  await assert.rejects(board.get('3'), /not on the board/);
});

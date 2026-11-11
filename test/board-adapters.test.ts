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

test('github move refuses when status differs, and writes nothing', async () => {
  const { board, calls } = mk('github', gh, ghAnswer('Backlog'));
  await assert.rejects(board.move('7', 'In progress', 'Ready'), MovedError);
  assert.ok(!calls.some((c) => c.includes('item-edit')));
});

test('github move issues item-edit with resolved ids', async () => {
  const { board, calls } = mk('github', gh, ghAnswer('Ready'));
  await board.move('7', 'In progress', 'Ready');
  assert.ok(calls.includes('gh project item-edit --project-id P1 --id I7 --field-id F1 --single-select-option-id O2'));
});

test('github board passes GH_TOKEN from token_env to every gh call, and fails naming the var when unset', async () => {
  const f = fakeCtx('.', { ...gh, token_env: 'BT' }, ghAnswer('Ready'), { BT: 'pat' });
  f.ctx.binding = { ...binding, board: { ...binding.board, adapter: 'github' } } as any;
  const tokens: (string | undefined)[] = [];
  const exec = f.ctx.exec;
  f.ctx.exec = (c, a, o) => { tokens.push(o?.env?.GH_TOKEN); return exec(c, a, o); };
  await createBoard(f.ctx).move('7', 'In progress');
  assert.ok(tokens.length > 0 && tokens.every((t) => t === 'pat'));
  const { board } = mk('github', { ...gh, token_env: 'BT' }, ghAnswer('Ready'));
  await assert.rejects(board.move('7', 'In progress'), /BT/);
});

// jira
const jira = { base_url: 'https://x.atlassian.net', project_key: 'PROJ', email_env: 'JE', token_env: 'JT' };
const jiraAnswer = (status: string) => (c: string) => {
  if (c.includes('/transitions') && c.startsWith('GET')) return { transitions: [{ id: '31', to: { name: 'In progress' } }] };
  if (c.includes('/field')) return [{ id: 'cf1', name: 'Size' }, { id: 'cf2', name: 'Priority' }];
  if (c.includes('/issue/PROJ-1')) return { key: 'PROJ-1', fields: { summary: 's', status: { name: status }, labels: [], subtasks: [] } };
  return {};
};

test('jira move refuses when status differs', async () => {
  const { board, calls } = mk('jira', jira, jiraAnswer('Backlog'), { JE: 'a@b', JT: 'secret' });
  await assert.rejects(board.move('PROJ-1', 'In progress', 'Ready'), MovedError);
  assert.ok(!calls.some((c) => c.startsWith('POST') && c.includes('/transitions')));
});

test('jira move posts the matching transition', async () => {
  const { board, calls } = mk('jira', jira, jiraAnswer('Ready'), { JE: 'a@b', JT: 'secret' });
  await board.move('PROJ-1', 'In progress', 'Ready');
  assert.ok(calls.some((c) => c.startsWith('POST') && c.includes('/issue/PROJ-1/transitions') && c.includes('{"transition":{"id":"31"}}')));
});

test('jira without credentials names the env vars', async () => {
  const { board } = mk('jira', jira, jiraAnswer('Ready'));
  await assert.rejects(board.get('PROJ-1'), /JE and JT/);
});

// linear
const linearAnswer = (status: string) => (c: string) => {
  const issue = { id: 'U1', identifier: 'LIN-9', title: 't', url: 'u', createdAt: '', updatedAt: '', priority: 0, state: { name: status }, labels: { nodes: [] }, parent: null, children: { nodes: [] } };
  if (c.includes('teams(')) return { data: { teams: { nodes: [{ id: 'T1', states: { nodes: [{ id: 'S2', name: 'In progress' }] }, labels: { nodes: [] } }] } } };
  if (c.includes('issueUpdate')) return { data: { issueUpdate: { issue } } };
  return { data: { issue } };
};

test('linear move refuses when state differs', async () => {
  const { board, calls } = mk('linear', { team_key: 'LIN', token_env: 'LT' }, linearAnswer('Backlog'), { LT: 'k' });
  await assert.rejects(board.move('LIN-9', 'In progress', 'Ready'), MovedError);
  assert.ok(!calls.some((c) => c.includes('issueUpdate')));
});

test('linear move sends the state id', async () => {
  const { board, calls } = mk('linear', { team_key: 'LIN', token_env: 'LT' }, linearAnswer('Ready'), { LT: 'k' });
  await board.move('LIN-9', 'In progress', 'Ready');
  assert.ok(calls.some((c) => c.includes('issueUpdate') && c.includes('"stateId":"S2"')));
});

// paging
const jIssue = (k: string) => ({ key: k, fields: { summary: k, status: { name: 'Ready' }, labels: [], subtasks: [] } });
test('jira list follows nextPageToken until isLast', async () => {
  const { board, calls } = mk('jira', jira, (c) => {
    if (c.includes('/field')) return [{ id: 'cf1', name: 'Size' }, { id: 'cf2', name: 'Priority' }];
    if (c.includes('"nextPageToken":"t2"')) return { issues: [jIssue('PROJ-2')], isLast: true };
    if (c.includes('/search/jql')) return { issues: [jIssue('PROJ-1')], nextPageToken: 't2' };
  }, { JE: 'a@b', JT: 's' });
  assert.deepEqual((await board.list()).map((i) => i.id), ['PROJ-1', 'PROJ-2']);
  assert.equal(calls.filter((c) => c.includes('/search/jql')).length, 2);
});

test('jira comments pages through the total, so a marker on page 2 is found', async () => {
  const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({
    id: String(from + i), created: '', body: { type: 'doc', content: [{ type: 'text', text: from + i === 120 ? 'marker-x' : 'hi' }] },
  }));
  const answer = (c: string) => (c.includes('startAt=100') ? { total: 150, comments: page(100, 50) } : { total: 150, comments: page(0, 100) });
  const { board } = mk('jira', jira, answer, { JE: 'a@b', JT: 's' });
  assert.equal((await board.comments('PROJ-1')).length, 150);
  assert.deepEqual((await board.comments('PROJ-1', { marker: 'marker-x' })).map((c) => c.id), ['120']);
});

test('linear list and comments follow endCursor', async () => {
  const issue = (id: string) => ({ id, identifier: id, title: 't', url: 'u', createdAt: '', updatedAt: '', priority: 0, state: { name: 'Ready' }, labels: { nodes: [] }, parent: null, children: { nodes: [] } });
  const comment = (id: string) => ({ id, body: 'b', createdAt: id, url: 'u', user: null });
  const answer = (c: string) => {
    const second = c.includes('"a":"c1"');
    const info = { hasNextPage: !second, endCursor: 'c1' };
    if (c.includes('comments(')) return { data: { issue: { comments: { nodes: [comment(second ? 'k2' : 'k1')], pageInfo: info } } } };
    return { data: { issues: { nodes: [issue(second ? 'L2' : 'L1')], pageInfo: info } } };
  };
  const { board } = mk('linear', { team_key: 'LIN', token_env: 'LT' }, answer, { LT: 'k' });
  assert.deepEqual((await board.list()).map((i) => i.id), ['L1', 'L2']);
  assert.deepEqual((await board.comments('LIN-1')).map((c) => c.id).sort(), ['k1', 'k2']);
});

test('github refuses a board read at the 1000-item cap', async () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `I${i}`, status: 'Ready', content: { number: i + 1, title: 't', url: 'u' } }));
  const answer = (n: number) => (c: string) => (c.includes('item-list') ? { items: items(n) } : ghAnswer('Ready')(c));
  const full = mk('github', gh, answer(1000)).board;
  await assert.rejects(full.list(), /archive/);
  await assert.rejects(full.get('1'), /archive/);
  assert.equal((await mk('github', gh, answer(999)).board.list()).length, 999);
});

test('jira list throws on a repeated token; linear list throws on an unchanged cursor', async () => {
  const { board } = mk('jira', jira, (c) => {
    if (c.includes('/field')) return [{ id: 'cf1', name: 'Size' }, { id: 'cf2', name: 'Priority' }];
    if (c.includes('/search/jql')) return { issues: [jIssue('PROJ-1')], nextPageToken: 't1' };
  }, { JE: 'a@b', JT: 's' });
  await assert.rejects(board.list(), /jira: list does not advance/);
  const lin = mk('linear', { team_key: 'LIN', token_env: 'LT' }, () => ({ data: { issues: { nodes: [{ id: 'x' }], pageInfo: { hasNextPage: true, endCursor: 'c1' } } } }), { LT: 'k' });
  await assert.rejects(lin.board.list(), /linear: list does not advance/);
});

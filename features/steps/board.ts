// The local board (.agents/board.json), driven through the CLI: tickets are numbered 1, 2, ... in the order given.
// State on w.state: tickets (the number of tickets created by a Given).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import type { World } from '../support/world.ts';
import { createBoard } from '../../src/board/index.ts';
import { MovedError } from '../../src/ports.ts';
import type { AdapterContext, Board, Item, LogicalField } from '../../src/ports.ts';

const run = (w: World, line: string) => {
  const o = w.cliLine(line);
  assert.equal(o.code, 0, `setup failed: ${line}\n${o.stderr}`);
  return o;
};

Given('the board has these tickets:', (w, t: DataTable) => {
  for (const [i, r] of t.hashes().entries()) {
    const body = `.body-${i}.md`;
    w.write(body, r.body ?? '');
    const flags = [`--title`, `'${r.title}'`, '--status', `'${r.status}'`, '--body-file', body];
    if (r.parent) flags.push('--parent', r.parent);
    if (r.milestone) flags.push('--milestone', r.milestone);
    for (const l of (r.labels ?? '').split(',').map((x) => x.trim()).filter(Boolean)) flags.push('--label', `'${l}'`);
    run(w, `board create ${flags.join(' ')}`);
  }
});

Given('the comments on ticket {string} are:', (w, id: string, t: DataTable) => {
  const rows = t.hashes();
  rows.forEach((r, i) => { w.write(`.comment-${i}.md`, r.body); run(w, `board comment ${id} --body-file .comment-${i}.md`); });
  // The local board writes every comment as "local": a fixture sets who wrote each one.
  const file = w.path('.agents', 'board.json');
  const db = JSON.parse(readFileSync(file, 'utf8'));
  rows.forEach((r, i) => { db.comments[id][i].author = r.author; });
  writeFileSync(file, JSON.stringify(db));
});

Given('the board lists the statuses {string}', (w, list: string) => w.binding({ board: { statuses: list.split(',').map((s) => s.trim()) } }));
Given('the board is scoped to the label {string}', (w, label: string) => w.binding({ board: { scope: { label } } }));
Given('the board is scoped to the label {string} as the home of {string}', (w, label: string, repos: string) =>
  w.binding({ board: { scope: { label, home: true, repos: repos.split(',').map((s) => s.trim()) } } }));

/** The value at a dotted path of the CLI's JSON output, as text (a list is joined with ", "). */
const at = (w: World, path: string): string | undefined => {
  let v: any = w.last.json(); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const k of path.split('.')) v = v?.[k];
  return v === undefined ? undefined : Array.isArray(v) ? v.join(', ') : String(v);
};
Then('the result {string} is {string}', (w, path: string, value: string) => assert.equal(at(w, path), value));
Then('the result has no {string}', (w, path: string) => assert.equal(at(w, path), undefined));
Then('the {string} of the result entries are {string}', (w, key: string, values: string) =>
  assert.equal(w.last.json().map((e: Record<string, unknown>) => e[key]).join(', '), values));

// ---- the vendor adapters (github Projects, github-issues, jira, linear), run in-process against a fake exec and http ----
// State on w.state, besides tickets: adapter (its name), options, board (made on first use), result and error of the last
// verb, status (the status the fake ticket has), assignee, ghItems, issues/labels/milestones (the github-issues repo),
// jira/linear (the pages a fake answers), failure (gh failures to inject), rest (the github-issues calls with their JSON input).

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Rest = { args: string[]; input?: Any };

const DEFAULTS: Record<string, { options: Record<string, unknown>; env: Record<string, string> }> = {
  github: { options: { owner: 'o', project_number: 1, repo: 'o/r', token_env: 'BT' }, env: { BT: 'pat' } },
  'github-issues': { options: { repo: 'o/r' }, env: {} },
  jira: { options: { base_url: 'https://x.atlassian.net', project_key: 'PROJ', email_env: 'JE', token_env: 'JT' }, env: { JE: 'a@b', JT: 'secret' } },
  linear: { options: { team_key: 'LIN', token_env: 'LT' }, env: { LT: 'k' } },
};
const TICKET: Record<string, string> = { github: '7', 'github-issues': '7', jira: 'PROJ-1', linear: 'LIN-9' };

// github Projects: `gh project ...` and `gh issue view`
const ghAnswer = (w: World) => (c: string): unknown => {
  const s = w.state;
  if (c.includes('project view')) return { id: 'P1' };
  if (c.includes('field-list')) return { fields: [{ id: 'F1', name: 'Status', options: [{ id: 'O1', name: 'Ready' }, { id: 'O2', name: 'In progress' }] }] };
  if (c.includes('item-add')) return { id: 'I7' };
  if (c.includes('item-list')) return { items: s.ghItems ?? [{ id: 'I7', status: s.status ?? 'Ready', content: { number: 7, title: 't', url: 'u' } }] };
  if (c.includes('issue view')) return { body: '', createdAt: '', updatedAt: '', assignees: s.assignee ? [{ login: s.assignee }] : [], labels: [] };
  return [];
};

// jira: REST over http
const jIssue = (k: string) => ({ key: k, fields: { summary: k, status: { name: 'Ready' }, labels: [], subtasks: [] } });
const jiraAnswer = (w: World) => (c: string): unknown => {
  const s = w.state;
  if (c.includes('/transitions') && c.startsWith('GET')) return { transitions: [{ id: '31', to: { name: 'In progress' } }] };
  if (c.includes('/field')) return [{ id: 'cf1', name: 'Size' }, { id: 'cf2', name: 'Priority' }];
  if (c.includes('/search/jql')) {
    if (s.jiraPages === 'two') return c.includes('"nextPageToken":"t2"') ? { issues: [jIssue(s.jiraLast)], isLast: true } : { issues: [jIssue(s.jiraFirst)], nextPageToken: 't2' };
    if (s.jiraPages === 'stuck') return { issues: [jIssue('PROJ-1')], nextPageToken: 't1' };
    return { issues: [], isLast: true };
  }
  if (s.jiraComments && c.includes('/comment')) {
    const { total, marker, text } = s.jiraComments;
    const [from, n] = c.includes('startAt=100') ? [100, total - 100] : [0, Math.min(total, 100)];
    return { total, comments: Array.from({ length: n }, (_, i) => ({ id: String(from + i), created: '', body: { type: 'doc', content: [{ type: 'text', text: from + i === marker ? text : 'hi' }] } })) };
  }
  if (c.includes('/issue/PROJ-1')) return { key: 'PROJ-1', fields: { summary: 's', status: { name: s.status ?? 'Ready' }, labels: [], subtasks: [] } };
  return {};
};

// linear: GraphQL over http
const lIssue = (id: string, status: string, labels: Any[] = []) => ({ id, identifier: id, title: 't', url: 'u', createdAt: '', updatedAt: '', priority: 0, state: { name: status }, labels: { nodes: labels }, parent: null, children: { nodes: [] } });
const linearAnswer = (w: World) => (c: string): unknown => {
  const s = w.state;
  const issue = { ...lIssue('LIN-9', s.status ?? 'Ready', s.linearLabels), id: 'U1' };
  if (c.includes('teams(')) return { data: { teams: { nodes: [{ id: 'T1', states: { nodes: [{ id: 'S1', name: 'Ready' }, { id: 'S2', name: 'In progress' }] }, labels: { nodes: [] } }] } } };
  if (c.includes('issueLabelCreate')) return { data: { issueLabelCreate: { issueLabel: { id: 'L1', name: 'milestone:Q3' } } } };
  if (c.includes('issueUpdate')) return { data: { issueUpdate: { issue } } };
  if (s.linearPages) {
    const second = c.includes('"a":"c1"');
    const info = { hasNextPage: !second, endCursor: 'c1' };
    if (c.includes('comments(')) return { data: { issue: { comments: { nodes: [{ id: second ? 'k2' : 'k1', body: 'b', createdAt: second ? 'k2' : 'k1', url: 'u', user: null }], pageInfo: info } } } };
    if (c.includes('issues(')) return { data: { issues: { nodes: [lIssue(second ? 'L2' : 'L1', 'Ready')], pageInfo: info } } };
  }
  if (s.linearStuck) return { data: { issues: { nodes: [{ id: 'x' }], pageInfo: { hasNextPage: true, endCursor: 'c1' } } } };
  return { data: { issue } };
};

// github-issues: a fake REST repo behind `gh api -X <method> <url>`; every call is kept with its JSON input
const iss = (number: number, labels: string[], extra: Record<string, unknown> = {}) =>
  ({ number, id: number * 10, title: `t${number}`, body: '', html_url: `u${number}`, labels: labels.map((name) => ({ name })), assignees: [], ...extra });
const names = (ls: string[]) => ls.map((name) => ({ name }));
const issuesExec = (w: World) => (cmd: string, args: string[], o?: { input?: string }): string => {
  const s = w.state;
  const input = o?.input ? JSON.parse(o.input) : undefined;
  (s.rest ??= [] as Rest[]).push({ args: [cmd, ...args], input });
  w.calls.push([cmd, ...args].join(' '));
  if (s.failure && s.failure.done < s.failure.times) { s.failure.done++; throw new Error(s.failure.message); }
  const [method, url] = [args[2], args[3]];
  const [path, qs] = url.replace('repos/o/r/', '').split('?');
  const page = Number(new URLSearchParams(qs).get('page') ?? 1);
  const pageOf = (xs: Any[]) => JSON.stringify(xs.slice((page - 1) * 100, page * 100));
  const issues: Any[] = (s.issues ??= []);
  const labels: string[] = (s.repoLabels ??= []);
  const it = issues.find((i) => i.number === Number(path.split('/')[1]));
  if (path === 'issues' && method === 'GET') return pageOf(issues);
  if (path === 'issues') { const i = { number: 100 + issues.length, id: 9000, ...input, labels: names(input.labels) }; issues.push(i); return JSON.stringify(i); }
  if (path === 'labels') { if (method === 'POST') labels.push(input.name); return method === 'GET' ? pageOf(names(labels)) : '{}'; }
  if (path === 'milestones') return pageOf(s.milestones ?? []);
  if (/^issues\/\d+$/.test(path)) {
    if (method === 'PATCH') Object.assign(it, input, input.labels ? { labels: names(input.labels) } : {});
    return JSON.stringify(it);
  }
  if (path.endsWith('/comments')) return method === 'POST' ? JSON.stringify({ id: 5, html_url: 'c5' }) : pageOf(it.comments ?? []);
  if (path.endsWith('/sub_issues')) return '[]';
  if (path.endsWith('/parent')) throw new Error('404');
  return '{}';
};

const boardOf = (w: World): Board => {
  const s = w.state;
  if (s.board) return s.board;
  const name: string = s.adapter;
  w.binding({ board: { adapter: name, fields: name === 'github-issues' ? { size: 'Size', release_version: 'Release Version' } : undefined } });
  const ctx: AdapterContext = w.adapterContext(s.options);
  if (name === 'github-issues') ctx.exec = issuesExec(w) as AdapterContext['exec'];
  else {
    const answer = { github: ghAnswer, jira: jiraAnswer, linear: linearAnswer }[name as 'github' | 'jira' | 'linear'](w);
    ctx.exec = (cmd, args, o) => {
      const c = [cmd, ...args].join(' ');
      w.calls.push(c);
      (s.tokens ??= []).push(o?.env?.GH_TOKEN);
      const r = answer(c);
      return typeof r === 'string' ? r : JSON.stringify(r ?? {});
    };
    ctx.http = (async (method: string, url: string, o?: { body?: unknown }) => { const c = `${method} ${url} ${o?.body ? JSON.stringify(o.body) : ''}`; w.calls.push(c); return answer(c) ?? {}; }) as AdapterContext['http'];
  }
  ctx.env = w.env;
  return (s.board = createBoard(ctx));
};

/** Runs one board verb; its result or its error is what the next Then reads. */
const attempt = async (w: World, fn: (b: Board) => Promise<unknown>) => {
  w.state.result = undefined; w.state.error = undefined;
  try { w.state.result = await fn(boardOf(w)); } catch (e) { w.state.error = e; }
};
const failed = (w: World): Error => { assert.ok(w.state.error, 'the verb did not fail'); return w.state.error as Error; };
const csv = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

// ---- Given: the adapter and its tickets ----
Given('the {word} board adapter', (w, name: string) => {
  const d = DEFAULTS[name];
  assert.ok(d, `no adapter ${name}`);
  w.state.adapter = name;
  w.state.options = { ...d.options };
  Object.assign(w.env, d.env);
});
Given('the board adapter has no option {string}', (w, key: string) => { delete w.state.options[key]; });
Given('the credential variables of the board are not set', (w) => { for (const k of Object.keys(DEFAULTS[w.state.adapter].env)) delete w.env[k]; });
Given('the ticket is at {string}', (w, status: string) => { w.state.status = status; });
Given('the ticket is assigned to {string}', (w, login: string) => { w.state.assignee = login; });
Given('the GitHub Project holds issue {int} of {string} and issue {int} of {string}', (w, a: number, repoA: string, b: number, repoB: string) => {
  w.state.ghItems = [{ id: 'A', status: 'Ready', content: { number: a, title: `of ${repoA}`, url: 'u', repository: repoA } }, { id: 'B', status: 'Done', content: { number: b, title: `of ${repoB}`, url: 'u', repository: repoB } }];
});
Given('the GitHub Project holds {int} items', (w, n: number) => {
  w.state.ghItems = Array.from({ length: n }, (_, i) => ({ id: `I${i}`, status: 'Ready', content: { number: i + 1, title: 't', url: 'u' } }));
});
Given('Jira lists the issues {string} and {string} on two pages', (w, a: string, b: string) => { w.state.jiraPages = 'two'; w.state.jiraFirst = a; w.state.jiraLast = b; });
Given('Jira answers every page with the same next page token', (w) => { w.state.jiraPages = 'stuck'; });
Given('Jira holds {int} comments and the comment {int} says {string}', (w, total: number, marker: number, text: string) => { w.state.jiraComments = { total, marker, text }; });
Given('Linear holds the issues L1 and L2 and the comments k1 and k2 on two pages each', (w) => { w.state.linearPages = true; });
Given('Linear answers every page with a next page and the same cursor', (w) => { w.state.linearStuck = true; });
Given('the Linear issue carries the workspace label {string} with the id {string}', (w, name: string, id: string) => { w.state.linearLabels = [{ id, name }]; });

Given('the repo has these issues:', (w, t: DataTable) => {
  (w.state.issues ??= []).push(...t.hashes().map((r) => iss(Number(r.number), csv(r.labels ?? ''), {
    ...(r['pull request'] ? { pull_request: {} } : {}),
    ...(r.state ? { state: r.state, closed_at: r['closed at'] } : {}),
    ...(r.assignee ? { assignees: [{ login: r.assignee }] } : {}),
  })));
});
Given('the repo has the issues {int} to {int} labelled {string}', (w, from: number, to: number, labels: string) => {
  for (let n = from; n <= to; n++) (w.state.issues ??= []).push(iss(n, csv(labels)));
});
Given('the repo has the labels {string}', (w, labels: string) => { (w.state.repoLabels ??= []).push(...csv(labels)); });
Given('the repo has the milestone {string} as number {int}', (w, title: string, number: number) => { (w.state.milestones ??= []).push({ number, title }); });
Given('the issue {int} has {int} comments saying {string}', (w, n: number, count: number, text: string) => {
  w.state.issues.find((i: Any) => i.number === n).comments = Array.from({ length: count }, (_, k) => ({ id: k, user: { login: 'bot' }, created_at: String(k), body: text, html_url: '' }));
});
Given('the comment {int} of the issue {int} says {string}', (w, k: number, n: number, text: string) => { w.state.issues.find((i: Any) => i.number === n).comments[k].body = text; });
Given('the issue {int} has the comment {string}', (w, n: number, body: string) => {
  w.state.issues.find((i: Any) => i.number === n).comments = [{ id: 1, user: { login: 'bot' }, created_at: '1', body, html_url: '' }];
});
Given('gh fails {int} times with {string} before it answers', (w, times: number, message: string) => {
  w.state.failure = { times, message, done: 0 };
  w.useFakeSleep();
});

// ---- When: one board verb ----
When('the factory gets the ticket {string}', (w, id: string) => attempt(w, (b) => b.get(id)));
When('the factory lists the tickets', (w) => attempt(w, (b) => b.list()));
When('the factory lists the tickets in the status {string}', (w, status: string) => attempt(w, (b) => b.list({ status: [status] })));
When('the factory searches the tickets for {string}', (w, text: string) => attempt(w, (b) => b.list({ search: text })));
When('the factory moves the ticket {string} to {string}', (w, id: string, status: string) => attempt(w, (b) => b.move(id, status)));
When('the factory moves the ticket {string} to {string} only from {string}', (w, id: string, status: string, from: string) => attempt(w, (b) => b.move(id, status, from)));
When('the factory reads the comments of the ticket {string}', (w, id: string) => attempt(w, (b) => b.comments(id)));
When('the factory reads the comments of the ticket {string} with the marker {string}', (w, id: string, marker: string) => attempt(w, (b) => b.comments(id, { marker })));
When('the factory comments {string} on the ticket {string}', (w, body: string, id: string) => attempt(w, (b) => b.comment(id, body)));
When('the factory assigns the ticket {string} to {string}', (w, id: string, login: string) => attempt(w, (b) => b.assign(id, login)));
When('the factory clears the assignee of the ticket {string}', (w, id: string) => attempt(w, (b) => b.assign(id, null)));
When('the factory sets the milestone of the ticket {string} to {string}', (w, id: string, name: string) => attempt(w, (b) => b.milestone(id, name)));
When('the factory clears the milestone of the ticket {string}', (w, id: string) => attempt(w, (b) => b.milestone(id, null)));
When('the factory sets the field {string} of the ticket {string} to {string}', (w, f: string, id: string, v: string) => attempt(w, (b) => b.set(id, f as LogicalField, v)));
When('the factory clears the field {string} of the ticket {string}', (w, f: string, id: string) => attempt(w, (b) => b.set(id, f as LogicalField, null)));
When('the factory adds the label {string} to the ticket {string}', (w, l: string, id: string) => attempt(w, (b) => b.label(id, 'add', l)));
When('the factory removes the label {string} from the ticket {string}', (w, l: string, id: string) => attempt(w, (b) => b.label(id, 'remove', l)));
When('the factory closes the ticket {string} as {string}', (w, id: string, reason: string) => attempt(w, (b) => b.close(id, reason as 'completed' | 'not_planned')));
When('the factory creates a ticket at {string} with the labels {string}, the milestone {string} and the parent {string}', (w, status: string, labels: string, milestone: string, parent: string) =>
  attempt(w, (b) => b.create({ title: 'n', body: 'b', status, labels: csv(labels), milestone, parent })));

// ---- Then: what the verb returned, what it called ----
const items = (w: World) => w.state.result as Item[];
Then('the verb fails matching {string}', (w, re: string) => assert.match(failed(w).message, new RegExp(re)));
Then('the move is refused because the ticket has moved', (w) => assert.ok(failed(w) instanceof MovedError, String(w.state.error)));
Then('no call reaches the board', (w) => assert.equal(w.calls.length, 0, w.calls.join('\n')));
Then('a call includes {string}', (w, text: string) => assert.ok(w.calls.some((c) => c.includes(text)), `no call includes ${text}:\n${w.calls.join('\n')}`));
Then('no call includes {string}', (w, text: string) => assert.ok(!w.calls.some((c) => c.includes(text)), `a call includes ${text}:\n${w.calls.join('\n')}`));
Then('every call passes the credential {string} as GH_TOKEN', (w, token: string) => {
  assert.ok(w.state.tokens.length > 0);
  assert.ok(w.state.tokens.every((t: string) => t === token), w.state.tokens.join(','));
});
Then('the listed ticket ids are {string}', (w, ids: string) => assert.equal(items(w).map((i) => i.id).join(', '), ids));
Then('the listed ticket titles are {string}', (w, titles: string) => assert.equal(items(w).map((i) => i.title).join(', '), titles));
Then('the board lists {int} tickets', (w, n: number) => assert.equal(items(w).length, n));
Then('the listed ticket {string} has the status {string}', (w, id: string, status: string) => assert.equal(items(w).find((i) => i.id === id)?.status, status));
Then('the listed ticket {string} has the fields {string}', (w, id: string, fields: string) =>
  assert.equal(Object.entries(items(w).find((i) => i.id === id)!.fields).map(([k, v]) => `${k}=${v}`).join(', '), fields));
Then('the listed ticket {string} has the labels {string}', (w, id: string, labels: string) => assert.equal(items(w).find((i) => i.id === id)!.labels.join(', '), labels));
Then('the listed ticket {string} reached its status at {string}', (w, id: string, at: string) => assert.equal(items(w).find((i) => i.id === id)?.statusChangedAt ?? '', at));
Then('the comment ids are {string}', (w, ids: string) => assert.equal((w.state.result as { id: string }[]).map((c) => c.id).sort().join(', '), ids));
Then('the first comment is {string}', (w, id: string) => assert.equal((w.state.result as { id: string }[])[0].id, id));
Then('the board returns {int} comments', (w, n: number) => assert.equal((w.state.result as unknown[]).length, n));
Then('the returned ticket has the status {string}', (w, status: string) => assert.equal((w.state.result as Item).status, status));
Then('the returned ticket has the fields {string}', (w, fields: string) => assert.equal(Object.entries((w.state.result as Item).fields).map(([k, v]) => `${k}=${v}`).join(', '), fields));
Then('the returned ticket has the labels {string}', (w, labels: string) => assert.equal((w.state.result as Item).labels.join(', '), labels));
Then('the returned comment id is {string}', (w, id: string) => assert.equal((w.state.result as { id: string }).id, id));
Then('the search was called {int} times', (w, n: number) => assert.equal(w.calls.filter((c) => c.includes('/search/jql')).length, n));
Then('the JQL searches for the text {string} with the backslash and the quote escaped', (w, text: string) => {
  const call = w.calls.find((c) => c.includes('/search/jql'))!;
  assert.ok(JSON.parse(call.slice(call.indexOf('{'))).jql.includes(`text ~ "${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`));
});
Then('the Linear update keeps the label ids {string}', (w, ids: string) => {
  const upd = JSON.parse(w.calls.find((c) => c.includes('labelIds'))!.replace(/^POST \S+ /, ''));
  assert.equal(upd.variables.i.labelIds.join(', '), ids);
});
Then('the Linear queries read up to 250 labels, states and children', (w) => {
  const q = w.calls.join('\n');
  for (const part of ['states(first:250)', 'labels(first:250)', 'children(first:250)']) assert.ok(q.includes(part), `no query reads ${part}`);
});

// github-issues: the REST calls and the repo they left
const rest = (w: World): Rest[] => w.state.rest ?? [];
const issueOf = (w: World, n: number): Any => w.state.issues.find((i: Any) => i.number === n);
Then('every call is a gh api call under the repo, never GraphQL, gh issue or gh project', (w) => {
  assert.ok(rest(w).length > 0);
  for (const { args } of rest(w)) {
    assert.deepEqual(args.slice(0, 3), ['gh', 'api', '-X'], args.join(' '));
    assert.ok(args[4].startsWith('repos/o/r/'), args.join(' '));
    assert.ok(!args.some((a) => /graphql|^issue$|^project$/.test(a)), args.join(' '));
  }
});
Then('the list is read in pages of 100 up to page 2', (w) => assert.ok(rest(w).some((c) => c.args[4].includes('per_page=100&page=2'))));
Then('no call writes to the issues', (w) => assert.ok(!rest(w).some((c) => c.args[3] === 'PATCH')));
Then('the issue {int} has the labels {string}', (w, n: number, labels: string) => assert.equal(issueOf(w, n).labels.map((l: Any) => l.name).join(', '), labels));
Then('the repo has the labels exactly {string}', (w, labels: string) => assert.equal(w.state.repoLabels.join(', '), labels));
Then('the new issue is opened with the milestone number {int}', (w, n: number) => assert.equal(rest(w).find((c) => c.args[4] === 'repos/o/r/issues' && c.args[3] === 'POST')!.input.milestone, n));
Then('the new issue is linked as a sub issue of the issue {int}', (w, n: number) => assert.ok(rest(w).some((c) => c.args[4] === `repos/o/r/issues/${n}/sub_issues` && c.input?.sub_issue_id === 9000)));
Then('the issue {int} is closed with the reason {string}', (w, n: number, reason: string) => { assert.equal(issueOf(w, n).state, 'closed'); assert.equal(issueOf(w, n).state_reason, reason); });
Then('the last patch sets the milestone to {int}', (w, n: number) => assert.equal(rest(w).filter((c) => c.args[3] === 'PATCH').at(-1)!.input.milestone, n));
Then('the last patch clears the milestone', (w) => assert.equal(rest(w).filter((c) => c.args[3] === 'PATCH').at(-1)!.input.milestone, null));
Then('the one patch sets the assignees to {string}', (w, logins: string) => {
  assert.equal(rest(w).find((c) => c.args[3] === 'PATCH')!.input.assignees.join(', '), logins);
  assert.ok(!rest(w).some((c) => c.args[4]?.endsWith('/assignees')));
});
Then('the repo holds {int} issues', (w, n: number) => assert.equal(w.state.issues.length, n));

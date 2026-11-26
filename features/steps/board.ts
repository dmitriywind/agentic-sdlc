// The local board (.agents/board.json), driven through the CLI: tickets are numbered 1, 2, ... in the order given.
// State on w.state: tickets (the number of tickets created by a Given).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import type { World } from '../support/world.ts';
import { createBoard } from '../../src/board/index.ts';
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
Then('the result {string} contains {string}', (w, path: string, text: string) => assert.ok(String(at(w, path)).includes(text), String(at(w, path))));
Then('the result has no {string}', (w, path: string) => assert.equal(at(w, path), undefined));
Then('the {string} of the result entries are {string}', (w, key: string, values: string) =>
  assert.equal(w.last.json().map((e: Record<string, unknown>) => e[key]).join(', '), values));

// ---- the github-issues adapter, run in-process against a fake exec ----
// State on w.state, besides tickets: adapter (its name), options, board (made on first use), result and error of the last
// verb, issues/labels/milestones (the github-issues repo), failure (gh failures to inject), rest (the calls with their JSON input).

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Rest = { args: string[]; input?: Any };

const DEFAULTS: Record<string, { options: Record<string, unknown>; env: Record<string, string> }> = {
  'github-issues': { options: { repo: 'o/r' }, env: {} },
};

// github-issues: a fake REST repo behind `gh api -X <method> <url>`; every call is kept with its JSON input
const iss = (number: number, labels: string[], extra: Record<string, unknown> = {}) =>
  ({ number, id: number * 10, title: `t${number}`, body: '', html_url: `u${number}`, labels: labels.map((name) => ({ name })), assignees: [], ...extra });
const names = (ls: string[]) => ls.map((name) => ({ name }));
/** An issue field value as GitHub returns it: a single select carries its option, a text field its value. */
const fieldValue = (w: World, id: number, value: string) => {
  const type = (w.state.fieldTypes ?? {})[id] ?? 'text';
  return type === 'single_select'
    ? { issue_field_id: id, data_type: type, value: 1, single_select_option: { id: 1, name: value } }
    : { issue_field_id: id, data_type: type, value };
};
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
  const fv = path.split('/');
  if (fv[0] === 'issues' && fv[2] === 'issue-field-values') {
    const t: Any = issues.find((i) => i.number === Number(fv[1]));
    t.issue_field_values ??= [];
    const drop = (id: number) => { t.issue_field_values = t.issue_field_values.filter((v: Any) => v.issue_field_id !== id); };
    if (method === 'DELETE') drop(Number(fv[3]));
    for (const v of input?.issue_field_values ?? []) { drop(v.field_id); t.issue_field_values.push(fieldValue(w, v.field_id, v.value)); }
    return method === 'DELETE' ? '' : JSON.stringify(t.issue_field_values);
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
  w.binding({ board: { adapter: name, fields: { size: 'Size', release_version: 'Release Version' } } });
  const ctx: AdapterContext = w.adapterContext(s.options);
  ctx.exec = issuesExec(w) as AdapterContext['exec'];
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

Given('the repo has these issues:', (w, t: DataTable) => {
  (w.state.issues ??= []).push(...t.hashes().map((r) => iss(Number(r.number), csv(r.labels ?? ''), {
    ...(r['pull request'] ? { pull_request: {} } : {}),
    ...(r.state ? { state: r.state, closed_at: r['closed at'] } : {}),
    ...(r['issue fields'] ? { issue_field_values: csv(r['issue fields']).map((kv) => { const [k, v] = kv.split('='); return fieldValue(w, w.state.options.field_ids[k], v); }) } : {}),
    ...(r.assignee ? { assignees: [{ login: r.assignee }] } : {}),
  })));
});
Given('the board maps the issue fields {string}', (w, map: string) => {
  w.state.options.field_ids = {};
  w.state.fieldTypes = {};
  for (const kv of csv(map)) {
    const [k, rest] = kv.split('='), [id, type] = rest.split(':');
    w.state.options.field_ids[k] = Number(id);
    w.state.fieldTypes[Number(id)] = type;
  }
});
Given('the repo has the labels {string}', (w, labels: string) => { (w.state.repoLabels ??= []).push(...csv(labels)); });
Given('the repo has the milestone {string} as number {int}', (w, title: string, number: number) => { (w.state.milestones ??= []).push({ number, title }); });
Given('the issue {int} has {int} comments saying {string}', (w, n: number, count: number, text: string) => {
  w.state.issues.find((i: Any) => i.number === n).comments = Array.from({ length: count }, (_, k) => ({ id: k, user: { login: 'bot' }, created_at: String(k), body: text, html_url: '' }));
});
Given('the comment {int} of the issue {int} says {string}', (w, k: number, n: number, text: string) => { w.state.issues.find((i: Any) => i.number === n).comments[k].body = text; });
Given('gh fails {int} times with {string} before it answers', (w, times: number, message: string) => {
  w.state.failure = { times, message, done: 0 };
  w.useFakeSleep();
});

// ---- When: one board verb ----
When('the factory gets the ticket {string}', (w, id: string) => attempt(w, (b) => b.get(id)));
When('the factory lists the tickets in the status {string}', (w, status: string) => attempt(w, (b) => b.list({ status: [status] })));
When('the factory moves the ticket {string} to {string} only from {string}', (w, id: string, status: string, from: string) => attempt(w, (b) => b.move(id, status, from)));
When('the factory reads the comments of the ticket {string} with the marker {string}', (w, id: string, marker: string) => attempt(w, (b) => b.comments(id, { marker })));
When('the factory assigns the ticket {string} to {string}', (w, id: string, login: string) => attempt(w, (b) => b.assign(id, login)));
When('the factory sets the milestone of the ticket {string} to {string}', (w, id: string, name: string) => attempt(w, (b) => b.milestone(id, name)));
When('the factory sets the field {string} of the ticket {string} to {string}', (w, f: string, id: string, v: string) => attempt(w, (b) => b.set(id, f as LogicalField, v)));
When('the factory clears the field {string} of the ticket {string}', (w, f: string, id: string) => attempt(w, (b) => b.set(id, f as LogicalField, null)));
When('the factory closes the ticket {string} as {string}', (w, id: string, reason: string) => attempt(w, (b) => b.close(id, reason as 'completed' | 'not_planned')));
When('the factory creates a ticket at {string} with the labels {string}, the milestone {string} and the parent {string}', (w, status: string, labels: string, milestone: string, parent: string) =>
  attempt(w, (b) => b.create({ title: 'n', body: 'b', status, labels: csv(labels), milestone, parent })));

// ---- Then: what the verb returned, what it called ----
const items = (w: World) => w.state.result as Item[];
Then('the verb fails matching {string}', (w, re: string) => assert.match(failed(w).message, new RegExp(re)));
Then('no call reaches the board', (w) => assert.equal(w.calls.length, 0, w.calls.join('\n')));
Then('a call includes {string}', (w, text: string) => assert.ok(w.calls.some((c) => c.includes(text)), `no call includes ${text}:\n${w.calls.join('\n')}`));
Then('no call includes {string}', (w, text: string) => assert.ok(!w.calls.some((c) => c.includes(text)), `a call includes ${text}:\n${w.calls.join('\n')}`));
Then('the listed ticket ids are {string}', (w, ids: string) => assert.equal(items(w).map((i) => i.id).join(', '), ids));
Then('the listed ticket {string} has the status {string}', (w, id: string, status: string) => assert.equal(items(w).find((i) => i.id === id)?.status, status));
Then('the listed ticket {string} has the fields {string}', (w, id: string, fields: string) =>
  assert.equal(Object.entries(items(w).find((i) => i.id === id)!.fields).map(([k, v]) => `${k}=${v}`).join(', '), fields));
Then('the listed ticket {string} has the labels {string}', (w, id: string, labels: string) => assert.equal(items(w).find((i) => i.id === id)!.labels.join(', '), labels));
Then('the comment ids are {string}', (w, ids: string) => assert.equal((w.state.result as { id: string }[]).map((c) => c.id).sort().join(', '), ids));
Then('the returned ticket has the status {string}', (w, status: string) => assert.equal((w.state.result as Item).status, status));
Then('the returned ticket has the fields {string}', (w, fields: string) => assert.equal(Object.entries((w.state.result as Item).fields).map(([k, v]) => `${k}=${v}`).join(', '), fields));

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
Then('the issue {int} has the labels {string}', (w, n: number, labels: string) => assert.equal(issueOf(w, n).labels.map((l: Any) => l.name).join(', '), labels));
Then('the issue {int} has the issue field {string} set to {string}', (w, n: number, key: string, value: string) => {
  const v = issueOf(w, n).issue_field_values.find((x: Any) => x.issue_field_id === w.state.options.field_ids[key]);
  assert.equal(String(v?.single_select_option?.name ?? v?.value), value);
});
Then('the issue {int} has no value for the issue field {string}', (w, n: number, key: string) =>
  assert.ok(!(issueOf(w, n).issue_field_values ?? []).some((x: Any) => x.issue_field_id === w.state.options.field_ids[key])));
Then('every issue field call sends the API version header {string}', (w, version: string) => {
  const calls = rest(w).filter((c) => c.args[4].includes('issue-field-values'));
  assert.ok(calls.length > 0);
  for (const c of calls) assert.deepEqual(c.args.slice(5, 7), ['-H', `X-GitHub-Api-Version: ${version}`]);
});
Then('the repo has the labels exactly {string}', (w, labels: string) => assert.equal(w.state.repoLabels.join(', '), labels));
Then('the issue {int} is closed with the reason {string}', (w, n: number, reason: string) => { assert.equal(issueOf(w, n).state, 'closed'); assert.equal(issueOf(w, n).state_reason, reason); });
Then('the last patch sets the milestone to {int}', (w, n: number) => assert.equal(rest(w).filter((c) => c.args[3] === 'PATCH').at(-1)!.input.milestone, n));
Then('the one patch sets the assignees to {string}', (w, logins: string) => {
  assert.equal(rest(w).find((c) => c.args[3] === 'PATCH')!.input.assignees.join(', '), logins);
  assert.ok(!rest(w).some((c) => c.args[4]?.endsWith('/assignees')));
});

// ---- holds: comments written by a given author at a given time, read straight from the local board ----
const boardDb = (w: World) => JSON.parse(readFileSync(w.path('.agents', 'board.json'), 'utf8'));
const setWriter = (w: World, id: string, i: number, author: string, at: string) => {
  const db = boardDb(w);
  db.comments[id][i].author = author;
  db.comments[id][i].createdAt = at;
  writeFileSync(w.path('.agents', 'board.json'), JSON.stringify(db));
};
Given('the ticket {string} gets the comment {string} written by {string} at {string}', (w, id: string, body: string, author: string, at: string) => {
  w.write('.comment.md', body);
  run(w, `board comment ${id} --body-file .comment.md`);
  setWriter(w, id, boardDb(w).comments[id].length - 1, author, at);
});
Given('the comment {int} of the ticket {string} was written by {string} at {string}', (w, i: number, id: string, author: string, at: string) => setWriter(w, id, i, author, at));
Then('the comment {int} of the ticket {string} reads:', (w, i: number, id: string, doc: string) => assert.equal(boardDb(w).comments[id][i].body.trimEnd(), doc.trimEnd()));
Then('the ticket {string} carries the labels {string}', (w, id: string, labels: string) =>
  assert.equal(boardDb(w).items.find((t: Item) => t.id === id).labels.join(', '), labels));

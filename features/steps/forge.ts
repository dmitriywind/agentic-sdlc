// The forge: the github adapter run in-process against a fake `gh` (a small model of a repo: pull requests, check runs,
// statuses, comments, reviews), the forge CLI run in-process on it, and the flow verbs (next action, queue, land, report)
// run against a fake forge port.
// State on w.state: fg (the fake repo: pulls, labels, runs, statuses, suites, comments, reviews, listedUnder, ciRuns, runLists,
// posts, execs, failure, noDraft, noAutoMerge, diff), result and error of the last verb (the keys board.ts reads too),
// ff (the flow harness: crs, comments, open Signals, class, log, report, next, rows, land).
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { Outcome, splitArgs, type World } from '../support/world.ts';
import { cli as forgeCli, createForge } from '../../src/forge/index.ts';
import { buildReport, land, nextAction, queue, signalOfHead } from '../../src/forge/flow.ts';
import { parseCloses } from '../../src/ports.ts';
import type { AdapterContext, Binding, CR, Comment, Forge } from '../../src/ports.ts';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const csv = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
const unescape = (v: string) => v.replace(/\\n/g, '\n');

// =====================================================================================================================
// The fake gh
// =====================================================================================================================
type Fake = {
  pulls: Any[]; labels: Record<string, Set<string>>;
  runs: Record<string, Any[]>; statuses: Record<string, Any[]>; suites: Record<string, string>;
  comments: Record<string, Any[]>; reviews: Record<string, Any[]>; listedUnder: Record<string, number[]>;
  ciRuns: Any[]; runLists: Any[][]; runListCalls: number;
  posts: { path: string; input?: Any }[]; execs: { args: string[]; token?: string; input?: string }[];
  failure?: { times: number; message: string; done: number };
  noDraft: boolean; noAutoMerge: boolean;
};
const fake = (w: World): Fake => (w.state.fg ??= {
  pulls: [], labels: {}, runs: {}, statuses: {}, suites: {}, comments: {}, reviews: {}, listedUnder: {}, ciRuns: [], runLists: [], runListCalls: 0, posts: [], execs: [], noDraft: false, noAutoMerge: false,
} as Fake);

const DRAFT_ERR = 'gh: Draft pull requests are not supported in this repository. (HTTP 422)';
const lines = (rows: Any[]) => rows.map((r) => JSON.stringify(r)).join('\n');

const pullRow = (r: Record<string, string>): Any => {
  const merged = r.state === 'merged';
  return {
    number: Number(r.number), html_url: 'u', title: 'T', head: { ref: r.branch || 'b', sha: r.head || 'h' }, base: { ref: 'main', sha: 'm' },
    draft: r.draft === 'yes', state: r.state === 'open' || r.state === '' || r.state === undefined ? 'open' : 'closed', body: r.body ?? 'Closes 1',
    mergeable_state: r.behind === 'yes' ? 'behind' : 'clean', user: { login: r.author || 'ann' },
    merged_at: merged ? r.merged || 'x' : null, updated_at: r.updated || '2026-11-01T00:00:00Z', ...(r['merge sha'] ? { merge_commit_sha: r['merge sha'] } : {}),
  };
};

function route(w: World, g: Fake, args: string[], input?: string): string {
  if (args[0] === 'pr') {
    if (args[1] === 'ready' && g.noDraft) throw new Error(DRAFT_ERR);
    if (args[1] === 'merge' && g.noAutoMerge) throw new Error('gh: Auto merge is not allowed for this repository');
    return '';
  }
  if (args[0] === 'workflow') return '';
  if (args[0] === 'run') {
    if (args[1] === 'view') {
      const hit = g.ciRuns.find((r) => String(r.databaseId) === args[2]);
      if (!hit) throw new Error('gh: HTTP 404: Not Found');
      return JSON.stringify(hit);
    }
    if (args.includes('--workflow')) return JSON.stringify(g.runLists[Math.min(g.runListCalls++, g.runLists.length - 1)] ?? []);
    return JSON.stringify(g.ciRuns);
  }
  const path = args.find((a) => a.startsWith('repos/')) ?? '';
  const mi = args.indexOf('-X');
  const method = mi >= 0 ? args[mi + 1] : 'GET';
  const [p, qs] = path.replace(/^repos\/[^/]+\/[^/]+\//, '').split('?');
  const pull = (n: string): Any => {
    const row = g.pulls.find((x) => x.number === Number(n));
    if (!row) throw new Error('gh: HTTP 404: Not Found');
    return { ...row, labels: [...(g.labels[n] ?? [])].map((name) => ({ name })) };
  };
  let m: RegExpExecArray | null;
  if (p === 'pulls' && method === 'POST') {
    const body = JSON.parse(input ?? '{}');
    if (body.draft && g.noDraft) throw new Error(`Command failed: gh api\n${DRAFT_ERR}`);
    const number = Math.max(0, ...g.pulls.map((x) => x.number)) + 1;
    g.pulls.push({ number, html_url: 'u', title: body.title, head: { ref: body.head, sha: `h${number}` }, base: { ref: body.base, sha: 'm' }, draft: !!body.draft, state: 'open', body: body.body, user: { login: 'bot' } });
    g.posts.push({ path: p, input: body });
    return JSON.stringify({ number });
  }
  if (p === 'pulls') {
    const state = /state=(\w+)/.exec(qs ?? '')?.[1] ?? 'open';
    const page = Number(/(?:^|&)page=(\d+)/.exec(qs ?? '')?.[1] ?? 1);
    const rows = g.pulls.filter((x) => state === 'all' || x.state === state).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    return args.includes('--slurp') ? JSON.stringify([rows]) : JSON.stringify(rows.slice((page - 1) * 100, page * 100));
  }
  if ((m = /^pulls\/(\d+)$/.exec(p))) {
    const row = pull(m[1]);
    return args.includes('Accept: application/vnd.github.diff') ? 'diff --git a/x b/x\n' : JSON.stringify(row);
  }
  if ((m = /^pulls\/(\d+)\/ccr\/(\w+)$/.exec(p))) {
    if (g.noDraft && /ready_for_review|convert_to_draft/.test(m[2])) throw new Error(DRAFT_ERR);
    if (g.noAutoMerge && m[2] === 'auto_merge') throw new Error('gh: Auto merge is not allowed for this repository');
    return '';
  }
  if (/^pulls\/\d+\/(update-branch|merge)$/.test(p)) return '';
  if ((m = /^pulls\/(\d+)\/reviews$/.exec(p))) {
    if (method === 'POST') { g.posts.push({ path: p, input: JSON.parse(input ?? '{}') }); return '{}'; }
    return lines(g.reviews[m[1]] ?? []);
  }
  if ((m = /^pulls\/(\d+)\/commits$/.exec(p))) return '';
  if ((m = /^issues\/(\d+)\/labels(?:\/(\w+))?$/.exec(p))) {
    const set = (g.labels[m[1]] ??= new Set());
    if (method === 'DELETE') set.delete(m[2]); else set.add('draft');
    g.posts.push({ path: p });
    return '[]';
  }
  if ((m = /^issues\/(\d+)\/comments$/.exec(p))) {
    if (method === 'POST') { g.posts.push({ path: p, input: JSON.parse(input ?? '{}') }); return JSON.stringify({ id: 9, html_url: 'cu' }); }
    return lines(g.comments[m[1]] ?? []);
  }
  if ((m = /^commits\/([^/]+)\/(check-runs|status|check-suites|pulls)$/.exec(p))) {
    const [, sha, what] = m;
    if (what === 'check-runs') return lines(g.runs[sha] ?? []);
    if (what === 'status') return lines(g.statuses[sha] ?? []);
    if (what === 'check-suites') return g.suites[sha] ? `${g.suites[sha]}\n` : '';
    return JSON.stringify((g.listedUnder[sha] ?? []).map((n) => g.pulls.find((x) => x.number === n)));
  }
  if ((m = /^statuses\/([^/]+)$/.exec(p))) { g.posts.push({ path: p }); return '{}'; }
  throw new Error(`the fake gh has no route for: ${args.join(' ')}`);
}

/** The adapter context of the scenario: the binding as built so far, and an exec that answers from the fake repo. */
function forgeCtx(w: World): AdapterContext {
  const ctx = w.adapterContext(); // reads the binding the scenario built
  const options = (ctx.binding.forge.options ?? {}) as Record<string, unknown>;
  const g = fake(w);
  ctx.options = options;
  ctx.exec = ((_cmd: string, args: string[], o: { env?: Record<string, string>; input?: string } = {}) => {
    g.execs.push({ args, token: o.env?.GH_TOKEN, input: o.input });
    w.calls.push(['gh', ...args].join(' '));
    if (g.failure && g.failure.done < g.failure.times) { g.failure.done++; throw new Error(g.failure.message); }
    return route(w, g, args, o.input);
  }) as AdapterContext['exec'];
  return ctx;
}
const forgeOf = (w: World): Forge => (w.state.forgePort ??= createForge(forgeCtx(w)));

/** Runs one forge verb; its result or its error is what the next Then reads (the keys board.ts reads too). */
const attempt = async (w: World, fn: (f: Forge) => Promise<unknown>) => {
  w.state.result = undefined; w.state.error = undefined;
  try { w.state.result = await fn(forgeOf(w)); } catch (e) { w.state.error = e; }
};

// ---- Given: the forge and its repo ----
Given('the github forge for the repo {string}', (w, repo: string) => { w.binding({ forge: { adapter: 'github', options: { repo }, required_checks: [], review_identity: '' }, vcs: { adapter: 'git', trunk: 'main' } }); });
Given('the github forge without a repo option', (w) => { w.binding({ forge: { adapter: 'github', options: {}, required_checks: [], review_identity: '' }, vcs: { adapter: 'git', trunk: 'main' } }); });
Given('the forge option {string} is {string}', (w, key: string, value: string) => { w.binding({ forge: { options: { [key]: value } } }); });
Given('the forge has the review identity {string}', (w, who: string) => { w.binding({ forge: { review_identity: who } }); });
Given('the forge requires the checks {string}', (w, list: string) => { w.binding({ forge: { required_checks: csv(list) } }); });
Given('the forge credential variable {string} is {string}', (w, name: string, value: string) => { w.env[name] = value; });
Given('the forge session is a Claude cloud session', (w) => { w.env.CLAUDE_CODE_REMOTE = 'true'; });
Given('the repo refuses draft pull requests', (w) => { fake(w).noDraft = true; });
Given('GitHub refuses to arm auto-merge', (w) => { fake(w).noAutoMerge = true; });
Given('the gh calls fail {int} times with {string} before they answer', (w, times: number, message: string) => {
  fake(w).failure = { times, message, done: 0 };
  w.useFakeSleep();
});

Given('the repo has the open pull request {int}', (w, n: number) => { fake(w).pulls.push(pullRow({ number: String(n) })); });
Given('the repo has the open pull request {int} at the head {string}', (w, n: number, head: string) => { fake(w).pulls.push(pullRow({ number: String(n), head })); });
Given('the repo has these pull requests:', (w, t: DataTable) => { fake(w).pulls.push(...t.hashes().map(pullRow)); });
Given('the pull request {int} is behind the trunk', (w, n: number) => { fake(w).pulls.find((p) => p.number === n)!.mergeable_state = 'behind'; });
Given('the pull request {int} is labelled {string}', (w, n: number, label: string) => { (fake(w).labels[String(n)] ??= new Set()).add(label); });
Given('the head {string} has the check runs:', (w, sha: string, t: DataTable) => {
  fake(w).runs[sha] = t.hashes().map((r) => ({ id: Number(r.id), name: r.name, status: r.status, conclusion: r.conclusion || null }));
});
Given('the head {string} has the commit statuses:', (w, sha: string, t: DataTable) => { fake(w).statuses[sha] = t.hashes().map((r) => ({ context: r.context, state: r.state })); });
Given('the first check suite of the head {string} was created at {string}', (w, sha: string, at: string) => { fake(w).suites[sha] = at; });
Given('the CR {int} has these comments:', (w, n: number, t: DataTable) => {
  fake(w).comments[String(n)] = t.hashes().map((r, i) => ({ id: String(i + 1), author: r.author, createdAt: String(i + 1), body: r.body, url: 'u' }));
});
Given('the CR {int} has these reviews:', (w, n: number, t: DataTable) => { fake(w).reviews[String(n)] = t.hashes().map((r) => ({ user: r.user, state: r.state, sha: r.sha })); });
Given('the commit {string} is listed under the pull requests {string}', (w, sha: string, list: string) => {
  const g = fake(w);
  g.listedUnder[sha] = csv(list.replace(/;/g, ',')).map((entry) => {
    const [n, kind, value] = entry.split(/\s+/);
    const row = pullRow({ number: n, head: kind === 'head' ? value : 'x' });
    if (kind === 'merge') row.merge_commit_sha = value;
    g.pulls.push(row);
    return Number(n);
  });
});
Given('gh lists the release runs, call by call:', (w, t: DataTable) => {
  fake(w).runLists = t.hashes().map((r) => csv(r.runs).map((e) => { const [id, url] = e.split(/\s+/); return { databaseId: Number(id), url }; }));
});
Given('the CI runs are:', (w, t: DataTable) => {
  fake(w).ciRuns = t.hashes().map((r) => ({ databaseId: Number(r.id), name: r.name, headBranch: r.branch, headSha: r.sha, status: r.status, conclusion: r.conclusion || null, url: r.url, createdAt: r.at }));
});

// ---- When: one forge verb ----
When('the forge opens a CR from the branch {string} titled {string} with the body {string}', (w, source: string, title: string, body: string) => attempt(w, (f) => f.open({ source, title, body })));
When('the forge opens a draft CR from the branch {string} titled {string} with the body {string}', (w, source: string, title: string, body: string) => attempt(w, (f) => f.open({ source, title, body, draft: true })));
When('the forge runs {word} on {string}', (w, verb: string, arg: string) => attempt(w, (f) => {
  if (verb === 'status') return f.status(arg, { context: 'c', state: 'success', description: 'd' });
  if (verb === 'viewBySha') return f.viewBySha(arg);
  return (f as Any)[verb](arg);
}));
When('the forge comments {string} on the CR {string}', (w, body: string, n: string) => attempt(w, (f) => f.comment(n, body)));
When('the forge posts the status {string} as {string} on the commit {string}', (w, context: string, state: string, sha: string) =>
  attempt(w, (f) => f.status(sha, { context, state: state as 'success', description: 'd' })));
When('the forge lists the CRs with {string}', (w, query: string) => attempt(w, (f) => {
  const q: Any = {};
  for (const part of csv(query.replace(/ /g, ','))) {
    const [k, v] = part.split('=');
    q[k] = k === 'limit' ? Number(v) : k === 'checks' ? true : v;
  }
  return f.list(q);
}));
When('the forge cuts the revision {string} as the version {string}', (w, rev: string, version: string) => attempt(w, (f) => f.cut(rev, version)));
When('the forge lists the failed CI runs of the branch {string}', (w, ref: string) => attempt(w, (f) => f.runs({ ref, failed: true })));
When('the forge CLI runs {string}', async (w, line: string) => {
  const ctx = forgeCtx(w);
  // A file the scenario wrote is named relative to the project: the in-process CLI runs elsewhere.
  const argv = splitArgs(line).map((a) => (w.exists(a) ? w.path(a) : a));
  const out: string[] = [], err: string[] = [];
  const o = process.stdout.write, e = process.stderr.write;
  process.stdout.write = ((s: string) => (out.push(s), true)) as typeof o;
  process.stderr.write = ((s: string) => (err.push(s), true)) as typeof e;
  let code: number;
  try { code = await forgeCli(argv, ctx); } finally { process.stdout.write = o; process.stderr.write = e; }
  w.last = new Outcome(code, out.join(''), err.join(''));
});
Given('a file {string} containing:', (w, name: string, doc: string) => { mkdirSync(dirname(w.path(name)), { recursive: true }); writeFileSync(w.path(name), `${doc}\n`); });

// ---- Then: what the verb returned, what it called ----
const text = (v: unknown): string | undefined =>
  v === undefined ? undefined
    : Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' && 'name' in x && 'state' in x ? `${x.name}=${x.state}` : typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')
      : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
const read = (w: World, path: string) => { let v: Any = w.state.result; for (const k of path.split('.')) v = v?.[k]; return v; };
const joined = (w: World) => w.calls.join('\n');
const callWith = (w: World, part: string) => fake(w).execs.find((x) => x.args.join(' ').includes(part));

Then('the forge reads {string} as {string}', (w, path: string, value: string) => { assert.ok(!w.state.error, String(w.state.error)); assert.equal(text(read(w, path)), value); });
Then('the forge reads no {string}', (w, path: string) => { assert.ok(!w.state.error, String(w.state.error)); assert.equal(read(w, path), undefined); });
Then('the listed CRs are {string}', (w, ids: string) => assert.equal((w.state.result as CR[]).map((c) => c.n).join(', '), ids));
Then('the forge made {int} calls', (w, n: number) => assert.equal(fake(w).execs.length, n, joined(w)));
Then('the slept milliseconds are {string}', (w, list: string) => assert.equal(w.sleeps.join(', '), list));
Then('the forge makes no call', (w) => assert.equal(w.calls.length, 0, joined(w)));
Then('the call including {string} reads every page', (w, part: string) => assert.ok(callWith(w, part)?.args.includes('--paginate'), `no paginated call includes ${part}:\n${joined(w)}`));
Then('the call including {string} runs with the token {string}', (w, part: string, token: string) => {
  const c = callWith(w, part);
  assert.ok(c, `no call includes ${part}:\n${joined(w)}`);
  assert.equal(c.token, token);
});
Then('the first call runs with the token {string}', (w, token: string) => assert.equal(fake(w).execs[0].token, token));
Then('no call carries a token of its own', (w) => { assert.ok(fake(w).execs.length > 0); assert.deepEqual(fake(w).execs.map((x) => x.token), fake(w).execs.map(() => undefined)); });
Then('the call including {string} sends {string}', (w, part: string, json: string) => {
  const c = callWith(w, part);
  assert.ok(c?.input, `no call including ${part} sent a body:\n${joined(w)}`);
  assert.deepEqual(JSON.parse(c.input!), JSON.parse(json));
});
Then('every call is a gh api call under {string}', (w, prefix: string) => {
  assert.ok(fake(w).execs.length > 0);
  for (const { args } of fake(w).execs) {
    assert.equal(args[0], 'api', args.join(' '));
    assert.ok(args.some((a) => a.startsWith(prefix)), args.join(' '));
  }
});
Then('the comment posted on the CR {string} opens with {string}', (w, n: string, first: string) => {
  const post = fake(w).posts.find((x) => x.path === `issues/${n}/comments`);
  assert.ok(post, `no comment was posted on ${n}:\n${joined(w)}`);
  assert.equal(String(post.input.body).split('\n')[0], first);
});
Then('the approvals are {string}', (w, list: string) => assert.equal((w.state.result as Any[]).map((a) => `${a.user}:${a.state}:${a.sha}`).join(', '), list));
Then('the ids {string} closes are {string}', (w, body: string, ids: string) => assert.equal(parseCloses(unescape(body)).join(', ') || 'none', ids));

// =====================================================================================================================
// The flow verbs: the next action, the queue, land, the report. A fake forge port holds the CRs of the scenario.
// =====================================================================================================================
const T0 = Date.parse('2026-01-01T12:00:00Z');
const iso = (min: number) => new Date(T0 - min * 60_000).toISOString();
const deep = (a: Any, b: Any): Any => {
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return b;
  const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const [k, v] of Object.entries(b)) out[k] = deep(out[k], v);
  return out;
};
type Flow = {
  crs: CR[]; comments: Record<string, Comment[]>; open: Set<string>; klass: { class: string; who: string[] } | Error; signalsOpen: boolean;
  log: string[]; merges: boolean; greenAt?: { n: string; look: number; views: number }; next?: ReturnType<typeof nextAction>; rows?: Any[]; land?: Any; report?: Any; error?: Error; signal?: string;
};
const flow = (w: World): Flow => (w.state.ff ??= { crs: [], comments: {}, open: new Set(), klass: { class: 'product-full', who: [] }, signalsOpen: false, log: [], merges: false } as Flow);

/** The binding the flow verbs read: owners, the required checks, the stall time, then the scenario's own keys. */
const flowBinding = (w: World): Binding => deep({
  owners: { product: 'po', factory: 'fo', bots: ['bot'] },
  forge: { review_identity: '', review_check_name: 'review', required_checks: ['ci', 'human-approval'] },
  cycle: {}, stall_minutes: 60, board: { labels: { human: 'needs-human' } },
}, w.bindingPatch);

/** `ready`, `draft`, `behind`, `merged`, `closed`, `no ticket`, `head <sha>`, `pushed <n> minutes ago`, `not pushed`: a CR as a list of traits. */
const crOf = (n: string, traits: string): CR => {
  const c: CR = { n, url: '', title: '', source: 's', target: 'main', headSha: 'h1', baseSha: 'm', draft: false, state: 'open', behind: false, closes: ['12'], checks: [], body: '', author: 'bot', pushedAt: iso(5) };
  for (const t of csv(traits)) {
    let m: RegExpExecArray | null;
    if (t === 'ready') continue;
    else if (t === 'draft') c.draft = true;
    else if (t === 'behind') c.behind = true;
    else if (t === 'merged' || t === 'closed') c.state = t;
    else if (t === 'no ticket') c.closes = [];
    else if (t === 'not pushed') delete c.pushedAt;
    else if ((m = /^head (\S+)$/.exec(t))) c.headSha = m[1];
    else if ((m = /^pushed (\d+) minutes ago$/.exec(t))) c.pushedAt = iso(Number(m[1]));
    else throw new Error(`unknown CR trait: ${t}`);
  }
  return c;
};
const checksOf = (list: string): CR['checks'] => csv(list).map((e) => { const [name, state] = e.split('='); return { name, state: state as 'success' }; });

let serial = 0;
/** `<author>: <pass|fail|conflict|note|comment> [for <head>], <n>m ago [saying <text>]`, entries separated by `;`. */
const commentsOf = (list: string): Comment[] => list.split(';').map((s) => s.trim()).filter(Boolean).map((e) => {
  const m = /^(\S+): (pass|fail|conflict|note|comment)(?: for (\S+))?, (\d+)m ago(?: saying (.+))?$/.exec(e);
  if (!m) throw new Error(`cannot read the comment: ${e}`);
  const [, author, kind, head = 'h1', ago, said] = m;
  const mark = `<!-- review-pr ${head} -->`;
  const body = kind === 'pass' ? `${mark}\nVerdict: PASS` : kind === 'fail' ? `${mark}\nVerdict: REMEDIATION REQUIRED`
    : kind === 'conflict' ? `${mark}\nVerdict: PASS\nVerdict: REMEDIATION REQUIRED`
      : kind === 'note' ? `<!-- note${m[3] ? ` ${head}` : ''} -->${said ? `\n${said}` : ''}` : said ?? '';
  return { id: String(++serial), author, createdAt: iso(Number(ago)), body };
});

Given('every Signal a note names is open', (w) => { flow(w).signalsOpen = true; });
Given('the Signal {string} is open', (w, id: string) => { flow(w).open.add(id); });
Given('the cycle sets {string} to {int}', (w, key: string, n: number) => { w.binding({ cycle: { [key]: n } }); });
Given('the approval class of every CR is {string}', (w, klass: string) => { flow(w).klass = { class: klass, who: [] }; });
Given('the approval class of every CR is {string}, owned by {string}', (w, klass: string, who: string) => { flow(w).klass = { class: klass, who: csv(who) }; });
Given('the approval class of a CR cannot be decided', (w) => { flow(w).klass = new Error('no diff'); });
Given('the CR {string} is {string} with the checks {string}', (w, n: string, traits: string, checks: string) => { const f = flow(w); f.crs.push({ ...crOf(n, traits), checks: checksOf(checks) }); });
Given('the forge merges a CR at once when asked', (w) => { flow(w).merges = true; });
Given('the checks of the CR {string} turn green at look {int}', (w, n: string, look: number) => { flow(w).greenAt = { n, look, views: 0 }; });
Given('these CRs are open:', (w, t: DataTable) => {
  const f = flow(w);
  for (const r of t.hashes()) {
    f.crs.push({ ...crOf(r.n, r.cr), checks: checksOf(r.checks) });
    f.comments[r.n] = commentsOf(r.comments);
  }
});

/** The fake forge port: the CRs and comments of the scenario, and a log of what land asked of it. */
const portOf = (w: World): Forge => {
  const f = flow(w);
  return {
    list: async () => f.crs,
    view: async (n: string) => {
      const g = f.greenAt;
      const cr = f.crs.find((c) => c.n === n)!;
      if (g && g.n === n && ++g.views === g.look) cr.checks = cr.checks.map((c) => ({ ...c, state: 'success' }));
      return cr;
    },
    comments: async (n: string) => f.comments[n] ?? [],
    automerge: async (n: string) => { f.log.push(`automerge ${n}`); const c = f.crs.find((x) => x.n === n)!; return { ...c, state: f.merges ? 'merged' : c.state } as CR; },
  } as unknown as Forge;
};
const classOf = (w: World) => async () => { const k = flow(w).klass; if (k instanceof Error) throw k; return k; };

When('the next action is decided for the CR {string} with the checks {string} and the comments {string}', (w, traits: string, checks: string, comments: string) => {
  const f = flow(w);
  const cr = { ...crOf('5', traits), checks: checksOf(checks) };
  const list = commentsOf(comments);
  const b = flowBinding(w);
  // A Signal a note names counts as open when the scenario says so.
  f.next = nextAction(cr, list, b, T0, f.signalsOpen && signalOfHead(cr, list, b) !== undefined);
});
When('the Signal of the head is read from the comments {string}', (w, comments: string) => {
  const cr = crOf('5', '');
  flow(w).signal = signalOfHead(cr, commentsOf(comments), flowBinding(w));
});
When('the queue is read', async (w) => { const f = flow(w); f.rows = await queue(portOf(w), flowBinding(w), classOf(w), T0, async (id) => f.open.has(id)); });
When('the CR {string} is landed', async (w, n: string) => { w.useFakeSleep(); flow(w).land = await land(portOf(w), flowBinding(w), n, undefined, classOf(w)); });
When('the CR {string} is landed waiting at most {int} minutes', async (w, n: string, minutes: number) => { w.useFakeSleep(); flow(w).land = await land(portOf(w), flowBinding(w), n, minutes, classOf(w)); });
When('the report for the head {string} is built as {word} from:', (w, head: string, flag: string, body: string) => {
  const f = flow(w);
  f.report = undefined; f.error = undefined;
  try { f.report = buildReport(body, head, flag === 'pass'); } catch (e) { f.error = e as Error; }
});

const next = (w: World) => { assert.ok(flow(w).next, 'no next action was decided'); return flow(w).next!; };
Then('the next action is {string}', (w, action: string) => assert.equal(next(w).action, action, next(w).reason));
Then('the reason is {string}', (w, reason: string) => assert.equal(next(w).reason, reason));
Then('the CR has been reworked {int} times', (w, n: number) => assert.equal(next(w).reworks, n));
Then('the state of the CR began {int} minutes ago', (w, n: number) => assert.equal(next(w).since, iso(n)));
Then('the Signal named for the head is {string}', (w, id: string) => assert.equal(flow(w).signal ?? 'none', id));

Then('the queue rows are:', (w, t: DataTable) => {
  const got = flow(w).rows!.map((r) => ({ n: r.n, ticket: r.ticket ?? '', class: r.class, action: r.action, reworks: String(r.reworks), since: `${(T0 - Date.parse(r.since)) / 60_000} minutes ago` }));
  assert.deepEqual(got, t.hashes().map((r) => ({ n: r.n, ticket: r.ticket, class: r.class, action: r.action, reworks: r.reworks, since: r.since })));
});
Then('the class of the first queue row is {string}', (w, klass: string) => assert.equal(flow(w).rows![0].class, klass));

const blocking = (w: World) => (flow(w).land.blocking as { check: string; state: string }[]).map((b) => `${b.check}=${b.state}`).join(', ') || 'none';
Then('the land state is {string}', (w, state: string) => assert.equal(flow(w).land.state, state));
Then('the checks blocking the land are {string}', (w, list: string) => assert.equal(blocking(w), list));
Then('a human of the class {string} must approve: {string}', (w, klass: string, who: string) => assert.deepEqual(flow(w).land.needsHuman, { class: klass, who: csv(who) }));
Then('no human is asked to approve', (w) => assert.equal(flow(w).land.needsHuman, undefined));
Then('the forge was asked to automerge the CR {string}', (w, n: string) => assert.deepEqual(flow(w).log, [`automerge ${n}`]));
Then('the forge was asked to merge nothing', (w) => assert.deepEqual(flow(w).log, []));
Then('the land waited {int} seconds in all', (w, s: number) => assert.equal(w.sleeps.reduce((a, b) => a + b, 0), s * 1000));

Then('the report is:', (w, doc: string) => {
  const r = flow(w).report;
  assert.ok(r, String(flow(w).error));
  assert.equal(r.text.trimEnd(), doc.trimEnd());
  assert.ok(r.text.endsWith('\n') && !r.text.endsWith('\n\n'), 'the report ends with one newline');
});
Then('the report is refused with the usage error {string}', (w, part: string) => {
  const e = flow(w).error;
  assert.ok(e, 'the report was built');
  assert.ok(e.message.includes(part), e.message);
  assert.equal(e.constructor.name, 'UsageError');
});

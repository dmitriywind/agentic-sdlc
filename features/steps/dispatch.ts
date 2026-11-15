// `agentic-sdlc dispatch`, run in-process (src/dispatch.ts cli) against the installed fixture pack, a local board, a fake exec/http
// and a fake child process. Nothing is started for real.
// State on w.state: outs (every JSON line printed), spawn ({ started, line, env, opts }: the last command started), lastDone
// (the done line of the last start record), managed ({ url, headers, body } or error), judge (the last judgeTier answer).
// The result of a run is w.last: the steps 'the result ... is ...' (board.ts) and 'the exit code is' read it.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalBoard } from '../../src/board/local.ts';
import { quote } from '../../src/bench.ts';
import { cli, judgeTier, managedRequest, setSpawn } from '../../src/dispatch.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { Outcome, splitArgs, type World } from '../support/world.ts';
import { packFiles, writePack } from '../support/skillfix.ts';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const setPath = (w: World, key: string, value: unknown) => {
  const patch: Record<string, unknown> = {};
  let o = patch;
  const parts = key.split('.');
  parts.slice(0, -1).forEach((k) => { o = (o[k] = {}) as Record<string, unknown>; });
  o[parts.at(-1)!] = value;
  w.binding(patch);
};
const board = (w: World) => createLocalBoard(w.adapterContext() as Any);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- the project ----
Given('the installed skill pack', (w) => writePack(w.path('.agents', 'skills'), packFiles('sdlc-')));
Given('the executor {string} is {string}', (w, name: string, json: string) => w.binding({ executors: { [name]: JSON.parse(json) } }));
Given('the binding has {string} set to the JSON {string}', (w, key: string, json: string) => setPath(w, key, JSON.parse(json)));
Given('the runner sets {string} to {string}', (w, name: string, value: string) => { w.env[name] = value; });
Given('the dedupe window is {string} minutes', (w, n: string) => w.binding({ cycle: { dedupe_minutes: Number(n) } }));
Given('a run may stay unfinished for {int} minutes', (w, n: number) => w.binding({ stall_minutes: n }));
Given('the trusted bots are {string}', (w, names: string) => w.binding({ owners: { bots: names.split(',').map((s) => s.trim()) } }));
Given('the models are fast {string}, balanced {string} and deep {string}', (w, fast: string, balanced: string, deep: string) => w.binding({ models: { fast, balanced, deep } }));
Given('the judge tier is {string}', (w, tier: string) => w.binding({ learning: { judge_tier: tier } }));
Given('the local board holds a ticket at Ready as ticket 1 and the heartbeat ticket 2', async (w) => {
  w.binding({ heartbeat: { ticket: '2' }, owners: { bots: ['local'] } });
  const b = board(w);
  await b.create({ title: 't', body: '', status: 'Ready' });
  await b.create({ title: 'heartbeat', body: '', status: 'Backlog' });
});
Given('the forge is GitHub and shows the change request {int} on the head {string}', (w, n: number, sha: string) => {
  w.binding({ forge: { adapter: 'github', options: {} } });
  w.answer(new RegExp(`pulls/${n}`), { number: n, head: { ref: 'factory/x', sha }, base: { ref: 'main', sha: 'b' } });
});
Given('the executor endpoint answers every request with the run id {string}', (w, id: string) => w.answer(/^POST/, { id }));

// ---- the comments on the local board ----
When('the comment {string} is posted on the ticket {string}', async (w, body: string, id: string) => { await board(w).comment(id, body); });
When('the run posts its done line on the ticket {string}', async (w, id: string) => { assert.ok(w.state.lastDone, 'no dispatch printed a done line'); await board(w).comment(id, `${w.state.lastDone}\ndone`); });
When('a moment passes', () => wait(20));
Then('the ticket {string} holds a comment starting with {string}', async (w, id: string, text: string) => {
  const bodies = (await board(w).comments(id)).map((c) => c.body);
  assert.ok(bodies.some((b) => b.startsWith(text)), `no comment starts with "${text}":\n${bodies.join('\n---\n')}`);
});

// ---- running dispatch ----
async function run(w: World, argvs: string[][]) {
  const logs: string[] = [], errs: string[] = [];
  const spawn: Any = (w.state.spawn = { started: false });
  const prev = setSpawn(((c: string, a: string[], o: Any) => {
    Object.assign(spawn, { started: true, line: process.platform === 'win32' ? o.env.AGENTIC_SDLC_CMD : a[1], env: o.env, opts: o });
    return { pid: 1234, on() { return this; }, unref() {} };
  }) as Any);
  const log = console.log, err = console.error;
  console.log = (...a: unknown[]) => { logs.push(a.join(' ')); };
  console.error = (...a: unknown[]) => { errs.push(a.join(' ')); };
  let codes: number[] = [];
  try { codes = await Promise.all(argvs.map((argv) => cli(argv, w.adapterContext()))); } finally { console.log = log; console.error = err; setSpawn(prev); }
  w.last = new Outcome(Math.max(...codes), logs.join('\n'), errs.join('\n'));
  w.state.outs = logs.map((l) => JSON.parse(l));
  const done = [...w.state.outs].reverse().find((o: Any) => o.done);
  if (done) w.state.lastDone = done.done;
}
When('dispatch runs {string}', (w, line: string) => run(w, [splitArgs(line)]));
When('two cycles run {string} and {string} at the same time', (w, a: string, b: string) => run(w, [splitArgs(a), splitArgs(b)]));
When('dispatch runs build for a ticket whose id holds a line break', (w) => run(w, [['build', '--ticket', '5\nrm -rf /']]));

// ---- what it printed ----
Then('the start record has no {string}', (w, path: string) => { let v: Any = w.last.json(); for (const k of path.split('.')) v = v?.[k]; assert.equal(v, undefined); });
Then('exactly {int} of the cycles printed a skip and {int} printed a start with the kind {string}', (w, skipped: number, started: number, kind: string) => {
  const outs: Any[] = w.state.outs;
  assert.equal(outs.filter((o) => o.skipped).length, skipped, w.last.stdout);
  assert.equal(outs.filter((o) => o.kind === kind).length, started, w.last.stdout);
});
Then('the instruction matches {string}', (w, re: string) => assert.match(w.last.json().instruction, new RegExp(re)));

// ---- the command executor ----
Then('the command line is the template {string} filled with the quoted words {string}', (w, template: string, words: string) => {
  const list = words.split('|');
  assert.equal(w.state.spawn.line, template.replace(/\{\}/g, () => quote(list.shift()!)));
});
Then('the command line mentions {string}', (w, text: string) => assert.ok(String(w.state.spawn.line).includes(text), String(w.state.spawn.line)));
Then('nothing is started on this machine', (w) => assert.equal(w.state.spawn.started, false));
Then('the command runs detached with its input ignored', (w) => { assert.equal(w.state.spawn.opts.detached, true); assert.equal(w.state.spawn.opts.stdio[0], 'ignore'); });
Then('the run log is in the folder agentic-sdlc-runs of the temp folder and ends with {string}', (w, tail: string) => {
  const log = w.last.json().log;
  assert.ok(log.startsWith(join(tmpdir(), 'agentic-sdlc-runs')) && log.endsWith(tail), log);
});
Then('the run log folder is private to the user and so is the run log', (w) => {
  if (process.platform === 'win32') return;
  assert.equal(statSync(join(tmpdir(), 'agentic-sdlc-runs')).mode & 0o777, 0o700);
  assert.equal(statSync(w.last.json().log).mode & 0o777, 0o600);
});
Then('the child environment holds {string} as {string}', (w, name: string, value: string) => assert.equal(w.state.spawn.env[name], value));
Then('the child environment has no {string}', (w, name: string) => assert.equal(w.state.spawn.env[name], undefined));
const mcpsFile = (w: World) => String(w.state.spawn.line).split(' ').pop()!.replace(/["']/g, '');
Then('the mcps file holds exactly the servers {string}', (w, json: string) => assert.deepEqual(JSON.parse(readFileSync(mcpsFile(w), 'utf8')), JSON.parse(json)));
Then('the mcps file does not hold {string}', (w, text: string) => assert.ok(!readFileSync(mcpsFile(w), 'utf8').includes(text)));

// ---- the webhook and managed requests ----
const body = (w: World) => {
  const c = w.calls[0];
  const b = JSON.parse(c.slice(c.indexOf('{')));
  return b.task ? { ...b, ...b.task } : b;
};
Then('the request body holds {string} as the JSON {string}', (w, path: string, json: string) => {
  let v: Any = body(w);
  for (const k of path.split('.')) v = v?.[k];
  assert.deepEqual(v, JSON.parse(json));
});
Then('the first call starts with {string}', (w, text: string) => assert.ok(w.calls[0]?.startsWith(text), String(w.calls[0])));
Then('the first call matches {string}', (w, re: string) => assert.match(w.calls[0], new RegExp(re)));

// ---- managedRequest, each vendor's start-a-run call ----
const ENV = { TOK: 't', AG: 'agent_1', ENV: 'env_1' };
When('a managed request is built for the step {string} from the executor {string}', (w, id: string, json: string) => {
  w.state.managed = undefined;
  try { w.state.managed = managedRequest(JSON.parse(json), ENV, { skill: id, ticket: '7', cr: '' }, w.state.managedModel, {}); w.state.managedError = undefined; } catch (e) { w.state.managedError = e as Error; }
});
Given('the model {string} is chosen for the managed request', (w, m: string) => { w.state.managedModel = m; });
Then('the managed request goes to {string}', (w, url: string) => { assert.ok(w.state.managed, String(w.state.managedError)); assert.equal(w.state.managed[1], url); });
Then('the managed request goes to a URL matching {string}', (w, re: string) => assert.match(w.state.managed[1], new RegExp(re)));
Then('the managed request header {string} is {string}', (w, name: string, value: string) => assert.equal(w.state.managed[2].headers[name], value));
Then('the managed request body holds {string} as the JSON {string}', (w, path: string, json: string) => {
  let v: Any = w.state.managed[2].body;
  for (const k of path.split('.')) v = v?.[k];
  assert.deepEqual(v, JSON.parse(json));
});
Then('building the managed request fails matching {string}', (w, re: string) => { assert.ok(w.state.managedError, 'the request was built'); assert.match(w.state.managedError.message, new RegExp(re)); });
Then('the managed request is built', (w) => assert.ok(w.state.managed, String(w.state.managedError)));

// ---- the judge tier ----
When('the judge tier is chosen for the judge tier {string} with the models {string}, for a run on the model {string}', (w, tier: string, models: string, run: string) => {
  const [fast, balanced, deep] = models.split(',').map((x) => x.trim());
  w.state.judge = judgeTier({ learning: { judge_tier: tier }, models: { fast, balanced, deep } } as Any, run || undefined);
});
Then('the judge runs at the tier {string} on the model {string}', (w, tier: string, model: string) => assert.deepEqual(w.state.judge, { tier, model }));
Then('the judge is skipped', (w) => assert.ok('skip' in w.state.judge, JSON.stringify(w.state.judge)));

// ---- a table of executors for the lookup scenarios ----
Given('the executors are:', (w, t: DataTable) => {
  for (const r of t.hashes()) w.binding({ executors: { [r.name]: { kind: 'command', run: r.run } } });
});

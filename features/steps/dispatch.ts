// `agentic-sdlc dispatch`, run in-process (src/dispatch.ts cli) against the installed fixture pack, a local board, a fake exec/http
// and a fake child process. Nothing is started for real.
// State on w.state: outs (every JSON line printed), spawn ({ started, line, env, opts }: the last command started), lastDone
// (the done line of the last start record), judge (the last judgeTier answer).
// The result of a run is w.last: the steps 'the result ... is ...' (board.ts) and 'the exit code is' read it.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createLocalBoard } from '../../src/board/local.ts';
import { quote } from '../../src/bench.ts';
import { cli, setSpawn } from '../../src/dispatch.ts';
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

// ---- the project ----
Given('the installed skill pack', (w) => writePack(w.path('.agents', 'skills'), packFiles('sdlc-')));
Given('the executor {string} is {string}', (w, name: string, json: string) => w.binding({ executors: { [name]: JSON.parse(json) } }));
Given('the binding has {string} set to the JSON {string}', (w, key: string, json: string) => setPath(w, key, JSON.parse(json)));
Given('the runner sets {string} to {string}', (w, name: string, value: string) => { w.env[name] = value; });
Given('the dedupe window is {string} minutes', (w, n: string) => w.binding({ cycle: { dedupe_minutes: Number(n) } }));
Given('the models are fast {string}, balanced {string} and deep {string}', (w, fast: string, balanced: string, deep: string) => w.binding({ models: { fast, balanced, deep } }));
Given('the judge tier is {string}', (w, tier: string) => w.binding({ learning: { judge_tier: tier } }));
Given('the local board holds a ticket at Ready as ticket 1 and the heartbeat ticket 2', async (w) => {
  w.binding({ heartbeat: { ticket: '2' }, owners: { bots: ['local'] } });
  const b = board(w);
  await b.create({ title: 't', body: '', status: 'Ready' });
  await b.create({ title: 'heartbeat', body: '', status: 'Backlog' });
});

// ---- the comments on the local board ----
Given('the comments of the ticket {string} are {int} minutes old', (w, id: string, minutes: number) => {
  const file = w.path('.agents', 'board.json');
  const db = JSON.parse(readFileSync(file, 'utf8'));
  for (const c of db.comments[id]) c.createdAt = new Date(Date.now() - minutes * 60_000).toISOString();
  writeFileSync(file, JSON.stringify(db));
});
When('the comment {string} is posted on the ticket {string}', async (w, body: string, id: string) => { await board(w).comment(id, body); });

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

// ---- the command executor ----
Then('the command line is the template {string} filled with the quoted words {string}', (w, template: string, words: string) => {
  const list = words.split('|');
  assert.equal(w.state.spawn.line, template.replace(/\{\}/g, () => quote(list.shift()!)));
});
Then('the command line mentions {string}', (w, text: string) => assert.ok(String(w.state.spawn.line).includes(text), String(w.state.spawn.line)));
Then('the child environment holds {string} as {string}', (w, name: string, value: string) => assert.equal(w.state.spawn.env[name], value));
Then('the child environment has no {string}', (w, name: string) => assert.equal(w.state.spawn.env[name], undefined));

// ---- a table of executors for the lookup scenarios ----
Given('the executors are:', (w, t: DataTable) => {
  for (const r of t.hashes()) w.binding({ executors: { [r.name]: { kind: 'command', run: r.run } } });
});

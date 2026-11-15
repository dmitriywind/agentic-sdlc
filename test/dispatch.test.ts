import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cli, judgeTier, managedRequest, setSpawn } from '../src/dispatch.ts';
import { quote } from '../src/bench.ts';
import { binding, fakeCtx } from './helpers.ts';
import { packFiles, packRoot, writePack } from './skillfix.ts';

const PACK = packRoot();

const run = async (executors: any, argv: string[], env = {}, answer: (c: string) => unknown = () => ({ id: 'r1' }), extra: object = {}) => {
  const f = fakeCtx(PACK, {}, answer, env);
  f.ctx.binding = { ...binding, executors, ...extra } as any;
  let envCmd: string | undefined, childEnv: any, spawned: string | undefined, opts: any;
  const prev = setSpawn(((c: string, a: string[], o: any) => {
    opts = o; childEnv = o.env; envCmd = o.env.AGENTIC_SDLC_CMD; spawned = [c, ...a].join(' ');
    return { pid: 1234, on() { return this; }, unref() {} };
  }) as any);
  const log: string[] = [];
  const orig = console.log; console.log = (s: string) => log.push(s);
  const err = console.error; console.error = (m: string) => { if (process.env.DBG) process.stderr.write(m + '\n'); };
  try { const code = await cli(argv, f.ctx); return { code, out: log[0] && JSON.parse(log[0]), calls: f.calls, envCmd, childEnv, opts, cmd: envCmd ?? spawned ?? '' }; }
  finally { console.log = orig; console.error = err; setSpawn(prev); }
};

test('command fills quoted placeholders and runs through the platform shell', async () => {
  const r = await run({ default: { kind: 'harness' }, ship: { kind: 'command', run: 'bot {skill} {ticket} {cr} {workdir}' } }, ['ship', '--ticket', '5', '--cr', '9', '--workdir', 'C:/my dir']);
  assert.equal(r.code, 0);
  assert.equal(r.cmd.replace(/^sh -c /, ''), `bot ${quote('ship')} ${quote('5')} ${quote('9')} ${quote('C:/my dir')}`);
  assert.equal((await run({ default: { kind: 'command', run: 'bot {ticket}' } }, ['build', '--ticket', '5\nrm -rf /'])).code, 1);
});

test('command spawns detached with output to a run log and prints the pid', async () => {
  const r = await run({ default: { kind: 'command', run: 'bot' } }, ['ship', '--ticket', '5']);
  assert.equal(r.code, 0);
  assert.equal(r.out.ref, '1234');
  assert.equal(r.opts.detached, true);
  assert.equal(r.opts.stdio[0], 'ignore');
  assert.ok(r.out.log.startsWith(join(tmpdir(), 'agentic-sdlc-runs')) && r.out.log.endsWith('-ship-5.log'), r.out.log);
});

test('each executor kind starts a run; a bad kind, an unset env var, a board failure or a usage error stops it', async () => {
  const ok = await run({ default: { kind: 'harness' }, constructor: { kind: 'bogus' } } as any, ['build', '--ticket', '1']); // an inherited key is not an executor
  assert.equal(ok.out.kind, 'harness');
  assert.equal((await run({ default: { kind: 'bogus' } }, ['build', '--ticket', '1'])).code, 1);
  assert.equal((await run({ default: { kind: 'harness' }, build: { kind: 'bogus' } }, ['build', '--ticket', '1'])).code, 1);
  const hook = { default: { kind: 'webhook', url_env: 'U', token_env: 'T' } };
  assert.equal((await run(hook, ['build', '--ticket', '1'], { U: 'https://h/x', T: 'tok' })).out.ref, 'r1');
  assert.equal((await run(hook, ['build', '--ticket', '1'], { U: 'https://h/x' })).code, 1);
  const m = await run({ default: { kind: 'managed', agent_env: 'A', token_env: 'T', endpoint_env: 'E' } }, ['build', '--ticket', '1'], { A: 'ag', T: 't', E: 'https://api/' });
  assert.ok(m.calls[0].startsWith('POST https://api/sessions'));
  assert.equal(m.out.kind, 'managed');
  assert.equal((await run({ default: { kind: 'assign', user: 'bot' } }, ['build', '--ticket', '1'])).code, 1); // the board refuses
  assert.equal((await run({ default: { kind: 'harness' } }, [])).code, 2);
});

test('learn/judge: binding judge_tier, stepped off the judged model; one model everywhere skips', async () => {
  const b = (judge_tier: string, models: object) => ({ learning: { judge_tier }, models }) as any;
  const m = { fast: 'f', balanced: 'b', deep: 'd' };
  assert.ok('skip' in judgeTier(b('balanced', m))); // an unknown run model is never judged
  assert.deepEqual(judgeTier(b('balanced', m), 'b'), { tier: 'deep', model: 'd' });
  assert.deepEqual(judgeTier(b('deep', m), 'd'), { tier: 'balanced', model: 'b' });
  assert.deepEqual(judgeTier(b('fast', { fast: 'build', balanced: 'build', deep: 'd' }), 'build'), { tier: 'deep', model: 'd' });
  assert.ok('skip' in judgeTier(b('fast', { fast: 'build', balanced: 'build', deep: 'build' }), 'build'));
  const r = await run({ default: { kind: 'harness' } }, ['learn/judge', '--ticket', '1', '--run-model', 'build'], {}, undefined, { learning: { judge_tier: 'fast' }, models: { fast: 'build', balanced: 'build', deep: 'build' } });
  assert.equal(r.code, 0);
  assert.equal(r.out.skip, true);
});

const mcps = { docs: { url: 'https://docs/mcp', token_env: 'DOCS_TOKEN' }, db: { command: 'db-mcp' } };
const models = { fast: 'f', balanced: 'b', deep: 'd' };

test('command: minimal env plus listed secrets, {model} and {mcps_file}; no secret value on disk', async () => {
  const ex = { default: { kind: 'command', run: 'bot {model} {mcps_file}', mcps: ['docs'], secrets: ['NPM_TOKEN'], model: { tier: 'deep' } } };
  const env = { PATH: '/bin', HOME: '/h', NPM_TOKEN: 'npm-secret', DOCS_TOKEN: 'docs-secret', OTHER: 'build' };
  const r = await run(ex, ['build', '--ticket', '1'], env, undefined, { models, mcps });
  assert.equal(r.code, 0);
  assert.deepEqual(r.childEnv.NPM_TOKEN, 'npm-secret');
  assert.equal(r.childEnv.OTHER, undefined);
  assert.equal(r.childEnv.DOCS_TOKEN, undefined);
  assert.equal(r.childEnv.PATH, '/bin');
  const file = r.cmd.slice(r.cmd.indexOf("bot ") + 4).split(" ").pop()!.replace(/["']/g, "");
  const text = readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(text), { docs: { url: 'https://docs/mcp', token_env: 'DOCS_TOKEN' } });
  assert.ok(!text.includes('docs-secret'));
  assert.ok(r.cmd.includes(quote('d')));
  assert.equal(r.out.model, 'd');
  assert.equal((await run(ex, ['build', '--ticket', '1'], { PATH: '/bin' }, undefined, { models, mcps })).code, 1, 'a listed secret that is unset');
});

test('model: id wins over tier; learn/judge keeps its judge tier', async () => {
  const pin = await run({ default: { kind: 'command', run: 'bot', model: { id: 'pinned' } } }, ['build', '--ticket', '1'], {}, undefined, { models });
  assert.equal(pin.out.model, 'pinned');
  const j = await run({ default: { kind: 'command', run: 'bot', model: { id: 'pinned' } } }, ['learn/judge', '--ticket', '1', '--run-model', 'other'], {}, undefined, { models, learning: { judge_tier: 'balanced' } });
  assert.equal(j.out.model, 'b');
});

test('local execution: unattended accepts sandbox local only with AGENTIC_SDLC_LOCAL=1; an unset sandbox stays refused', async () => {
  const u = ['build', '--ticket', '1', '--unattended'];
  const env = { AGENTIC_SDLC_LOCAL: '1' };
  assert.equal((await run({ default: { kind: 'harness', sandbox: 'local' } }, u, env)).code, 0);
  assert.equal((await run({ default: { kind: 'command', run: 'bot', sandbox: 'local' } }, u, env)).code, 0);
  assert.equal((await run({ default: { kind: 'harness' } }, u, env)).code, 1);
  assert.equal((await run({ default: { kind: 'harness', sandbox: 'local' } }, u, { AGENTIC_SDLC_LOCAL: 'yes' })).code, 1);
  // the flag and the env var both mean unattended; another sandbox is not local
  assert.equal((await run({ default: { kind: 'command', run: 'bot', sandbox: 'local' } }, ['build', '--ticket', '1'], { AGENTIC_SDLC_UNATTENDED: '1' })).code, 1);
  assert.equal((await run({ default: { kind: 'command', run: 'bot', sandbox: 'local' } }, ['build', '--ticket', '1'])).code, 0); // attended
  assert.equal((await run({ default: { kind: 'command', run: 'bot', sandbox: 'container' } }, u)).code, 0);
  assert.equal((await run({ default: { kind: 'webhook', url_env: 'U' } }, u, { U: 'https://h/x' })).code, 0);
  assert.equal((await run({ default: { kind: 'command', run: 'bot' } }, u)).code, 1);
  // a stage without its own sandbox takes the default stage's sandbox
  assert.equal((await run({ default: { kind: 'harness', sandbox: 'container' }, build: { kind: 'command', run: 'bot' } }, u)).code, 0);
  assert.equal((await run({ default: { kind: 'harness', sandbox: 'local' }, build: { kind: 'command', run: 'bot' } }, u)).code, 1);
});

test('webhook and managed bodies carry model, mcps (names and urls) and sandbox, never secrets', async () => {
  const stage = { mcps: ['docs', 'db'], secrets: ['NPM_TOKEN'], sandbox: 'cloud', model: { tier: 'fast' } };
  const env = { U: 'https://h/x', T: 'tok', A: 'ag', E: 'https://api', NPM_TOKEN: 'npm-secret', DOCS_TOKEN: 'docs-secret' };
  const w = await run({ default: { kind: 'webhook', url_env: 'U', token_env: 'T', ...stage } }, ['build', '--ticket', '1'], env, undefined, { models, mcps });
  const m = await run({ default: { kind: 'managed', agent_env: 'A', token_env: 'T', endpoint_env: 'E', ...stage } }, ['build', '--ticket', '1'], env, undefined, { models, mcps });
  for (const r of [w, m]) {
    const body = JSON.parse(r.calls[0].slice(r.calls[0].indexOf('{')));
    const sent = body.task ? { ...body, ...body.task } : body;
    assert.equal(sent.model, 'f');
    assert.equal(sent.sandbox, 'cloud');
    assert.deepEqual(sent.mcps, [{ name: 'docs', url: 'https://docs/mcp' }, { name: 'db' }]);
    assert.ok(!r.calls[0].includes('npm-secret') && !r.calls[0].includes('docs-secret'));
  }
});

test('harness prints the resolved stage', async () => {
  const r = await run({ default: { kind: 'harness', mcps: ['db'], secrets: ['S'], sandbox: 'container', model: { id: 'm1' } } }, ['build', '--ticket', '1'], {}, undefined, { models, mcps });
  assert.deepEqual({ ...r.out, startedAt: 0, instruction: 0 }, { kind: 'harness', ref: null, startedAt: 0, key: '1-build', done: '<!-- agentic-sdlc:done 1-build -->', instruction: 0, model: 'm1', tier: 'deep', mcps: { db: { command: 'db-mcp' } }, secrets: ['S'], sandbox: 'container' });
});

test('managedRequest builds each vendor start-a-run call and never needs a model for claude', async () => {
  const env = { TOK: 't', AG: 'agent_1', ENV: 'env_1' };
  const t = { skill: 'build', ticket: '7', cr: '' };
  const [, url, c] = managedRequest({ kind: 'managed', api: 'claude', token_env: 'TOK', agent_env: 'AG', environment_env: 'ENV' }, env, t, undefined, {});
  assert.equal(url, 'https://api.anthropic.com/v1/sessions');
  assert.equal(c.headers['anthropic-beta'], 'managed-agents-2026-04-01');
  assert.deepEqual((c.body as any).environment_id, 'env_1');
  const [, curl, cc] = managedRequest({ kind: 'managed', api: 'cursor', token_env: 'TOK', repo_url: 'https://github.com/o/r' }, env, t, 'm1', {});
  assert.equal(curl, 'https://api.cursor.com/v1/agents');
  assert.equal((cc.body as any).repos[0].url, 'https://github.com/o/r');
  assert.equal((cc.body as any).model, 'm1');
  const [, aurl, ac] = managedRequest({ kind: 'managed', api: 'antigravity', token_env: 'TOK' }, env, t, undefined, {});
  assert.match(aurl, /\/v1beta\/interactions$/);
  assert.equal(ac.headers['x-goog-api-key'], 't');
  assert.throws(() => managedRequest({ kind: 'managed', api: 'claude', token_env: 'TOK' }, env, t, undefined, {}), /agent_env/);
  // claude and antigravity run the agent's own model: a pinned model is refused
  const judge = { skill: 'learn/judge', ticket: '7', cr: '' };
  for (const api of ['claude', 'antigravity'] as const) {
    const ex = { kind: 'managed', api, token_env: 'TOK', agent_env: 'AG', environment_env: 'ENV' } as const;
    assert.throws(() => managedRequest(ex, env, judge, 'm', {}), new RegExp(`managed api ${api} cannot pin a model`));
    assert.throws(() => managedRequest({ ...ex, model: { id: 'm' } }, env, { ...judge, skill: 'build' }, 'm', {}), /cannot pin a model/);
  }
  assert.doesNotThrow(() => managedRequest({ kind: 'managed', api: 'cursor', token_env: 'TOK', repo_url: 'u' }, env, judge, 'm', {}));
});

test('idempotency: a trusted marker for the same key inside cycle.dedupe_minutes skips; --cr and learn/improve use the heartbeat ticket', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { createLocalBoard } = await import('../src/board/local.ts');
  const root = mkdtempSync(join(tmpdir(), 'disp-'));
  writePack(join(root, '.agents', 'skills'), packFiles());
  const b = { ...binding, cycle: { dedupe_minutes: 10 }, owners: { bots: ['local'] }, heartbeat: { ticket: '2' }, forge: { adapter: 'github', options: {} }, models: { fast: 'f', balanced: 'b', deep: 'd' }, executors: { default: { kind: 'harness' } } } as any;
  const board = createLocalBoard({ root, binding: b, options: {}, env: {}, exec: () => '', http: async () => ({}) });
  await board.create({ title: 't', body: '', status: 'Ready' });
  await board.create({ title: 'heartbeat', body: '', status: 'Backlog' });
  const go = async (argv: string[]) => {
    const f = fakeCtx(root, {}, (c) => (c.startsWith('git rev-parse') ? 'abc123\n' : c.includes('pulls/9') ? JSON.stringify({ number: 9, head: { ref: 'factory/x', sha: 'crsha' }, base: { ref: 'main', sha: 'b' } }) : '{}'));
    f.ctx.binding = b;
    const log: string[] = [];
    const orig = console.log; console.log = (s: string) => log.push(s);
    try { return { code: await cli(argv, f.ctx), out: JSON.parse(log[0]) }; } finally { console.log = orig; }
  };
  const first = await go(['build', '--ticket', '1']);
  assert.equal(first.out.key, '1-build');
  assert.equal(first.out.tier, 'deep'); // metadata.tier
  assert.deepEqual((await go(['build', '--ticket', '1'])).out.skipped, true);
  assert.equal((await go(['review/review', '--ticket', '1'])).out.kind, 'harness'); // another skill is another key
  // A finished run never blocks: after its done line, a re-run inside the window starts.
  await board.comment('1', '<!-- agentic-sdlc:done 1-review/review -->');
  assert.equal((await go(['review/review', '--ticket', '1'])).out.kind, 'harness');
  const cr = await go(['learn/improve', '--cr', '9']);
  assert.equal(cr.out.key, '9-learn/improve-crsha');
  assert.match((await board.comments('2'))[0].body, /^<!-- agentic-sdlc:dispatch 9-learn\/improve-crsha -->/);
  assert.equal((await go(['learn/improve', '--cr', '9'])).out.skipped, true);
  const factory = await go(['learn/improve']);
  assert.equal(factory.out.key, 'factory-learn/improve');
  assert.equal((await go(['learn/improve'])).out.skipped, true);
  // An untrusted author's marker never skips.
  b.owners = { bots: ['someone-else'] };
  assert.equal((await go(['build', '--ticket', '1'])).out.kind, 'harness');
});

test('dispatch: an unfinished run blocks until stall_minutes; only its own done line ends it; sdlc only claims; a failed start writes the done line', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { createLocalBoard } = await import('../src/board/local.ts');
  const root = mkdtempSync(join(tmpdir(), 'disp2-'));
  writePack(join(root, '.agents', 'skills'), packFiles());
  const b = { ...binding, cycle: { dedupe_minutes: 0.0001 }, stall_minutes: 60, owners: { bots: ['local'] }, heartbeat: { ticket: '2' }, forge: { adapter: 'github', options: {} }, models: { fast: 'f', balanced: 'b', deep: 'd' }, executors: { default: { kind: 'harness' }, 'plan/triage': { kind: 'webhook', url_env: 'NOPE' } } } as any;
  const board = createLocalBoard({ root, binding: b, options: {}, env: {}, exec: () => '', http: async () => ({}) });
  await board.create({ title: 't', body: '', status: 'Ready' });
  await board.create({ title: 'heartbeat', body: '', status: 'Backlog' });
  const go = async (argv: string[]) => {
    const f = fakeCtx(root, {}, () => '{}');
    f.ctx.binding = b;
    const log: string[] = [];
    const orig = console.log, err = console.error; console.log = (s: string) => log.push(s); console.error = () => {};
    try { return { code: await cli(argv, f.ctx), out: log[0] ? JSON.parse(log[0]) : undefined }; } finally { console.log = orig; console.error = err; }
  };
  const first = await go(['build', '--ticket', '1']);
  await new Promise((r) => setTimeout(r, 20)); // past the double-fire window
  const again = await go(['build', '--ticket', '1']);
  assert.equal(again.out.reason, 'the previous run has not finished');
  await board.comment('1', 'a closing comment of another run');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await go(['build', '--ticket', '1'])).out.reason, 'the previous run has not finished'); // only its own done line ends it
  await board.comment('1', `${first.out.done}\ndone`);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await go(['build', '--ticket', '1'])).out.kind, 'harness');
  assert.equal((await go(['sdlc', '--ticket', '2', '--unattended'])).out.kind, 'claim'); // a claim passes no executor check
  // On the heartbeat ticket another run's comment does not end learn/improve; its done line does.
  const imp = await go(['learn/improve']);
  await new Promise((r) => setTimeout(r, 20));
  await board.comment('2', '<!-- heartbeat -->\nanother run');
  assert.equal((await go(['learn/improve'])).out.reason, 'the previous run has not finished');
  await board.comment('2', imp.out.done);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await go(['learn/improve'])).out.kind, 'harness');
  assert.equal((await go(['plan/triage', '--ticket', '1'])).code, 1); // webhook env var unset: the start fails
  assert.ok((await board.comments('1')).some((c) => c.body.startsWith('<!-- agentic-sdlc:done 1-plan/triage -->')));
});

test('dispatch: overlapping cycles on one key start one run; flags are checked; an unreadable time fails closed; the log dir is private', async () => {
  const { mkdtempSync, statSync } = await import('node:fs');
  const { createLocalBoard } = await import('../src/board/local.ts');
  const root = mkdtempSync(join(tmpdir(), 'disp3-'));
  writePack(join(root, '.agents', 'skills'), packFiles());
  const b = { ...binding, cycle: { dedupe_minutes: 10 }, owners: { bots: ['local'] }, heartbeat: { ticket: '2' }, models: { fast: 'f', balanced: 'b', deep: 'd' }, executors: { default: { kind: 'harness' } } } as any;
  const board = createLocalBoard({ root, binding: b, options: {}, env: {}, exec: () => '', http: async () => ({}) });
  await board.create({ title: 't', body: '', status: 'Ready' });
  await board.create({ title: 'heartbeat', body: '', status: 'Backlog' });
  const log: string[] = [];
  const orig = console.log, err = console.error; console.log = (s: string) => log.push(s); console.error = (s: string) => log.push(s);
  const go = (argv: string[]) => { const f = fakeCtx(root, {}, () => '{}'); f.ctx.binding = b; return cli(argv, f.ctx); };
  try {
    await Promise.all([go(['review/review', '--ticket', '1']), go(['review/review', '--ticket=1'])]);
    const outs = log.map((l) => JSON.parse(l));
    assert.equal(outs.filter((o) => o.skipped).length, 1, log.join('\n'));
    assert.equal(outs.filter((o) => o.kind === 'harness').length, 1);
    log.length = 0;
    assert.equal(await go(['review/review', '--ticket', '1', '--bogus', 'build']), 2);
    assert.match(log.join(), /unknown flag --bogus/);
    assert.equal(await go(['review/review', '--ticket']), 2);
  } finally { console.log = orig; console.error = err; }
  const r = await run({ default: { kind: 'command', run: 'bot' } }, ['ship', '--ticket', '5']);
  const mode = (p: string) => statSync(p).mode & 0o777;
  if (process.platform !== 'win32') {
    assert.equal(mode(join(tmpdir(), 'agentic-sdlc-runs')), 0o700);
    assert.equal(mode(r.out.log), 0o600);
  }
});

test('limits: a stage inherits executors.default caps and each executor kind is handed them', async () => {
  const ex = { default: { kind: 'harness', max_turns: 80, max_minutes: 20 }, ship: { kind: 'command', run: 'bot --max-turns {max_turns} --tokens {max_tokens}', max_tokens: 5000, max_turns: 30 } };
  const c = await run(ex, ['ship', '--ticket', '5']);
  assert.equal(c.cmd.replace(/^sh -c /, ''), `bot --max-turns ${quote('30')} --tokens ${quote('5000')}`);
  assert.deepEqual([c.childEnv.AGENTIC_SDLC_MAX_TURNS, c.childEnv.AGENTIC_SDLC_MAX_TOKENS, c.childEnv.AGENTIC_SDLC_MAX_MINUTES], ['30', '5000', '20']);
  assert.deepEqual(c.out.limits, { max_turns: 30, max_tokens: 5000, max_minutes: 20 });
  const unset = await run({ default: { kind: 'command', run: 'bot {max_turns}' } }, ['build', '--ticket', '5']);
  assert.equal(unset.cmd.replace(/^sh -c /, ''), `bot ${quote('')}`);
  assert.equal(unset.childEnv.AGENTIC_SDLC_MAX_TURNS, undefined);
  assert.equal(unset.out.limits, undefined);
  const h = await run(ex, ['build', '--ticket', '5']);
  assert.deepEqual(h.out.limits, { max_turns: 80, max_minutes: 20 });
  assert.match(h.out.instruction, /at most 80 turns, 20 minutes/);
  const w = await run({ default: { kind: 'webhook', url_env: 'U', max_turns: 9 } }, ['build', '--ticket', '1'], { U: 'https://h/x' });
  assert.match(w.calls[0], /"limits":\{"max_turns":9\}/);
  const m = await run({ default: { kind: 'managed', api: 'cursor', repo_url: 'https://r', token_env: 'T', max_tokens: 700 } }, ['build', '--ticket', '1'], { T: 't' });
  assert.match(m.calls[0], /at most 700 tokens/);
});

test('validateBinding: executor caps and cycle.max_tokens_per_ticket are positive integers; bench_budget knows runs and minutes only', async () => {
  const { validateBinding } = await import('../src/binding.ts');
  const msgs = (extra: object) => validateBinding({ ...binding, ...extra } as any).join('\n');
  assert.match(msgs({ executors: { default: { kind: 'harness', max_turns: 0 } } }), /executors\.default\.max_turns must be a positive integer/);
  assert.match(msgs({ executors: { default: { kind: 'harness', max_minutes: 1.5 } } }), /max_minutes must be a positive integer/);
  assert.match(msgs({ cycle: { ...binding.cycle, max_tokens_per_ticket: -1 } }), /cycle\.max_tokens_per_ticket must be a positive integer/);
  assert.match(msgs({ learning: { ...binding.learning, bench_budget: { max_tokens: 5 } } }), /bench_budget\.max_tokens is not a bench cap/);
  assert.match(msgs({ learning: { ...binding.learning, bench_budget: { max_runs: 'build' } } }), /bench_budget\.max_runs must be a positive integer/);
  const ok = msgs({ executors: { default: { kind: 'harness', max_turns: 5 } }, cycle: { ...binding.cycle, max_tokens_per_ticket: 9 }, learning: { ...binding.learning, bench_budget: { max_runs: 4, max_minutes: 9 } } });
  assert.doesNotMatch(ok, /max_turns|max_tokens_per_ticket|bench_budget/);
});

test('dispatch takes step ids: an unknown id or a bare multi-step skill is a usage error listing the valid ids; the task names the step file', async () => {
  const f = fakeCtx(PACK, {}, () => ({}));
  f.ctx.binding = { ...binding } as any;
  const err: string[] = [];
  const e = console.error; console.error = (m: string) => err.push(m);
  try {
    assert.equal(await cli(['plan', '--ticket', '1'], f.ctx), 2);
    assert.equal(await cli(['nope', '--ticket', '1'], f.ctx), 2);
  } finally { console.error = e; }
  assert.match(err[0], /unknown step 'plan'.*valid ids: .*build.*plan\/shape.*review\/verify/);
  const h = await run({ default: { kind: 'harness' } }, ['plan/shape', '--ticket', '1']);
  assert.match(h.out.instruction, /\.agents\/skills\/sdlc-plan\/steps\/shape\.md in a subagent at tier deep/);
  assert.equal(h.out.tier, 'deep');
  const c = await run({ default: { kind: 'command', run: 'bot {skill}' }, 'plan/shape': { kind: 'command', run: 'shape-bot {skill}' } }, ['plan/shape', '--ticket', '1']);
  assert.match(c.cmd, /shape-bot/);
});

test('executors resolve per step: skill/step, then skill, then default; an old skill name counts as its step', async () => {
  const ex = { default: { kind: 'command', run: 'dflt' }, plan: { kind: 'command', run: 'whole-skill' }, 'plan/shape': { kind: 'command', run: 'one-step' }, 'review-pr': { kind: 'command', run: 'old-name' } };
  assert.match((await run(ex, ['plan/shape', '--ticket', '1'])).cmd, /one-step/);
  assert.match((await run(ex, ['plan/groom', '--ticket', '1'])).cmd, /whole-skill/);
  assert.match((await run(ex, ['review/review', '--cr', '1'])).cmd, /old-name/);
  assert.match((await run(ex, ['build', '--ticket', '1'])).cmd, /dflt/);
});

test('review/review: outside the review runtime a review identity fires the review run; inside it and without an identity it is an ordinary step', async () => {
  const fire = 'curl -fsS -X POST https://x/fire -H "Authorization: Bearer $REVIEW_FIRE_TOKEN"';
  const env = { AGENTIC_REVIEW_FIRE_CMD: fire, REVIEW_FIRE_TOKEN: 't', AGENTIC_REVIEW_TOKEN: 'secret', PATH: '/bin' };
  const two = { forge: { review_identity: 'rev-bot' } };
  const r = await run({ default: { kind: 'harness' } }, ['review/review', '--cr', '3', '--unattended'], env, undefined, two);
  assert.equal(r.out.kind, 'fire');
  assert.equal(r.out.via, 'review-runtime');
  assert.equal(r.out.key, '3-review/review');
  assert.match(r.cmd, /https:\/\/x\/fire/);
  assert.equal(r.childEnv.REVIEW_FIRE_TOKEN, 't');
  assert.equal(r.childEnv.AGENTIC_REVIEW_TOKEN, undefined);
  const jobs = await run({ default: { kind: 'harness' } }, ['review/review', '--cr', '3'], {}, undefined, two);
  assert.equal(jobs.out.kind, 'fire', 'no fire command: the runner\'s job dependency starts it');
  assert.equal(jobs.out.via, 'job-dependency');
  assert.equal(jobs.cmd, '', 'nothing is started here');
  const inside = await run({ default: { kind: 'harness' } }, ['review/review', '--cr', '3'], { ...env, AGENTIC_SDLC_ROLE: 'review' }, undefined, two);
  assert.equal(inside.out.kind, 'harness');
  assert.equal(inside.out.via, 'executor');
  assert.equal(inside.cmd, '');
  const one = await run({ default: { kind: 'harness' } }, ['review/review', '--cr', '3'], env, undefined, { forge: { review_identity: '' } });
  assert.equal(one.out.kind, 'harness');
  assert.equal(one.out.via, 'executor');
  const own = await run({ default: { kind: 'harness' }, 'review/review': { kind: 'command', run: 'mine' } }, ['review/review', '--cr', '3'], env, undefined, two);
  assert.match(own.cmd, /mine/);
  assert.equal(own.out.kind, 'command');
});

test('dispatch prints the done-line key even with no dedupe window, and posts no dispatch comment then', async () => {
  const r = await run({ default: { kind: 'harness' } }, ['plan/shape', '--ticket', '9']);
  assert.equal(r.out.key, '9-plan/shape');
  assert.equal(r.out.done, '<!-- agentic-sdlc:done 9-plan/shape -->');
  assert.match(r.out.instruction, /<!-- agentic-sdlc:done 9-plan\/shape -->/);
  assert.deepEqual(r.calls, []);
});

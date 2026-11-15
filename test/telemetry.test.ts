import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cdEventsFromRuns, changeMergedEvent, deployEvent, emitGateEvent, otlpTraces, parseHeaders, sendCdEvent, sendOtlp, sinkOf, spanId, traceId, GENAI, CDEVENTS } from '../src/telemetry.ts';
import { cli as ledgerCli, cycleMeta, exportRows } from '../src/ledger.ts';
import { cli as gateCli } from '../src/gates.ts';
import { validateBinding } from '../src/binding.ts';
import type { Comment } from '../src/ports.ts';

const binding = {
  forge: { adapter: 'github', options: { repo: 'acme/app' } },
  telemetry: { otlp_endpoint_env: 'OTLP', cdevents_sink_env: 'SINK', headers_env: 'HDRS' },
} as any;
const env = { OTLP: 'https://otel.example/', SINK: 'https://sink.example/events', HDRS: 'authorization=Bearer a=b,x-team=core' };

const hb = {
  at: '2026-11-08T10:00:00Z', factory: 'f00dfeed',
  runs: [
    { id: 'r1', at: '2026-11-08T09:30:00Z', skill: 'implement-spec', skillHash: 'abc123', ticket: '7', cr: '12', tier: 'balanced', model: 'm1', executor: 'command', ref: 'bot-1', tokens: 1200, minutes: 6, outcome: 'done', score: 4, scores: { 'done-conditions': 4, 'scope-creep': 'pass' } },
    { id: 'r2', at: '2026-11-08T09:45:00Z', skill: 'review-pr', skillHash: 'def456', ticket: '7', cr: '12', tier: 'fast', model: '', outcome: 'done' },
    { id: 'r3', at: '2026-11-08T09:50:00Z', skill: 'implement-spec', skillHash: 'abc123', ticket: '8', cr: '13', tier: 'balanced', model: 'm1', minutes: 2, outcome: 'failed', error: 'fast_check red' },
  ],
};
const comments: Comment[] = [{ id: 'c1', author: 'bot', createdAt: '2026-11-08T10:00:00Z', body: `<!-- heartbeat -->\n\`\`\`json\n${JSON.stringify(hb)}\n\`\`\`` }];
const rows = exportRows(comments);
const meta = cycleMeta(comments);
const attr = (s: any, k: string) => s.attributes.find((a: any) => a.key === k)?.value;

test('otlpTraces: one trace per heartbeat, a workflow root and one invoke_agent span per run, with the GenAI attribute names', () => {
  const doc = otlpTraces(rows, meta, { version: '1.2.3', repo: 'acme/app' });
  assert.deepEqual(doc.resourceSpans[0].resource.attributes, [
    { key: 'service.name', value: { stringValue: 'agentic-sdlc' } },
    { key: 'service.version', value: { stringValue: '1.2.3' } },
    { key: 'agentic_sdlc.repo', value: { stringValue: 'acme/app' } },
  ]);
  const scope = doc.resourceSpans[0].scopeSpans[0];
  assert.deepEqual(scope.scope, { name: 'agentic-sdlc', version: '1.2.3' });
  assert.equal(scope.schemaUrl, GENAI.schemaUrl);
  const [root, s1, s2, s3] = scope.spans as any[];
  assert.equal(root.name, 'invoke_workflow sdlc');
  assert.equal(root.parentSpanId, undefined);
  assert.equal(attr(root, 'gen_ai.operation.name').stringValue, 'invoke_workflow');
  assert.equal(attr(root, 'agentic_sdlc.factory').stringValue, 'f00dfeed');
  assert.equal(new Set(scope.spans.map((s: any) => s.traceId)).size, 1);
  assert.match(root.traceId, /^[0-9a-f]{32}$/);
  assert.match(s1.spanId, /^[0-9a-f]{16}$/);
  assert.equal(s1.parentSpanId, root.spanId);
  assert.equal(s1.name, 'invoke_agent implement-spec');
  assert.equal(s1.kind, 1);
  // 09:30 is the end of the run; 6 minutes before it is the start. Times are decimal strings of nanoseconds.
  assert.equal(s1.endTimeUnixNano, String(Date.parse('2026-11-08T09:30:00Z')) + '000000');
  assert.equal(s1.startTimeUnixNano, String(Date.parse('2026-11-08T09:24:00Z')) + '000000');
  assert.deepEqual(s1.attributes, [
    { key: 'gen_ai.operation.name', value: { stringValue: 'invoke_agent' } },
    { key: 'gen_ai.agent.name', value: { stringValue: 'implement-spec' } },
    { key: 'gen_ai.agent.version', value: { stringValue: 'abc123' } },
    { key: 'gen_ai.request.model', value: { stringValue: 'm1' } },
    { key: 'agentic_sdlc.run.id', value: { stringValue: 'r1' } },
    { key: 'agentic_sdlc.ticket', value: { stringValue: '7' } },
    { key: 'agentic_sdlc.cr', value: { stringValue: '12' } },
    { key: 'agentic_sdlc.tier', value: { stringValue: 'balanced' } },
    { key: 'agentic_sdlc.executor', value: { stringValue: 'command' } },
    { key: 'agentic_sdlc.ref', value: { stringValue: 'bot-1' } },
    { key: 'agentic_sdlc.tokens', value: { intValue: '1200' } },
    { key: 'agentic_sdlc.minutes', value: { intValue: '6' } },
    { key: 'agentic_sdlc.outcome', value: { stringValue: 'done' } },
    { key: 'agentic_sdlc.score', value: { intValue: '4' } },
  ]);
  // The row has one token total: no gen_ai.usage.* attribute is invented.
  assert.ok(!s1.attributes.some((a: any) => a.key.startsWith('gen_ai.usage')));
  assert.equal(s1.status, undefined);
  assert.deepEqual(s1.events.map((e: any) => [e.name, e.attributes]), [
    ['gen_ai.evaluation.result', [{ key: 'gen_ai.evaluation.name', value: { stringValue: 'done-conditions' } }, { key: 'gen_ai.evaluation.score.value', value: { intValue: '4' } }]],
    ['gen_ai.evaluation.result', [{ key: 'gen_ai.evaluation.name', value: { stringValue: 'scope-creep' } }, { key: 'gen_ai.evaluation.score.label', value: { stringValue: 'pass' } }]],
  ]);
  // An empty model is left out; a failed run is an error span with error.type.
  assert.equal(attr(s2, 'gen_ai.request.model'), undefined);
  assert.equal(attr(s2, 'agentic_sdlc.executor').stringValue, 'harness');
  assert.equal(attr(s3, 'error.type').stringValue, 'failed');
  assert.deepEqual(s3.status, { code: 2, message: 'fast_check red' });
});

test('otlpTraces: ids are a hash of the cycle and run ids, so a re-export is the same document', () => {
  const a = JSON.stringify(otlpTraces(rows, meta, { version: '1' }));
  const b = JSON.stringify(otlpTraces([...rows].reverse(), meta, { version: '1' }));
  assert.equal(a, b);
  assert.equal(traceId('c1'), traceId('c1'));
  assert.notEqual(traceId('c1'), traceId('c2'));
  assert.notEqual(spanId('run:r1'), spanId('run:r2'));
  const spans = otlpTraces(rows, meta, { version: '1' }).resourceSpans[0].scopeSpans[0].spans as any[];
  assert.equal(spans[1].spanId, spanId('run:r1'));
  assert.equal(spans[0].traceId, traceId('c1'));
});

test('exportRows: --since takes days or an ISO time and --run names one run', () => {
  assert.deepEqual(exportRows(comments, { since: Date.parse('2026-11-08T09:40:00Z') }).map((r) => r.id), ['r2', 'r3']);
  assert.deepEqual(exportRows(comments, { run: 'r1' }).map((r) => r.id), ['r1']);
});

test('cdEventsFromRuns: taskrun finished per run, change created once per CR, change reviewed for a done review', () => {
  const evs = cdEventsFromRuns(rows, meta, binding);
  assert.deepEqual(evs.map((e) => [e.context.type, e.subject.id]), [
    ['dev.cdevents.taskrun.finished.0.3.0', 'r1'],
    ['dev.cdevents.change.created.0.4.0', '12'],
    ['dev.cdevents.taskrun.finished.0.3.0', 'r2'],
    ['dev.cdevents.change.reviewed.0.3.0', '12'],
    ['dev.cdevents.taskrun.finished.0.3.0', 'r3'],
    ['dev.cdevents.change.created.0.4.0', '13'],
  ]);
  assert.deepEqual(evs[0], {
    context: { specversion: '0.5.1', id: evs[0].context.id, source: 'https://github.com/acme/app', type: CDEVENTS.type.taskrunFinished, timestamp: '2026-11-08T09:30:00.000Z' },
    subject: { id: 'r1', content: { taskName: 'implement-spec', outcome: 'success', pipelineRun: { id: 'c1' } } },
  });
  assert.deepEqual(evs[1].subject.content, { repository: { id: 'acme/app', source: 'https://github.com/acme/app' } });
  assert.deepEqual(evs[4].subject.content, { taskName: 'implement-spec', outcome: 'failure', errors: 'fast_check red', pipelineRun: { id: 'c1' } });
  assert.match(evs[0].context.id, /^[0-9a-f]{32}$/);
  assert.deepEqual(cdEventsFromRuns(rows, meta, binding).map((e) => e.context.id), evs.map((e) => e.context.id));
});

test('deployEvent: service deployed or rolledback with the environment and a generic purl; nothing true to say otherwise', () => {
  const ok: any = deployEvent(binding, { env: 'production', sha: 'abc', result: 'success', version: '2026.11.1', at: '2026-11-08T11:00:00Z' });
  assert.equal(ok.context.type, 'dev.cdevents.service.deployed.0.3.0');
  assert.equal(ok.context.timestamp, '2026-11-08T11:00:00.000Z');
  assert.deepEqual(ok.subject, { id: 'service/app', content: { environment: { id: 'production' }, artifactId: 'pkg:generic/acme/app@2026.11.1' } });
  const back: any = deployEvent(binding, { env: 'staging', sha: 'abc123', result: 'rolled-back', at: 1 });
  assert.equal(back.context.type, 'dev.cdevents.service.rolledback.0.3.0');
  assert.equal(back.subject.content.artifactId, 'pkg:generic/acme/app@abc123');
  assert.match((deployEvent(binding, { env: 'staging', sha: 'a', result: 'failure' }) as any).skip, /no CDEvents event/);
  assert.match((deployEvent({ ...binding, forge: { adapter: 'github', options: {} } }, { env: 'staging', sha: 'a', result: 'success' }) as any).skip, /forge.options.repo is unset/);
  const m = changeMergedEvent(binding, { cr: '12', sha: 'abc', at: '2026-11-08T11:00:00Z' });
  assert.equal(m.context.type, 'dev.cdevents.change.merged.0.3.0');
  assert.deepEqual(m.subject, { id: '12', content: { repository: { id: 'acme/app', source: 'https://github.com/acme/app' } } });
});

test('delivery: nothing is sent unless the binding names the env vars; headers come from headers_env', async () => {
  const calls: any[] = [];
  const http: any = async (...a: any[]) => { calls.push(a); return {}; };
  assert.equal(sinkOf({ forge: binding.forge } as any, env, 'otlp'), undefined);
  assert.equal(await emitGateEvent({ binding: { forge: binding.forge } as any, env, http }, changeMergedEvent(binding, { cr: '1', sha: 's' })), false);
  assert.equal(calls.length, 0);
  await assert.rejects(sendOtlp({ binding: { forge: binding.forge } as any, env, http }, {}), /otlp_endpoint_env is unset/);
  assert.deepEqual(parseHeaders('authorization=Bearer a=b, x-team=core'), { authorization: 'Bearer a=b', 'x-team': 'core' });
  assert.throws(() => sinkOf(binding, {}, 'otlp'), /env var OTLP is empty/);
});

test('delivery: OTLP posts to <endpoint>/v1/traces and a CDEvent as a CloudEvents binary request', async () => {
  const calls: any[] = [];
  const http: any = async (...a: any[]) => { calls.push(a); return {}; };
  await sendOtlp({ binding, env, http }, { resourceSpans: [] });
  assert.deepEqual(calls[0], ['POST', 'https://otel.example/v1/traces', { headers: { authorization: 'Bearer a=b', 'x-team': 'core' }, body: { resourceSpans: [] } }]);
  const ev = changeMergedEvent(binding, { cr: '12', sha: 'abc', at: '2026-11-08T11:00:00Z' });
  await sendCdEvent({ binding, env, http }, ev);
  const [method, url, o] = calls[1];
  assert.equal(method, 'POST');
  assert.equal(url, 'https://sink.example/events');
  assert.deepEqual(o.headers, { 'ce-specversion': '1.0', 'ce-id': ev.context.id, 'ce-source': 'https://github.com/acme/app', 'ce-type': 'dev.cdevents.change.merged.0.3.0', 'ce-time': '2026-11-08T11:00:00.000Z', 'ce-subject': '12', authorization: 'Bearer a=b', 'x-team': 'core' });
  assert.equal(o.body, ev);
  await assert.rejects(sendOtlp({ binding, env, http: async () => ({ partialSuccess: { rejectedSpans: 2, errorMessage: 'bad' } }) }, {}), /rejected 2 span/);
});

test('emitGateEvent: a failed send writes one line and never throws', async () => {
  const lines: string[] = [];
  const http: any = async () => { throw new Error('POST sink.example -> 503: down\nsecond line'); };
  const ev = changeMergedEvent(binding, { cr: '1', sha: 's' });
  assert.equal(await emitGateEvent({ binding, env, http }, ev, (l) => lines.push(l)), false);
  assert.deepEqual(lines, ['telemetry: CDEvent not sent: POST sink.example -> 503: down']);
  assert.equal(await emitGateEvent({ binding, env: {}, http }, ev, (l) => lines.push(l)), false);
  assert.equal(lines.length, 2);
  assert.equal(await emitGateEvent({ binding, env, http }, { skip: 'no repo' }, (l) => lines.push(l)), false);
  assert.match(lines[2], /no repo/);
});

/** Runs `fn` with stdout and stderr captured. */
async function captured<T>(fn: () => Promise<T>) {
  const out: string[] = [], err: string[] = [];
  const w = process.stdout.write, e = process.stderr.write, log = console.log, cerr = console.error;
  process.stdout.write = ((s: string) => (out.push(String(s)), true)) as any;
  process.stderr.write = ((s: string) => (err.push(String(s)), true)) as any;
  console.log = (s: string) => out.push(`${s}\n`);
  console.error = (s: string) => err.push(`${s}\n`);
  try { return { result: await fn(), out: out.join(''), err: err.join('') }; }
  finally { process.stdout.write = w; process.stderr.write = e; console.log = log; console.error = cerr; }
}

const gateBinding = {
  board: { adapter: 'local', options: {}, statuses: ['Backlog', 'In review', 'Done', 'Signals'], done_statuses: ['Done'], labels: { human: 'needs-human' } },
  forge: { adapter: 'github', options: { repo: 'acme/app' } },
  vcs: { adapter: 'git', trunk: 'main', release_prefix: 'release/', tag_prefix: 'v' },
  product: { environments: ['staging', 'production'] },
  telemetry: binding.telemetry,
} as any;

test('gate shipped: a deploy posts one service CDEvent, and a failing sink does not fail the gate', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tel-'));
  const calls: any[] = [];
  let fail = false;
  const http: any = async (...a: any[]) => { calls.push(a); if (fail) throw new Error('POST sink.example -> 500: down'); return {}; };
  const ctx: any = { root, binding: gateBinding, env, exec: () => '', http };
  const run = (a: string[]) => captured(() => gateCli(a, ctx));
  const ok = await run(['shipped', 'staging', '--sha', 'abc', '--result', 'success', '--version', '1.0']);
  assert.equal(ok.result, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].headers['ce-type'], 'dev.cdevents.service.deployed.0.3.0');
  assert.equal(calls[0][2].body.subject.content.artifactId, 'pkg:generic/acme/app@1.0');
  fail = true;
  const bad = await run(['shipped', 'staging', '--sha', 'abc', '--result', 'rolled-back']);
  assert.equal(bad.result, 0);
  assert.match(bad.err, /^telemetry: CDEvent not sent: POST sink.example -> 500: down\n$/);
  assert.equal(JSON.parse(bad.out).result, 'rolled-back');
  calls.length = 0;
  const failed = await run(['shipped', 'staging', '--sha', 'abc', '--result', 'failure']);
  assert.equal(failed.result, 0);
  assert.equal(calls.length, 0);
  const none = await captured(() => gateCli(['shipped', 'staging', '--sha', 'abc', '--result', 'success'], { ...ctx, binding: { ...gateBinding, telemetry: undefined } }));
  assert.equal(none.result, 0);
  assert.equal(calls.length, 0);
  assert.equal(none.err, '');
});

test('ledger export: otlp and cdevents print to stdout, write --out, and --send posts through ctx.http', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tel-'));
  const { createLocalBoard } = await import('../src/board/local.ts');
  const calls: any[] = [];
  const http: any = async (...a: any[]) => { calls.push(a); return {}; };
  const b = { ...gateBinding, heartbeat: { ticket: '1' }, owners: { bots: ['local'] }, learning: {} };
  const ctx: any = { root, binding: b, env, exec: () => '', http };
  const board = createLocalBoard({ ...ctx, options: {} });
  await board.create({ title: 'heartbeat', body: '', status: 'Backlog' });
  await board.comment('1', comments[0].body);
  const run = (a: string[]) => captured(() => ledgerCli(a, ctx));
  const o = await run(['export', '--format', 'otlp']);
  assert.equal(o.result, 0);
  const doc = JSON.parse(o.out);
  assert.equal(doc.resourceSpans[0].scopeSpans[0].spans.length, 4);
  assert.equal(doc.resourceSpans[0].resource.attributes[0].value.stringValue, 'agentic-sdlc');
  assert.equal(calls.length, 0);
  assert.equal((await run(['export', '--format', 'otlp', '--out', 'o.json'])).out, '');
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'o.json'), 'utf8')), doc);
  const c = await run(['export', '--format', 'cdevents', '--run', 'r1']);
  assert.deepEqual(c.out.trim().split('\n').map((l) => JSON.parse(l).context.type), ['dev.cdevents.taskrun.finished.0.3.0', 'dev.cdevents.change.created.0.4.0']);
  const s = await run(['export', '--format', 'otlp', '--send']);
  assert.equal(s.result, 0);
  assert.equal(calls[0][1], 'https://otel.example/v1/traces');
  const sc = await run(['export', '--format', 'cdevents', '--send', '--since', '2026-11-08T09:40:00Z']);
  assert.equal(sc.result, 0);
  assert.equal(calls.length, 1 + 4);
  assert.equal((await run(['export', '--format', 'otlp', '--send'])).result, 0);
  assert.equal((await captured(() => ledgerCli(['export', '--format', 'otlp', '--send'], { ...ctx, binding: { ...b, telemetry: undefined } }))).result, 1);
  assert.equal((await run(['export'])).result, 2);
  assert.equal((await run(['export', '--format', 'otlp', '--since', 'x'])).result, 2);
});

test('validate: telemetry keys name env vars, never URLs', () => {
  const p = (t: unknown) => validateBinding({ telemetry: t } as any).filter((m) => m.startsWith('telemetry'));
  assert.deepEqual(p({ otlp_endpoint_env: 'OTEL_URL', cdevents_sink_env: 'SINK', headers_env: 'H' }), []);
  assert.match(p({ otlp_endpoint_env: 'https://otel.example' })[0], /NAME of an env var/);
  assert.match(p({ endpoint: 'X' })[0], /not a telemetry key/);
  assert.match(p([])[0], /telemetry must be/);
});

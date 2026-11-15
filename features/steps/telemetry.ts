// Telemetry: the OTLP document and the CDEvents of the run ledger (exported through the CLI), and the sends of the
// ledger and of the gates through a recording sink (the CLI modules run in-process with a fake http).
// State on w.state: requests (what the sink received: [method, url, { headers, body, tries, timeoutMs }]), sink (how it answers).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cli as gateCli } from '../../src/gates.ts';
import { cli as ledgerCli } from '../../src/ledger.ts';
import { GATE_TELEMETRY_DEADLINE_MS, GENAI, changeMergedEvent, emitGateEvent } from '../../src/telemetry.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { REPO, type World } from '../support/world.ts';
import { capture, pick } from './ledger.ts';

type Req = [string, string, { headers: Record<string, string>; body: unknown; tries?: number; timeoutMs?: number }];
type Sink = { fail?: string; never?: boolean; rejected?: number };
const requests = (w: World): Req[] => (w.state.requests ??= []);
const sink = (w: World): Sink => (w.state.sink ??= {});

// ---- the binding and the environment ----
Given('the telemetry variable {string} holds {string}', (w, name: string, value: string) => { w.env[name] = value; });
Given('the telemetry sinks are configured for the repository {string}', (w, repo: string) => {
  w.binding({
    forge: { adapter: 'github', options: { repo } },
    telemetry: { otlp_endpoint_env: 'OTLP', cdevents_sink_env: 'SINK', headers_env: 'HDRS' },
  });
  Object.assign(w.env, { OTLP: 'https://otel.example/', SINK: 'https://sink.example/events', HDRS: 'authorization=Bearer a=b,x-team=core' });
});
Given('the project ships to the environments {string}', (w, list: string) => w.binding({
  board: { statuses: ['Backlog', 'In review', 'Done', 'Signals'], done_statuses: ['Done'], labels: { human: 'needs-human' } },
  vcs: { adapter: 'git', trunk: 'main', release_prefix: 'release/', tag_prefix: 'v' },
  product: { environments: list.split(',').map((s) => s.trim()) },
}));

// ---- the sink ----
Given('the sink fails with {string}', (w, message: string) => { sink(w).fail = message.replace(/\\n/g, '\n'); });
Given('the sink never answers', (w) => { sink(w).never = true; });

const context = (w: World) => {
  const ctx = w.adapterContext();
  ctx.http = (async (method: string, url: string, o: Req[2]) => {
    requests(w).push([method, url, o]);
    const s = sink(w);
    if (s.never) return new Promise(() => {});
    if (s.fail) throw new Error(s.fail);
    return s.rejected ? { partialSuccess: { rejectedSpans: s.rejected, errorMessage: 'bad' } } : {};
  }) as typeof ctx.http;
  return ctx;
};

When('I run {string} against the recording sink', async (w, line: string) => {
  const [module, ...argv] = line.split(/\s+/);
  const cli = module === 'gate' ? gateCli : ledgerCli;
  const ctx = context(w);
  await capture(w, () => cli(argv, ctx));
});
When('the gate posts its change merged event and waits at most {int} ms', async (w, ms: number) => {
  const ctx = context(w);
  await capture(w, async () => { await emitGateEvent(ctx, changeMergedEvent(ctx.binding, { cr: '1', sha: 's' }), undefined, ms); return 0; });
});

Then('the sink received {int} requests', (w, n: number) => assert.equal(requests(w).length, n));
Then('request {int} was a POST to {string}', (w, n: number, url: string) => assert.deepEqual(requests(w)[n - 1].slice(0, 2), ['POST', url]));
Then('request {int} has these headers:', (w, n: number, t: DataTable) => {
  const h = requests(w)[n - 1][2].headers;
  for (const r of t.hashes()) assert.equal(h[r.header], r.value, r.header);
});
Then('the body of request {int} has these values:', (w, n: number, t: DataTable) => {
  for (const r of t.hashes()) assert.equal(String(pick(requests(w)[n - 1][2].body, r.path)), r.value, r.path);
});
Then('the sink was asked once, with one try and a limit of {int} ms', (w, ms: number) => {
  assert.equal(requests(w).length, 1);
  assert.deepEqual([requests(w)[0][2].tries, requests(w)[0][2].timeoutMs], [1, ms]);
});
Then('the gate waits at most 5000 ms for its telemetry', () => assert.equal(GATE_TELEMETRY_DEADLINE_MS, 5000));
Then('the error output is the single line {string}', (w, line: string) => assert.equal(w.last.stderr, `${line}\n`));
Then('the output shows none of {string}', (w, words: string) => {
  for (const x of words.split('|')) assert.ok(!w.last.output.includes(x), `the output shows "${x}":\n${w.last.output}`);
});
Then('nothing was printed', (w) => assert.equal(w.last.output, ''));

// ---- exporting twice, and a file ----
When('I note the printed document', (w) => { w.state.exported = w.last.stdout; });
Then('the printed document is the noted one', (w) => assert.equal(w.last.stdout, w.state.exported));
Then('the file {string} holds the document that was noted', (w, file: string) => assert.deepEqual(JSON.parse(w.read(file)), JSON.parse(w.state.exported)));

// ---- the OTLP document ----
type Span = { name: string; kind: number; traceId: string; spanId: string; parentSpanId?: string; startTimeUnixNano: string; endTimeUnixNano: string; attributes: { key: string; value: Record<string, string> }[]; events?: unknown[]; status?: unknown };
const spans = (w: World): Span[] => w.last.json().resourceSpans[0].scopeSpans[0].spans;
const attrOf = (s: Span, k: string) => s.attributes.find((a) => a.key === k)?.value;
const spanOf = (w: World, sel: string): Span => {
  const s = sel === 'workflow' ? spans(w)[0] : spans(w).find((x) => attrOf(x, 'agentic_sdlc.run.id')?.stringValue === sel);
  assert.ok(s, `no span of ${sel}`);
  return s;
};
const attrRows = (t: DataTable) => t.hashes().map((r) => ({ key: r.key, value: r.type === 'int' ? { intValue: r.value } : { stringValue: r.value } }));
const nanos = (iso: string) => `${Date.parse(iso)}000000`;

Then('the trace names the service {string} at the package version for the repository {string}', (w, name: string, repo: string) => {
  const version = JSON.parse(readFileSync(`${REPO}package.json`, 'utf8')).version;
  const r = w.last.json().resourceSpans[0];
  assert.deepEqual(r.resource.attributes, [
    { key: 'service.name', value: { stringValue: name } },
    { key: 'service.version', value: { stringValue: version } },
    { key: 'agentic_sdlc.repo', value: { stringValue: repo } },
  ]);
  assert.deepEqual(r.scopeSpans[0].scope, { name, version });
  assert.equal(r.scopeSpans[0].schemaUrl, GENAI.schemaUrl);
});
Then('there are {int} spans in one trace', (w, n: number) => {
  assert.equal(spans(w).length, n);
  assert.equal(new Set(spans(w).map((s) => s.traceId)).size, 1);
  assert.match(spans(w)[0].traceId, /^[0-9a-f]{32}$/);
  for (const s of spans(w)) assert.match(s.spanId, /^[0-9a-f]{16}$/);
});
Then('the span {string} is named {string}', (w, sel: string, name: string) => assert.equal(spanOf(w, sel).name, name));
Then('the span {string} is a child of the workflow span', (w, sel: string) => assert.equal(spanOf(w, sel).parentSpanId, spanOf(w, 'workflow').spanId));
Then('the workflow span has no parent', (w) => assert.equal(spanOf(w, 'workflow').parentSpanId, undefined));
Then('the span {string} is of kind {int}', (w, sel: string, kind: number) => assert.equal(spanOf(w, sel).kind, kind));
Then('the span {string} ran from {string} to {string}', (w, sel: string, from: string, to: string) => {
  assert.deepEqual([spanOf(w, sel).startTimeUnixNano, spanOf(w, sel).endTimeUnixNano], [nanos(from), nanos(to)]);
});
Then('the span {string} has exactly these attributes:', (w, sel: string, t: DataTable) => assert.deepEqual(spanOf(w, sel).attributes, attrRows(t)));
Then('the span {string} has these attributes:', (w, sel: string, t: DataTable) => {
  for (const a of attrRows(t)) assert.deepEqual(attrOf(spanOf(w, sel), a.key), a.value, a.key);
});
Then('the span {string} has no attribute {string}', (w, sel: string, key: string) => assert.equal(attrOf(spanOf(w, sel), key), undefined));
Then('the span {string} has no attribute starting with {string}', (w, sel: string, prefix: string) => assert.ok(!spanOf(w, sel).attributes.some((a) => a.key.startsWith(prefix))));
Then('the span {string} has no status', (w, sel: string) => assert.equal(spanOf(w, sel).status, undefined));
Then('the span {string} has the error status {string}', (w, sel: string, message: string) => assert.deepEqual(spanOf(w, sel).status, { code: 2, message }));
Then('the events of the span {string} are:', (w, sel: string, doc: string) => assert.deepEqual((spanOf(w, sel).events ?? []).map((e) => { const x = e as { name: string; attributes: unknown }; return [x.name, x.attributes]; }), JSON.parse(doc)));
When('I note the span id of {string}', (w, sel: string) => { w.state.spanId = spanOf(w, sel).spanId; });
Then('the span id of {string} is the noted one', (w, sel: string) => assert.equal(spanOf(w, sel).spanId, w.state.spanId));

// ---- the CDEvents, one JSON line each ----
const events = (w: World) => w.last.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
Then('the CDEvents printed are:', (w, t: DataTable) => assert.deepEqual(events(w).map((e) => ({ type: e.context.type, subject: e.subject.id })), t.hashes().map((r) => ({ type: r.type, subject: r.subject }))));
Then('CDEvent {int} has these values:', (w, n: number, t: DataTable) => {
  for (const r of t.hashes()) assert.equal(String(pick(events(w)[n - 1], r.path)), r.value, r.path);
});
Then('CDEvent {int} holds:', (w, n: number, doc: string) => assert.deepEqual(pick(events(w)[n - 1], 'subject'), JSON.parse(doc)));
Then('every CDEvent has an id of 32 hex digits', (w) => { for (const e of events(w)) assert.match(e.context.id, /^[0-9a-f]{32}$/); });

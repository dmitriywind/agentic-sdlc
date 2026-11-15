// Standard telemetry for runs and deploys: OpenTelemetry GenAI spans (OTLP/HTTP JSON) and CDEvents.
// Mechanism only, opt-in: nothing is sent unless the binding's `telemetry` names the env vars that hold the URLs.
import { createHash } from 'node:crypto';
import { scrubUrl } from './exec.ts';
import type { AdapterContext, Binding } from './ports.ts';
import type { LedgerRun } from './ledger.ts';

/**
 * Every name taken from a published convention, in one place so a rename is a one-line change.
 * OpenTelemetry GenAI semantic conventions (open-telemetry/semantic-conventions-genai, schema gen-ai-dev 1.42.0-dev):
 * stability `development`, so these names can still change. `error.type` is stable (semantic-conventions 1.45.0).
 */
export const GENAI = {
  schemaUrl: 'https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev',
  stability: 'development',
  attr: {
    operation: 'gen_ai.operation.name',
    agentName: 'gen_ai.agent.name',
    agentVersion: 'gen_ai.agent.version',
    requestModel: 'gen_ai.request.model',
    errorType: 'error.type',
  },
  op: { agent: 'invoke_agent', workflow: 'invoke_workflow' },
  event: { evaluation: 'gen_ai.evaluation.result' },
  evalAttr: { name: 'gen_ai.evaluation.name', value: 'gen_ai.evaluation.score.value', label: 'gen_ai.evaluation.score.label' },
} as const;

/** The factory's own attributes: nothing the convention defines. */
const NS = 'agentic_sdlc';
export const SCOPE_NAME = 'agentic-sdlc';
const SPAN_KIND_INTERNAL = 1;
const STATUS_ERROR = 2;

/** CDEvents (cdevents/spec v0.5.1; the 0.6.0-draft schemas carry the same event types). */
export const CDEVENTS = {
  specversion: '0.5.1',
  type: {
    changeCreated: 'dev.cdevents.change.created.0.4.0',
    changeReviewed: 'dev.cdevents.change.reviewed.0.3.0',
    changeMerged: 'dev.cdevents.change.merged.0.3.0',
    serviceDeployed: 'dev.cdevents.service.deployed.0.3.0',
    serviceRolledback: 'dev.cdevents.service.rolledback.0.3.0',
    taskrunFinished: 'dev.cdevents.taskrun.finished.0.3.0',
  },
} as const;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** Deterministic ids: the same input exports the same ids, so a re-export is idempotent at the receiver. */
export const traceId = (cycleKey: string) => sha256(`${NS}:trace:${cycleKey}`).slice(0, 32);
export const spanId = (key: string) => sha256(`${NS}:span:${key}`).slice(0, 16);

type Json = string | number | boolean;
const anyValue = (v: Json) =>
  typeof v === 'string' ? { stringValue: v }
  : typeof v === 'boolean' ? { boolValue: v }
  : Number.isInteger(v) ? { intValue: String(v) }
  : { doubleValue: v };
/** OTLP attributes from a plain object; undefined, null and empty strings are left out. */
const attrs = (o: Record<string, Json | undefined | null>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([key, v]) => ({ key, value: anyValue(v as Json) }));
const nano = (ms: number) => `${BigInt(Math.round(ms)) * 1000000n}`;

/** The heartbeat a run row came from. `key` identifies the cycle (the heartbeat comment id). */
export interface CycleMeta { key: string; at: string; kind: string; factory?: string }

export interface OtlpOptions { version: string; repo?: string }

/**
 * One OTLP/HTTP JSON trace document: one trace per heartbeat, a root `invoke_workflow` span for the cycle
 * and one `invoke_agent` span per run row. A row carries one `tokens` total, so no input/output split is
 * invented: the total is `agentic_sdlc.tokens`. The provider is not known, so `gen_ai.provider.name` is left out.
 */
export function otlpTraces(rows: LedgerRun[], meta: Map<string, CycleMeta>, o: OtlpOptions) {
  const cycles = new Map<string, { m: CycleMeta; rows: LedgerRun[] }>();
  for (const r of rows) {
    const m = meta.get(r.id) ?? { key: r.at, at: r.at, kind: 'cycle' };
    const c = cycles.get(m.key) ?? { m, rows: [] };
    c.rows.push(r);
    cycles.set(m.key, c);
  }
  const spans = [...cycles.values()].sort((a, b) => (a.m.at < b.m.at ? -1 : a.m.at > b.m.at ? 1 : a.m.key < b.m.key ? -1 : 1)).flatMap(({ m, rows: rs }) => {
    const trace = traceId(m.key);
    const root = spanId(`cycle:${m.key}`);
    rs = [...rs].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
    const times = rs.map((r) => { const end = Date.parse(r.at); return { start: end - (r.minutes ?? 0) * 60000, end }; });
    const cycleEnd = Math.max(Date.parse(m.at), ...times.map((t) => t.end));
    const cycleStart = Math.min(cycleEnd, ...times.map((t) => t.start));
    const out: any[] = [{
      traceId: trace, spanId: root, name: `${GENAI.op.workflow} sdlc`, kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: nano(cycleStart), endTimeUnixNano: nano(cycleEnd),
      attributes: attrs({ [GENAI.attr.operation]: GENAI.op.workflow, [GENAI.attr.agentName]: 'sdlc', [`${NS}.cycle.kind`]: m.kind, [`${NS}.factory`]: m.factory }),
    }];
    rs.forEach((r, i) => {
      const { start, end } = times[i];
      const failed = r.outcome !== 'done';
      const scores = Object.entries(r.scores ?? {});
      out.push({
        traceId: trace, spanId: spanId(`run:${r.id}`), parentSpanId: root,
        name: `${GENAI.op.agent} ${r.skill}`, kind: SPAN_KIND_INTERNAL,
        startTimeUnixNano: nano(start), endTimeUnixNano: nano(end),
        attributes: attrs({
          [GENAI.attr.operation]: GENAI.op.agent, [GENAI.attr.agentName]: r.skill, [GENAI.attr.agentVersion]: r.skillHash, [GENAI.attr.requestModel]: r.model,
          ...(failed ? { [GENAI.attr.errorType]: r.outcome } : {}),
          [`${NS}.run.id`]: r.id, [`${NS}.ticket`]: r.ticket, [`${NS}.cr`]: r.cr, [`${NS}.tier`]: r.tier, [`${NS}.executor`]: r.executor ?? 'harness',
          [`${NS}.ref`]: r.ref, [`${NS}.tokens`]: r.tokens, [`${NS}.minutes`]: r.minutes, [`${NS}.outcome`]: r.outcome, [`${NS}.score`]: r.score, [`${NS}.trace`]: r.trace,
        }),
        ...(scores.length ? { events: scores.map(([name, v]) => ({
          timeUnixNano: nano(end), name: GENAI.event.evaluation,
          attributes: attrs({ [GENAI.evalAttr.name]: name, ...(typeof v === 'number' ? { [GENAI.evalAttr.value]: v } : { [GENAI.evalAttr.label]: v }) }),
        })) } : {}),
        ...(failed ? { status: { code: STATUS_ERROR, ...(r.error ? { message: r.error.slice(0, 200) } : {}) } } : {}),
      });
    });
    return out;
  });
  return {
    resourceSpans: [{
      resource: { attributes: attrs({ 'service.name': SCOPE_NAME, 'service.version': o.version, [`${NS}.repo`]: o.repo }) },
      scopeSpans: [{ scope: { name: SCOPE_NAME, version: o.version }, schemaUrl: GENAI.schemaUrl, spans }],
    }],
  };
}

// ---- CDEvents ----------------------------------------------------------------------------

export interface CdEvent {
  context: { specversion: string; id: string; source: string; type: string; timestamp: string };
  subject: { id: string; content: Record<string, unknown> };
}

type Repo = { id: string; source?: string };
/** The repository the forge options name (`owner/name`); undefined when the binding leaves it to the git remote. */
export const repoOf = (b: Binding): string | undefined => {
  const r = (b.forge?.options as Record<string, unknown> | undefined)?.repo;
  return typeof r === 'string' && r ? r : undefined;
};
const repoRef = (b: Binding): Repo | undefined => {
  const id = repoOf(b);
  return id ? { id, ...(b.forge?.adapter === 'github' ? { source: `https://github.com/${id}` } : {}) } : undefined;
};
const sourceOf = (b: Binding) => repoRef(b)?.source ?? repoOf(b) ?? SCOPE_NAME;
const iso = (t: string | number) => new Date(t).toISOString();

const cd = (b: Binding, type: string, subject: string, at: string | number, discriminator: string, content: Record<string, unknown>): CdEvent => ({
  context: { specversion: CDEVENTS.specversion, id: sha256(`${type}\0${subject}\0${discriminator}`).slice(0, 32), source: sourceOf(b), type, timestamp: iso(at) },
  subject: { id: subject, content },
});

/** A run row's outcome as a CDEvents taskrun outcome (success | failure | cancel | error). */
const cdOutcome = (o: string) => (o === 'done' ? 'success' : o === 'timeout' || o === 'capped' ? 'cancel' : 'failure');

/**
 * CDEvents for the run rows: `taskrun.finished` per run, `change.reviewed` for a done `review/review` run on a CR and
 * `change.created` for the first `build` run per CR in the window. A row has no start time, no CR title
 * and no pipeline URI, so `taskrun.started`, `change.created.description` and `pipelinerun.*` are not emitted.
 */
export function cdEventsFromRuns(rows: LedgerRun[], meta: Map<string, CycleMeta>, b: Binding): CdEvent[] {
  const repo = repoRef(b);
  const sorted = [...rows].sort((a, z) => (a.at < z.at ? -1 : a.at > z.at ? 1 : a.id < z.id ? -1 : 1));
  const out: CdEvent[] = [];
  const created = new Set<string>();
  for (const r of sorted) {
    const cycle = meta.get(r.id)?.key;
    out.push(cd(b, CDEVENTS.type.taskrunFinished, r.id, r.at, r.id, {
      taskName: r.skill, outcome: cdOutcome(r.outcome), ...(r.outcome !== 'done' && r.error ? { errors: r.error } : {}), ...(cycle ? { pipelineRun: { id: cycle } } : {}),
    }));
    if (!r.cr) continue;
    if (r.skill === 'build' && !created.has(r.cr)) { created.add(r.cr); out.push(cd(b, CDEVENTS.type.changeCreated, r.cr, r.at, r.id, { ...(repo ? { repository: repo } : {}) })); }
    if (r.skill === 'review/review' && r.outcome === 'done') out.push(cd(b, CDEVENTS.type.changeReviewed, r.cr, r.at, r.id, { ...(repo ? { repository: repo } : {}) }));
  }
  return out;
}

/** `change.merged` for the merge gate: the CR merged at `sha` into the trunk. */
export const changeMergedEvent = (b: Binding, o: { cr: string; sha: string; at?: string | number }): CdEvent =>
  cd(b, CDEVENTS.type.changeMerged, o.cr, o.at ?? Date.now(), o.sha, { ...(repoRef(b) ? { repository: repoRef(b) } : {}) });

/**
 * `service.deployed` (success) or `service.rolledback` (rolled-back) for the shipped gate. A failed deploy has no
 * CDEvents event. The artifact is `pkg:generic/<repo>@<version or sha>` (the gate knows no package type);
 * without `forge.options.repo` the gate has no name for the service, so no event is built.
 */
export function deployEvent(b: Binding, o: { env: string; sha: string; result: string; version?: string; at?: string | number }): CdEvent | { skip: string } {
  if (o.result !== 'success' && o.result !== 'rolled-back') return { skip: `a ${o.result} deploy has no CDEvents event` };
  const repo = repoOf(b);
  if (!repo) return { skip: 'forge.options.repo is unset: the deployed service and artifact have no name' };
  const type = o.result === 'success' ? CDEVENTS.type.serviceDeployed : CDEVENTS.type.serviceRolledback;
  return cd(b, type, `service/${repo.split('/').pop()}`, o.at ?? Date.now(), `${o.env}\0${o.sha}\0${o.version ?? ''}`, {
    environment: { id: o.env },
    artifactId: `pkg:generic/${repo}@${encodeURIComponent(o.version ?? o.sha)}`,
  });
}

// ---- delivery ----------------------------------------------------------------------------

type Sink = { url: string; headers: Record<string, string> };

/** OTEL_EXPORTER_OTLP_HEADERS style: `name=value,name2=value2`. The value may hold `=`. */
export function parseHeaders(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split(',')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/**
 * The sink the binding names for `kind`, or undefined when its key is unset (nothing is sent).
 * Throws when the key is set but the env var it names is empty; the message names the variable, never a value.
 */
export function sinkOf(b: Binding, env: NodeJS.ProcessEnv, kind: 'otlp' | 'cdevents'): Sink | undefined {
  const t = b.telemetry;
  const name = kind === 'otlp' ? t?.otlp_endpoint_env : t?.cdevents_sink_env;
  if (!name) return undefined;
  const url = env[name];
  if (!url) throw new Error(`telemetry: env var ${name} is empty`);
  // The message names the variable only: the value may hold a secret.
  let u: URL;
  try { u = new URL(url); } catch { throw new Error(`telemetry: env var ${name} is not a valid http(s) URL`); }
  if (!/^https?:$/.test(u.protocol)) throw new Error(`telemetry: env var ${name} is not a valid http(s) URL`);
  if (u.username || u.password) throw new Error(`telemetry: env var ${name} must not hold credentials in the URL: use the headers variable`);
  const h = t?.headers_env ? env[t.headers_env] : undefined;
  return { url: kind === 'otlp' ? `${url.replace(/\/+$/, '')}/v1/traces` : url, headers: h ? parseHeaders(h) : {} };
}

type Net = Pick<AdapterContext, 'http' | 'env'> & { binding: Binding };

/** POSTs the OTLP document to `<endpoint>/v1/traces`. Throws on a failed request or rejected spans. */
export async function sendOtlp(ctx: Net, doc: unknown): Promise<void> {
  const s = sinkOf(ctx.binding, ctx.env, 'otlp');
  if (!s) throw new Error('telemetry.otlp_endpoint_env is unset in the binding: nothing to send to');
  const r = await ctx.http('POST', s.url, { headers: s.headers, body: doc });
  const n = Number(r?.partialSuccess?.rejectedSpans ?? 0);
  if (n > 0) throw new Error(`the OTLP endpoint rejected ${n} span(s): ${String(r.partialSuccess.errorMessage ?? '').slice(0, 200)}`);
}

/** POSTs one CDEvent as a CloudEvents HTTP binary-mode request (headers `ce-*`, the CDEvent as the JSON body). */
export async function sendCdEvent(ctx: Net, ev: CdEvent, send: { tries?: number; timeoutMs?: number } = {}): Promise<void> {
  const s = sinkOf(ctx.binding, ctx.env, 'cdevents');
  if (!s) throw new Error('telemetry.cdevents_sink_env is unset in the binding: nothing to send to');
  const c = ev.context;
  const headers = { 'ce-specversion': '1.0', 'ce-id': c.id, 'ce-source': c.source, 'ce-type': c.type, 'ce-time': c.timestamp, 'ce-subject': ev.subject.id, ...s.headers };
  await ctx.http('POST', s.url, { headers, body: ev, ...send });
}

/** The longest a gate waits for its telemetry, in total. */
export const GATE_TELEMETRY_DEADLINE_MS = 5000;

/**
 * Best-effort send from a gate: nothing happens when the sink is unset; a failure, a skipped event or the deadline
 * writes one line to `warn` and never throws, so a gate never fails on telemetry. One attempt, `deadlineMs` in total.
 * A message never carries the sink URL. Returns true when the event was sent.
 */
export async function emitGateEvent(ctx: Net, ev: CdEvent | { skip: string }, warn: (line: string) => void = (l) => process.stderr.write(`${l}\n`), deadlineMs = GATE_TELEMETRY_DEADLINE_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const name = ctx.binding.telemetry?.cdevents_sink_env;
    if (!name) return false;
    if ('skip' in ev) { warn(`telemetry: CDEvent not sent: ${ev.skip}`); return false; }
    const late = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`no answer within ${deadlineMs} ms`)), deadlineMs); });
    await Promise.race([sendCdEvent(ctx, ev, { tries: 1, timeoutMs: deadlineMs }), late]);
    return true;
  } catch (e) {
    const name = ctx.binding.telemetry?.cdevents_sink_env;
    warn(`telemetry: CDEvent not sent: ${scrubUrl((e as Error).message.split('\n')[0], name ? ctx.env[name] : undefined).slice(0, 200)}`);
    return false;
  } finally { clearTimeout(timer); }
}

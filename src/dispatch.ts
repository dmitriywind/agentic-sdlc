// agentic-sdlc dispatch <skill>[/<step>] [--ticket <id>] [--cr <n>] (at least one) [--run <id>] [--workdir <d>] [--run-model <id>] [--unattended]: start the step's executor.
import { spawn } from 'node:child_process';
import { chmodSync, closeSync, lstatSync, mkdirSync, mkdtempSync, openSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createBoard } from './board/index.ts';
import { fill } from './bench.ts';
import type { Binding, Board, Executor, Limits, McpServer, PortCli } from './ports.ts';
import { limitsOf, ownersFor } from './ports.ts';
import { isMarked, matches, stamp } from './comments.ts';
import { findStep, readSkills, skillOf } from './skills.ts';

const envOf = (env: NodeJS.ProcessEnv, name: string) => {
  const v = env[name];
  if (!v) throw new Error(`set the ${name} environment variable`);
  return v;
};

const TIERS = ['fast', 'balanced', 'deep'] as const;

/**
 * learn/judge's tier: binding.learning.judge_tier, stepped off the judged run's model so a model
 * never grades itself (next tier up; from deep, down). Every tier on that model: skip.
 */
export function judgeTier(b: Binding, runModel?: string): { tier: string; model: string } | { skip: true; reason: string } {
  if (!runModel) return { skip: true, reason: 'the judged run reported no model, so independence cannot be shown' };
  const want = b.learning?.judge_tier ?? 'fast';
  const i = TIERS.indexOf(want);
  const order = [want, ...TIERS.slice(i + 1), ...TIERS.slice(0, i).reverse()];
  const tier = order.find((t) => b.models[t] !== runModel);
  if (!tier) return { skip: true, reason: `every model tier is ${runModel}, the judged run's model; a model never grades its own run` };
  return { tier, model: b.models[tier] };
}

/** What a child process may inherit besides the stage's listed secrets. */
const BASE_ENV = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'ComSpec', 'PATHEXT', 'SystemDrive'];

/** Starts the command executor's detached child. Tests swap it with setSpawn. */
let spawnChild = spawn;
export const setSpawn = (f: typeof spawn) => { const prev = spawnChild; spawnChild = f; return prev; };

/** The stage's agent definition, resolved. Holds env var names, never their values. */
export interface Stage {
  mcps: Record<string, McpServer>;
  secrets: string[];
  sandbox?: string;
  model?: string;
}

export function resolveStage(b: Binding, ex: Executor, skillTier?: string, judgeModel?: string): Stage {
  const mcps: Record<string, McpServer> = {};
  for (const n of ex.mcps ?? []) {
    const m = b.mcps?.[n];
    if (!m) throw new Error(`mcp '${n}' is not in the binding's mcps`);
    mcps[n] = { ...(m.url ? { url: m.url } : {}), ...(m.command ? { command: m.command } : {}), ...(m.token_env ? { token_env: m.token_env } : {}) };
  }
  const tier = ex.model?.tier ?? skillTier;
  const model = judgeModel ?? ex.model?.id ?? (tier ? (b.models as Record<string, string> | undefined)?.[tier] : undefined);
  return { mcps, secrets: ex.secrets ?? [], sandbox: ex.sandbox ?? b.executors.default?.sandbox, model };
}

/** The review fire command runs with the cycle's environment (it holds the trigger's own token) minus the review token, which never leaves the review runtime. */
export function passEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  delete out.AGENTIC_REVIEW_TOKEN;
  return out;
}

/** The child's environment: a minimal base plus the listed secrets. */
export function childEnv(env: NodeJS.ProcessEnv, secrets: string[]): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of [...BASE_ENV, ...secrets]) {
    if (env[k] === undefined && secrets.includes(k)) throw new Error(`set the ${k} environment variable`);
    if (env[k] !== undefined) out[k] = env[k];
  }
  return out;
}

type Managed = Extract<Executor, { kind: 'managed' }>;
/** `skill` is the step id; `file` the step file to follow, relative to the project root. */
type Task = { skill: string; ticket: string; cr: string; file?: string; done?: string; run?: string; limits?: Limits };

const subject = (t: Task) => (t.ticket ? `ticket ${t.ticket}${t.cr ? ` (change request ${t.cr})` : ''}` : `change request ${t.cr}`);
/** The caps as one sentence for a task text, empty when none is set. */
export const limitsText = (l: Limits = {}): string => {
  const parts = [l.max_turns && `${l.max_turns} turns`, l.max_tokens && `${l.max_tokens} tokens`, l.max_minutes && `${l.max_minutes} minutes`].filter(Boolean);
  return parts.length ? ` Limits for this run: at most ${parts.join(', ')}; stop at the first one you reach.` : '';
};
const taskText = (t: Task) => `Run step ${t.skill} on ${subject(t)}. Load ${t.file ?? `.agents/skills/${t.skill}/SKILL.md`} first and follow it.${limitsText(t.limits)}${t.done ? ` Put the line ${t.done} in your closing comment.` : ''}${t.run ? ` Your run id is ${t.run}: end every commit you make with the trailer Agent-Run: ${t.run}.` : ''}`;

/** The review step: where it runs depends on the setup (see the `review/review` branch of `cli`). */
export const REVIEW_STEP = 'review/review';
/** The command that starts the separate review runtime's run (a trigger POST); the cycle's environment holds it. */
export const REVIEW_FIRE_ENV = 'AGENTIC_REVIEW_FIRE_CMD';

/**
 * The executor entry for a step: `executors.<skill>/<step>`, then `executors.<skill>`, then `executors.default`.
 */
export function executorFor(b: Binding, id: string): Executor {
  const by = new Map<string, Executor>();
  const keys = Object.keys(b.executors).filter((k) => k !== 'default');
  for (const k of keys) by.set(k, b.executors[k]);
  return by.get(id) ?? by.get(skillOf(id)) ?? b.executors.default;
}

/**
 * The one request that starts a managed run. Shapes follow each vendor's documented start-a-run call:
 * Claude Managed Agents POST /v1/sessions, Cursor Cloud Agents POST /v1/agents, Gemini Interactions for Antigravity.
 * ponytail: request fields only; polling, follow-ups and event streams are the vendor's, results come back via the board.
 */
export function managedRequest(ex: Managed, env: NodeJS.ProcessEnv, t: Task, model: string | undefined, stageBody: object):
  [string, string, { headers: Record<string, string>; body: unknown }] {
  const token = envOf(env, ex.token_env);
  const endpoint = (name: string | undefined, dflt: string) => (name ? envOf(env, name) : dflt).replace(/\/$/, '');
  const text = taskText(t);
  const api = ex.api ?? 'generic';
  if ((api === 'claude' || api === 'antigravity') && (t.skill === 'learn/judge' || ex.model)) {
    throw new Error(`managed api ${api} cannot pin a model; use harness, command or cursor for this stage`);
  }
  switch (api) {
    case 'claude':
      return ['POST', `${endpoint(ex.endpoint_env, 'https://api.anthropic.com')}/v1/sessions`, {
        headers: { 'x-api-key': token, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'managed-agents-2026-04-01' },
        body: {
          agent: envOf(env, need(ex.agent_env, 'agent_env')),
          environment_id: envOf(env, need(ex.environment_env, 'environment_env')),
          initial_events: [{ type: 'user.message', content: [{ type: 'text', text }] }],
        },
      }];
    case 'cursor':
      return ['POST', `${endpoint(ex.endpoint_env, 'https://api.cursor.com')}/v1/agents`, {
        headers: { authorization: `Bearer ${token}` },
        body: { prompt: { text }, repos: [{ url: need(ex.repo_url, 'repo_url') }], autoCreatePR: false, ...(model ? { model } : {}) },
      }];
    case 'antigravity':
      return ['POST', `${endpoint(ex.endpoint_env, 'https://generativelanguage.googleapis.com')}/v1beta/interactions`, {
        headers: { 'x-goog-api-key': token },
        body: { agent: ex.agent_env ? envOf(env, ex.agent_env) : 'antigravity-preview-09-2026', environment: 'remote', input: text, background: true },
      }];
    default:
      return ['POST', `${endpoint(need(ex.endpoint_env, 'endpoint_env'), '')}/sessions`, {
        headers: { authorization: `Bearer ${token}` },
        body: { agent: envOf(env, need(ex.agent_env, 'agent_env')), task: t, ...stageBody },
      }];
  }
}

const need = <T>(v: T | undefined, name: string): T => {
  if (v === undefined || v === '') throw new Error(`managed executor needs ${name}`);
  return v;
};

/** The flags `dispatch` takes. */
export const FLAGS = ['ticket', 'cr', 'workdir', 'run', 'run-model', 'unattended'];

export const cli: PortCli = async (argv, ctx) => {
  let onFail: (() => Promise<unknown>) | undefined;
  let sent = false;
  try {
    const f: Record<string, string> = {};
    const pos: string[] = [];
    const KNOWN = FLAGS;
    for (let i = 0; i < argv.length; i++) {
      if (!argv[i].startsWith('--')) { pos.push(argv[i]); continue; }
      const [name, inline] = argv[i].slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      if (!KNOWN.includes(name)) { console.error(`unknown flag --${name}`); return 2; }
      if (name === 'unattended') { f.unattended = '1'; continue; }
      const v = inline ?? argv[++i];
      if (v === undefined || (inline === undefined && v.startsWith('--'))) { console.error(`--${name} needs a value`); return 2; }
      f[name] = v;
    }
    const [arg] = pos;
    const usage = 'usage: agentic-sdlc dispatch <skill>[/<step>] [--ticket <id>] [--cr <n>] (at least one; none for learn/improve) [--run <id>] [--workdir <d>] [--run-model <id>] [--unattended]';
    if (!arg) { console.error(usage); return 2; }
    // The id names a step of the installed pack: `<skill>/<step>`, or the skill alone when it has one step.
    const pack = readSkills(join(ctx.root, '.agents', 'skills'));
    const step = findStep(pack, arg);
    if (!step) { console.error(`unknown step '${arg}'; ${pack.steps.length ? `valid ids: ${pack.steps.map((x) => x.id).join(', ')}` : '.agents/skills holds no steps: run agentic-sdlc init'}\n${usage}`); return 2; }
    const skill = step.id;
    // learn/improve works on the factory, not a ticket: its marker lives on the heartbeat ticket.
    if (!f.ticket && !f.cr && skill !== 'learn/improve') { console.error(usage); return 2; }
    const ticket = f.ticket ?? '', cr = f.cr ?? '', workdir = f.workdir ?? ctx.root;
    const b = ctx.binding;
    const file = relative(ctx.root, step.file).replaceAll('\\', '/');
    // review/review: with a review identity the review runs in its own runtime. Outside it (AGENTIC_SDLC_ROLE is not
    // `review`) dispatch starts nothing locally: it runs the fire command the cycle's environment holds, once, or leaves
    // the start to the runner's job dependency, and prints kind `fire`. Inside the review runtime, and with no identity,
    // it is an ordinary step. An executor the binding names for the step wins. The start record says which (`via`).
    const outside = skill === REVIEW_STEP && !!b.forge?.review_identity && ctx.env.AGENTIC_SDLC_ROLE !== 'review' && !Object.keys(b.executors).some((k) => k !== 'default' && k === skill);
    const fire = outside ? ctx.env[REVIEW_FIRE_ENV] || undefined : undefined;
    const ex: Executor = fire ? { kind: 'command', run: fire } : executorFor(b, skill);
    const via = skill === REVIEW_STEP ? (outside ? (fire ? 'review-runtime' : 'job-dependency') : 'executor') : undefined;
    const startedAt = new Date().toISOString();

    const judge = skill === 'learn/judge' ? judgeTier(b, f['run-model']) : undefined;
    if (judge && 'skip' in judge) { console.log(JSON.stringify(judge)); return 0; }

    // Idempotency: one marker comment per key on the ticket (a factory CR or learn/improve has no ticket:
    // the heartbeat ticket holds it). A marker by owners.bots younger than cycle.dedupe_minutes
    // means the same dispatch already started: a double fire. The next scheduled run is never skipped.
    let board: Board | undefined;
    const boardOf = () => (board ??= createBoard({ ...ctx, options: b.board.options }));
    // A judge's marker goes on the heartbeat ticket: the judged ticket may be at Ideas, which the factory never touches.
    const target = (skill === 'learn/judge' ? '' : ticket) || b.heartbeat?.ticket;
    const window = Number(b.cycle?.dedupe_minutes) || 0; // unset or 0: no check (the binding template sets 10)
    // The run's key (the done line's ref) is always given; the dispatch lock only runs with a dedupe window.
    let key = [ticket || cr || 'factory', skill, f.run].filter(Boolean).join('-');
    let locked = false;
    let isBot: ((c: { author?: string }) => boolean) | undefined;
    if (window > 0 && target) {
      let head = '';
      if (cr) {
        try {
          const { createForge } = await import('./forge/index.ts');
          head = (await createForge({ ...ctx, options: b.forge.options }).view(cr)).headSha;
        } catch { /* no head: the key still separates CR and skill */ }
      }
      key = [ticket || cr || 'factory', skill, f.run, head].filter(Boolean).join('-');
      locked = true;
      const trusted = ownersFor(b.owners, 'board').bots.map((a) => a.toLowerCase());
      const closer = ex.kind === 'assign' ? String((ex as { user?: string }).user ?? '').toLowerCase() : '';
      const bot = isBot = (c: { author?: string }) => trusted.includes(String(c.author).toLowerCase()) || (!!closer && String(c.author).toLowerCase() === closer);
      const all = (await boardOf().comments(target)).filter(bot);
      const mine = all.filter((c) => c.body.trimStart().startsWith(matches('dispatch', key))).sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0];
      const at = mine ? Date.parse(mine.createdAt) : NaN;
      // Finished: a later bot comment carrying the done line for the key (every dispatched run ends with one).
      // Finished: the run's own done line, which dispatch hands to every executor. Other runs' comments never
      // count. Timestamps may have whole seconds only, so a same-second comment counts.
      const later = (c: { id: string; createdAt: string }) => c.id !== mine?.id && Date.parse(c.createdAt) >= at;
      // A cycle's last act is its `kind: cycle` heartbeat (step 9), so that heartbeat ends the claim too: a cycle that
      // posted it but forgot the done line (found on the pilot) must not hold the lock until the time budget passes.
      const ends = (c: { body: string }) => c.body.includes(stamp('done', key)) || (skill === 'sdlc' && isMarked(c.body, 'heartbeat') && /"kind"\s*:\s*"cycle"/.test(c.body));
      const finished = mine && all.some((c) => later(c) && ends(c));
      // A cycle (`sdlc`) cannot outlive cycle.time_budget_minutes: a claim older than that is dead, whatever stall_minutes says.
      const stall = skill === 'sdlc' ? Number(b.cycle?.time_budget_minutes) || Number(b.stall_minutes) || 0 : Number(b.stall_minutes) || 0;
      const age = Number.isNaN(at) ? 0 : (Date.now() - at) / 60_000; // an unparseable time counts as just now: fail closed
      // A finished run never blocks: a re-run after it is a new run, not a double fire.
      if (mine && !finished && (age < window || age < stall)) {
        console.log(JSON.stringify({ skipped: true, key, since: mine.createdAt, comment: mine.id, reason: age < window ? 'double fire' : 'the previous run has not finished' }));
        return 0;
      }
    }
    /** Prints the start record; the marker was posted before the executor started. */
    let marker: string | undefined;
    const done = async (kind: string, ref: string | null, extra: object = {}) => {
      console.log(JSON.stringify({ kind, ref: ref ?? (kind === 'assign' ? marker ?? null : null), startedAt, ...(run ? { run } : {}), key, done: stamp('done', key), ...(via ? { via } : {}), ...extra }));
      return 0;
    };
    const doneLine = stamp('done', key);
    // forge.provenance on: the run id (the dispatch key, else ticket-skill-start time) goes to the executor and into the start record, for the Agent-Run trailer and the run row's id.
    const run = (b.forge?.provenance ?? 'off') === 'off' ? undefined : locked ? key : [ticket || (cr ? `cr${cr}` : 'factory'), skill, startedAt.replace(/\D/g, '')].join('-');
    // The cycle claims itself with `dispatch sdlc`: a marker only, never a run, and no executor check.
    if (skill === 'sdlc') {
      if (locked) await boardOf().comment(target!, `${stamp('dispatch', key)}\nagentic-sdlc: cycle claimed`);
      return await done('claim', null);
    }

    // No fire command: the runner's job dependency starts the review runtime; nothing starts here.
    if (outside && !fire) return await done('fire', null);
    const skillTier = step.tier;
    const stage = resolveStage(b, ex, judge?.tier ?? skillTier, judge?.model);
    // The fire command only POSTs a trigger: the review itself runs in the review runtime, not on this machine.
    const local = !fire && (stage.sandbox === 'local' || (!stage.sandbox && (ex.kind === 'command' || ex.kind === 'harness')));
    // Local execution is opt-in twice: the stage names sandbox local, and the runner sets AGENTIC_SDLC_LOCAL=1.
    const localOk = stage.sandbox === 'local' && ctx.env.AGENTIC_SDLC_LOCAL === '1';
    if (local && !localOk && (f.unattended || ctx.env.AGENTIC_SDLC_UNATTENDED === '1')) {
      throw new Error(`executor for ${skill} uses sandbox ${stage.sandbox ?? 'local (unset)'}; unattended runs refuse it (local execution: sandbox local and AGENTIC_SDLC_LOCAL=1)`);
    }
    const limits = limitsOf(b, ex);
    const hasLimits = Object.keys(limits).length > 0;
    const info = { ...(judge ?? {}), model: stage.model, mcps: stage.mcps, sandbox: stage.sandbox, ...(hasLimits ? { limits } : {}) };
    // Claim before start: a second fire sees the marker even while this executor is still starting.
    if (locked || ex.kind === 'assign') {
      marker = (await boardOf().comment(target!, `${stamp('dispatch', key)}\nagentic-sdlc: run step ${skill} (${ex.kind})${limitsText(limits)}; close with ${stamp('done', key)}`)).id;
      const k = key;
      // Two overlapping cycles can both pass the check above. Re-read: the earliest unfinished marker inside
      // the window owns the run, any later one stands down. Its own done line is not posted: it would end the owner's block.
      if (locked && isBot) {
        const all = (await boardOf().comments(target!)).filter(isBot);
        const markers = all.filter((c) => c.body.trimStart().startsWith(matches('dispatch', key)));
        const order = (x: { createdAt: string; id: string }, y: { createdAt: string; id: string }) =>
          (Date.parse(x.createdAt) - Date.parse(y.createdAt)) || String(x.id).localeCompare(String(y.id), undefined, { numeric: true });
        const me = markers.find((c) => c.id === marker);
        const owner = me && markers.find((c) => {
          const age = (Date.now() - Date.parse(c.createdAt)) / 60_000;
          const finished = all.some((d) => !markers.includes(d) && d.body.includes(stamp('done', key)) && Date.parse(d.createdAt) >= Date.parse(c.createdAt));
          return c !== me && order(c, me) < 0 && !finished && !(age >= window);
        });
        if (owner) {
          console.log(JSON.stringify({ skipped: true, key, since: owner.createdAt, comment: owner.id, reason: 'double fire' }));
          return 0;
        }
      }
      onFail = () => (sent ? Promise.resolve() : boardOf().comment(target!, `${stamp('done', k)}\nagentic-sdlc: ${skill} did not start`));
    }

    if (ex.kind === 'harness') {
      return await done('harness', null, { instruction: `load ${file} in a subagent at tier ${judge?.tier ?? skillTier}${hasLimits ? `; ${limitsText(limits).trim()}` : ''}${doneLine ? `; the subagent puts the line ${doneLine} in its closing comment` : ''}; its dispatch key is ${key}${run ? `; its run id is ${run}` : ''}`, tier: judge?.tier ?? skillTier, ...info, secrets: stage.secrets });
    }
    if (ex.kind === 'command') {
      const dir = mkdtempSync(join(tmpdir(), 'agentic-sdlc-'));
      const promptFile = join(dir, 'prompt.md');
      writeFileSync(promptFile, `${taskText({ skill, ticket, cr, file, done: doneLine, run, limits })}
`);
      const mcpsFile = join(dir, 'mcps.json');
      writeFileSync(mcpsFile, JSON.stringify(stage.mcps, null, 2)); // env var names only
      const vars: Record<string, string> = { skill, ticket, cr, workdir, prompt_file: promptFile, mcps_file: mcpsFile, max_turns: String(limits.max_turns ?? ''), max_tokens: String(limits.max_tokens ?? ''), max_minutes: String(limits.max_minutes ?? ''), ...(stage.model ? { model: stage.model } : {}) };
      const line = fill(ex.run, vars);
      const env = { ...(fire ? passEnv(ctx.env) : childEnv(ctx.env, stage.secrets)), ...(limits.max_turns ? { AGENTIC_SDLC_MAX_TURNS: String(limits.max_turns) } : {}), ...(limits.max_tokens ? { AGENTIC_SDLC_MAX_TOKENS: String(limits.max_tokens) } : {}), ...(limits.max_minutes ? { AGENTIC_SDLC_MAX_MINUTES: String(limits.max_minutes) } : {}) };
      const logDir = join(tmpdir(), 'agentic-sdlc-runs');
      mkdirSync(logDir, { recursive: true, mode: 0o700 });
      // The log dir is predictable: refuse a symlink or another user's folder, keep it private.
      const st = lstatSync(logDir);
      if (!st.isDirectory() || st.isSymbolicLink() || (process.getuid && st.uid !== process.getuid())) throw new Error(`${logDir} is not a folder of yours; remove it and retry`);
      if (process.platform !== 'win32') chmodSync(logDir, 0o700);
      const log = join(logDir, `${startedAt}-${skill}-${ticket || `cr${cr}`}`.replace(/[^\w.-]/g, '_') + '.log');
      const fd = openSync(log, 'a', 0o600);
      try {
        const [cmd, args, childVars] = process.platform === 'win32'
          ? ['cmd', ['/d', '/v:off', '/c', '%AGENTIC_SDLC_CMD%'], { ...env, AGENTIC_SDLC_CMD: line }]
          : ['sh', ['-c', line], env];
        const child = spawnChild(cmd as string, args as string[], { cwd: workdir, env: childVars as NodeJS.ProcessEnv, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
        child.on('error', () => {}); // a late spawn failure shows as a missing pid below, not a crash
        child.unref();
        if (!child.pid) throw new Error(`could not start the command executor for ${skill}; see ${log}`);
        sent = true;
        return await done(fire ? 'fire' : 'command', String(child.pid), { log, ...info });
      } finally { closeSync(fd); }
    }
    const stageBody = { model: stage.model, mcps: Object.entries(stage.mcps).map(([name, m]) => ({ name, url: m.url })), sandbox: stage.sandbox, ...(hasLimits ? { limits } : {}) };
    if (ex.kind === 'webhook') {
      const headers: Record<string, string> = ex.token_env ? { authorization: `Bearer ${envOf(ctx.env, ex.token_env)}` } : {};
      const url = envOf(ctx.env, ex.url_env);
      sent = true;
      const r = await ctx.http('POST', url, { headers, body: { skill, file, ticket, cr, callback: null, ...(doneLine ? { done: doneLine } : {}), ...(run ? { run } : {}), ...stageBody } });
      return await done('webhook', r?.id ?? null);
    }
    if (ex.kind === 'managed') {
      const req = managedRequest(ex, ctx.env, { skill, ticket, cr, file, done: doneLine, run, ...(hasLimits ? { limits } : {}) }, stage.model, stageBody);
      sent = true;
      const r = await ctx.http(...req);
      return await done('managed', r?.id ?? r?.name ?? null);
    }
    if (ex.kind !== 'assign') throw new Error(`unknown executor kind '${(ex as { kind: string }).kind}' for ${skill}`);
    if (!ticket) throw new Error('executor kind assign needs --ticket');
    await boardOf().assign(ticket, ex.user);
    return await done('assign', null);
  } catch (e) {
    // A 4xx answer or a network error means no remote run exists: the done line is still written.
    if (sent && (e instanceof TypeError || / -> 4\d\d:/.test(String((e as Error).message)))) sent = false;
    if (onFail) await onFail().catch(() => undefined);
    console.error((e as Error).message);
    return 1;
  }
};

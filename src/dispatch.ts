// agentic-sdlc dispatch <skill> [--ticket <id>] [--cr <n>] (at least one) [--workdir <d>] [--run-model <id>] [--unattended]: start the skill's executor.
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { createBoard } from './board/index.ts';
import { fill } from './bench.ts';
import type { Binding, Board, Executor, McpServer, PortCli } from './ports.ts';

const envOf = (env: NodeJS.ProcessEnv, name: string) => {
  const v = env[name];
  if (!v) throw new Error(`set the ${name} environment variable`);
  return v;
};

const TIERS = ['fast', 'balanced', 'deep'] as const;

/**
 * judge-run's tier: binding.learning.judge_tier, stepped off the judged run's model so a model
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
  const model = judgeModel ?? ex.model?.id ?? (tier ? (b.models as Record<string, string>)[tier] : undefined);
  return { mcps, secrets: ex.secrets ?? [], sandbox: ex.sandbox ?? b.executors.default?.sandbox, model };
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
type Task = { skill: string; ticket: string; cr: string };

const subject = (t: Task) => (t.ticket ? `ticket ${t.ticket}${t.cr ? ` (change request ${t.cr})` : ''}` : `change request ${t.cr}`);
const taskText = (t: Task) => `Run skill ${t.skill} on ${subject(t)}. Load .agents/skills/${t.skill}/SKILL.md first and follow it.`;

export const DISPATCH_MARKER = 'agentic-sdlc:dispatch';

/** The skill's model tier: frontmatter metadata.tier, else the deprecated top-level tier. */
export function skillTierOf(text: string): string | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return undefined;
  try { const fm = parse(m[1]); return fm?.metadata?.tier ?? fm?.tier; } catch { return undefined; }
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
  if ((api === 'claude' || api === 'antigravity') && (t.skill === 'judge-run' || ex.model)) {
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

export const cli: PortCli = async (argv, ctx) => {
  try {
    const f: Record<string, string> = {};
    const pos: string[] = [];
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--unattended') f.unattended = '1';
      else if (argv[i].startsWith('--')) f[argv[i].slice(2)] = argv[++i];
      else pos.push(argv[i]);
    }
    const [skill] = pos;
    // improve-factory works on the factory, not a ticket: its marker lives on the heartbeat ticket.
    if (!skill || (!f.ticket && !f.cr && skill !== 'improve-factory')) { console.error('usage: agentic-sdlc dispatch <skill> [--ticket <id>] [--cr <n>] (at least one; none for improve-factory) [--run <id>] [--workdir <d>] [--run-model <id>] [--unattended]'); return 2; }
    const ticket = f.ticket ?? '', cr = f.cr ?? '', workdir = f.workdir ?? ctx.root;
    const b = ctx.binding;
    const ex = Object.hasOwn(b.executors, skill) ? b.executors[skill] : b.executors.default;
    const startedAt = new Date().toISOString();

    const judge = skill === 'judge-run' ? judgeTier(b, f['run-model']) : undefined;
    if (judge && 'skip' in judge) { console.log(JSON.stringify(judge)); return 0; }

    // Idempotency: one marker comment per key on the ticket (a factory CR or improve-factory has no ticket:
    // the heartbeat ticket holds it). A marker by owners.bots younger than cycle.dedupe_minutes
    // means the same dispatch already started: a double fire. The next scheduled run is never skipped.
    let board: Board | undefined;
    const boardOf = () => (board ??= createBoard({ ...ctx, options: b.board.options }));
    // A judge's marker goes on the heartbeat ticket: the judged ticket may be at Ideas, which the factory never touches.
    const target = (skill === 'judge-run' ? '' : ticket) || b.heartbeat?.ticket;
    const window = Number(b.cycle?.dedupe_minutes) || 0; // unset or 0: no check (the binding template sets 10)
    let key: string | undefined;
    if (window > 0 && target) {
      let head = '';
      if (cr) {
        try {
          const { createForge } = await import('./forge/index.ts');
          head = (await createForge({ ...ctx, options: b.forge.options }).view(cr)).headSha;
        } catch { /* no head: the key still separates CR and skill */ }
      }
      key = [ticket || cr || 'factory', skill, f.run, head].filter(Boolean).join('-');
      const trusted = (b.owners?.bots ?? []).map((a) => a.toLowerCase());
      const bot = (c: { author?: string }) => trusted.includes(String(c.author).toLowerCase());
      const all = (await boardOf().comments(target)).filter(bot);
      const mine = all.filter((c) => c.body.trimStart().startsWith(`<!-- ${DISPATCH_MARKER} ${key} `)).sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0];
      const at = mine ? Date.parse(mine.createdAt) : NaN;
      // Finished: a later bot comment that is not a dispatch marker (every run ends with a ticket comment).
      const finished = mine && all.some((c) => Date.parse(c.createdAt) > at && !c.body.trimStart().startsWith(`<!-- ${DISPATCH_MARKER}`));
      const stall = Number(b.stall_minutes) || 0;
      const age = (Date.now() - at) / 60_000;
      if (mine && (age < window || (!finished && age < stall))) {
        console.log(JSON.stringify({ skipped: true, key, since: mine.createdAt, comment: mine.id, reason: age < window ? 'double fire' : 'the previous run has not finished' }));
        return 0;
      }
    }
    /** Prints the start record; the marker was posted before the executor started. */
    let marker: string | undefined;
    const done = async (kind: string, ref: string | null, extra: object = {}) => {
      console.log(JSON.stringify({ kind, ref: ref ?? (kind === 'assign' ? marker ?? null : null), startedAt, ...(key ? { key } : {}), ...extra }));
      return 0;
    };

    let skillTier: string | undefined;
    try { skillTier = skillTierOf(readFileSync(join(ctx.root, '.agents', 'skills', skill, 'SKILL.md'), 'utf8')); }
    catch { /* only a harness stage needs the skill file */ }
    const stage = resolveStage(b, ex, judge?.tier ?? skillTier, judge?.model);
    const local = stage.sandbox === 'local' || (!stage.sandbox && (ex.kind === 'command' || ex.kind === 'harness'));
    if (local && (f.unattended || ctx.env.AGENTIC_SDLC_UNATTENDED === '1')) {
      throw new Error(`executor for ${skill} uses sandbox ${stage.sandbox ?? 'local (unset)'}; unattended runs refuse it`);
    }
    const info = { ...(judge ?? {}), model: stage.model, mcps: stage.mcps, sandbox: stage.sandbox };
    // Claim before start: a second fire sees the marker even while this executor is still starting.
    if (key || ex.kind === 'assign') {
      marker = (await boardOf().comment(target!, `<!-- ${DISPATCH_MARKER} ${key ?? `${ticket}-${skill}`} -->\nagentic-sdlc: run skill ${skill} (${ex.kind})`)).id;
    }

    if (ex.kind === 'harness') {
      return await done('harness', null, { instruction: `load skills/${skill}/SKILL.md in a subagent at tier ${judge?.tier ?? skillTier}`, tier: judge?.tier ?? skillTier, ...info, secrets: stage.secrets });
    }
    if (ex.kind === 'command') {
      const dir = mkdtempSync(join(tmpdir(), 'agentic-sdlc-'));
      const promptFile = join(dir, 'prompt.md');
      writeFileSync(promptFile, `Run skill ${skill} on ${subject({ skill, ticket, cr })}. Load .agents/skills/${skill}/SKILL.md first.
`);
      const mcpsFile = join(dir, 'mcps.json');
      writeFileSync(mcpsFile, JSON.stringify(stage.mcps, null, 2)); // env var names only
      const vars: Record<string, string> = { skill, ticket, cr, workdir, prompt_file: promptFile, mcps_file: mcpsFile, ...(stage.model ? { model: stage.model } : {}) };
      const line = fill(ex.run, vars);
      const env = childEnv(ctx.env, stage.secrets);
      const logDir = join(tmpdir(), 'agentic-sdlc-runs');
      mkdirSync(logDir, { recursive: true });
      const log = join(logDir, `${startedAt}-${skill}-${ticket || `cr${cr}`}`.replace(/[^\w.-]/g, '_') + '.log');
      const fd = openSync(log, 'a');
      try {
        const [cmd, args, childVars] = process.platform === 'win32'
          ? ['cmd', ['/d', '/v:off', '/c', '%AGENTIC_SDLC_CMD%'], { ...env, AGENTIC_SDLC_CMD: line }]
          : ['sh', ['-c', line], env];
        const child = spawnChild(cmd as string, args as string[], { cwd: workdir, env: childVars as NodeJS.ProcessEnv, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
        child.on('error', () => {}); // a late spawn failure shows as a missing pid below, not a crash
        child.unref();
        if (!child.pid) throw new Error(`could not start the command executor for ${skill}; see ${log}`);
        return await done('command', String(child.pid), { log, ...info });
      } finally { closeSync(fd); }
    }
    const stageBody = { model: stage.model, mcps: Object.entries(stage.mcps).map(([name, m]) => ({ name, url: m.url })), sandbox: stage.sandbox };
    if (ex.kind === 'webhook') {
      const headers: Record<string, string> = ex.token_env ? { authorization: `Bearer ${envOf(ctx.env, ex.token_env)}` } : {};
      const url = envOf(ctx.env, ex.url_env);
      const r = await ctx.http('POST', url, { headers, body: { skill, ticket, cr, callback: null, ...stageBody } });
      return await done('webhook', r?.id ?? null);
    }
    if (ex.kind === 'managed') {
      const r = await ctx.http(...managedRequest(ex, ctx.env, { skill, ticket, cr }, stage.model, stageBody));
      return await done('managed', r?.id ?? r?.name ?? null);
    }
    if (ex.kind !== 'assign') throw new Error(`unknown executor kind '${(ex as { kind: string }).kind}' for ${skill}`);
    if (!ticket) throw new Error('executor kind assign needs --ticket');
    await boardOf().assign(ticket, ex.user);
    return await done('assign', null);
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
};

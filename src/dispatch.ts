// agentic-sdlc dispatch <skill> --ticket <id> [--cr <n>] [--workdir <d>] [--run-model <id>] [--unattended]: start the skill's executor.
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { createBoard } from './board/index.ts';
import { fill } from './bench.ts';
import type { Binding, Executor, McpServer, PortCli } from './ports.ts';

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
  const want = b.learning?.judge_tier ?? 'fast';
  const i = TIERS.indexOf(want);
  const order = [want, ...TIERS.slice(i + 1), ...TIERS.slice(0, i).reverse()];
  const tier = order.find((t) => !runModel || b.models[t] !== runModel);
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

const taskText = (t: Task) =>
  `Run skill ${t.skill} on ticket ${t.ticket}${t.cr ? ` (change request ${t.cr})` : ''}. Load .agents/skills/${t.skill}/SKILL.md first and follow it.`;

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
    if (!skill || !f.ticket) { console.error('usage: agentic-sdlc dispatch <skill> --ticket <id> [--cr <n>] [--workdir <d>] [--run-model <id>] [--unattended]'); return 2; }
    const ticket = f.ticket, cr = f.cr ?? '', workdir = f.workdir ?? ctx.root;
    const b = ctx.binding;
    const ex = Object.hasOwn(b.executors, skill) ? b.executors[skill] : b.executors.default;
    const startedAt = new Date().toISOString();
    const done = (kind: string, ref: string | null, extra: object = {}) => {
      console.log(JSON.stringify({ kind, ref, startedAt, ...extra }));
      return 0;
    };

    const judge = skill === 'judge-run' ? judgeTier(b, f['run-model']) : undefined;
    if (judge && 'skip' in judge) { console.log(JSON.stringify(judge)); return 0; }

    let skillTier: string | undefined;
    try {
      const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(ctx.root, '.agents', 'skills', skill, 'SKILL.md'), 'utf8'));
      skillTier = m ? parse(m[1])?.tier : undefined;
    } catch { /* only a harness stage needs the skill file */ }
    const stage = resolveStage(b, ex, judge?.tier ?? skillTier, judge?.model);
    const local = stage.sandbox === 'local' || (!stage.sandbox && (ex.kind === 'command' || ex.kind === 'harness'));
    if (local && (f.unattended || ctx.env.AGENTIC_SDLC_UNATTENDED === '1')) {
      throw new Error(`executor for ${skill} uses sandbox ${stage.sandbox ?? 'local (unset)'}; unattended runs refuse it`);
    }
    const info = { ...(judge ?? {}), model: stage.model, mcps: stage.mcps, sandbox: stage.sandbox };

    if (ex.kind === 'harness') {
      return done('harness', null, { instruction: `load skills/${skill}/SKILL.md in a subagent at tier ${judge?.tier ?? skillTier}`, tier: judge?.tier ?? skillTier, ...info, secrets: stage.secrets });
    }
    if (ex.kind === 'command') {
      const dir = mkdtempSync(join(tmpdir(), 'agentic-sdlc-'));
      const promptFile = join(dir, 'prompt.md');
      writeFileSync(promptFile, `Run skill ${skill} on ticket ${ticket}${cr ? ` (change request ${cr})` : ''}. Load .agents/skills/${skill}/SKILL.md first.
`);
      const mcpsFile = join(dir, 'mcps.json');
      writeFileSync(mcpsFile, JSON.stringify(stage.mcps, null, 2)); // env var names only
      const vars: Record<string, string> = { skill, ticket, cr, workdir, prompt_file: promptFile, mcps_file: mcpsFile, ...(stage.model ? { model: stage.model } : {}) };
      const line = fill(ex.run, vars);
      const env = childEnv(ctx.env, stage.secrets);
      const logDir = join(tmpdir(), 'agentic-sdlc-runs');
      mkdirSync(logDir, { recursive: true });
      const log = join(logDir, `${startedAt}-${skill}-${ticket}`.replace(/[^\w.-]/g, '_') + '.log');
      const fd = openSync(log, 'a');
      try {
        const [cmd, args, childVars] = process.platform === 'win32'
          ? ['cmd', ['/d', '/v:off', '/c', '%AGENTIC_SDLC_CMD%'], { ...env, AGENTIC_SDLC_CMD: line }]
          : ['sh', ['-c', line], env];
        const child = spawnChild(cmd as string, args as string[], { cwd: workdir, env: childVars as NodeJS.ProcessEnv, detached: true, stdio: ['ignore', fd, fd], windowsHide: true });
        child.on('error', () => {}); // a late spawn failure shows as a missing pid below, not a crash
        child.unref();
        if (!child.pid) throw new Error(`could not start the command executor for ${skill}; see ${log}`);
        return done('command', String(child.pid), { log, ...info });
      } finally { closeSync(fd); }
    }
    const stageBody = { model: stage.model, mcps: Object.entries(stage.mcps).map(([name, m]) => ({ name, url: m.url })), sandbox: stage.sandbox };
    if (ex.kind === 'webhook') {
      const headers: Record<string, string> = ex.token_env ? { authorization: `Bearer ${envOf(ctx.env, ex.token_env)}` } : {};
      const url = envOf(ctx.env, ex.url_env);
      const r = await ctx.http('POST', url, { headers, body: { skill, ticket, cr, callback: null, ...stageBody } });
      return done('webhook', r?.id ?? null);
    }
    if (ex.kind === 'managed') {
      const r = await ctx.http(...managedRequest(ex, ctx.env, { skill, ticket, cr }, stage.model, stageBody));
      return done('managed', r?.id ?? r?.name ?? null);
    }
    if (ex.kind !== 'assign') throw new Error(`unknown executor kind '${(ex as { kind: string }).kind}' for ${skill}`);
    const board = createBoard({ ...ctx, options: b.board.options });
    await board.assign(ticket, ex.user);
    const c = await board.comment(ticket, `agentic-sdlc: run skill ${skill}`);
    return done('assign', c.id);
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
};

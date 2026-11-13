import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Binding } from './ports.ts';

export const BINDING_PATH = '.agents/binding.yml';

export function loadBinding(root: string): Binding {
  let text: string;
  try { text = readFileSync(join(root, BINDING_PATH), 'utf8'); }
  catch { throw new Error(`no ${BINDING_PATH} in ${root}; run: agentic-sdlc init`); }
  return parse(text) as Binding;
}

const ADAPTERS = {
  board: ['github', 'jira', 'linear', 'local'],
  forge: ['github', 'gitlab', 'azure', 'bitbucket'],
  vcs: ['git'],
};
/** Option keys each adapter reads: [required, optional]. Anything else is a typo the adapter would ignore. */
const OPTIONS: Record<string, Record<string, [string[], string[]]>> = {
  board: {
    github: [['owner', 'project_number', 'repo'], ['token_env']],
    jira: [['base_url', 'project_key', 'email_env', 'token_env'], []],
    linear: [['team_key', 'token_env'], []],
    local: [[], []],
  },
  forge: {
    github: [[], ['repo', 'token_env', 'review_token_env']],
    gitlab: [['base_url', 'project', 'token_env'], ['review_token_env']],
    azure: [['org_url', 'project', 'repo', 'token_env'], ['review_token_env']],
    bitbucket: [['workspace', 'repo', 'token_env'], ['review_token_env']],
  },
  vcs: { git: [[], []] },
};
const REQUIRED = [
  'owners', 'board', 'forge', 'vcs', 'models', 'commands', 'paths', 'sizes', 'ready_size_limit', 'fast_lane_max_size',
  'priorities', 'p0_setters', 'max_subissue_depth', 'spec_marker', 'stall_minutes', 'parallel_agents', 'cycle', 'heartbeat', 'learning', 'product', 'executors',
];
const PROOFS = ['test', 'eval', 'visual', 'data-check', 'computer-use', 'manual'];
const EXECUTORS = ['harness', 'command', 'webhook', 'managed', 'assign'];
const EXECUTOR_KEYS: Record<string, string[]> = { command: ['run'], webhook: ['url_env'], managed: ['token_env'], assign: ['user'] };
const MANAGED_APIS = ['claude', 'cursor', 'antigravity', 'generic'];
export const HUMAN_APPROVAL = ['full-lane', 'always', 'never'];
const SANDBOXES =['cloud', 'container', 'local'];
const PROFILES = ['individual', 'enterprise'];
export const DELIVERY = ['release-line', 'continuous'];
const EVIDENCE = ['sbom', 'provenance', 'signature'];
const TIERS = ['fast', 'balanced', 'deep'];
const STATUSES = ['Ideas', 'Signals', 'Backlog', 'Ready', 'In progress', 'In review', 'Done', 'Cancelled'];

/** Returns the problems found; empty means valid. */
export function validateBinding(b: Binding): string[] {
  const p: string[] = [];
  const x = b as any;
  if (!x || typeof x !== 'object') return ['binding is empty'];
  if (x.version !== 2) p.push('version must be 2');
  if (!PROFILES.includes(x.profile)) p.push(`profile '${x.profile}' must be one of ${PROFILES.join('|')}`);
  if (typeof x.owners?.factory !== 'string' || !x.owners.factory) p.push('owners.factory must name the factory owner');
  if (!Array.isArray(x.paths?.factory) || !x.paths.factory.length || x.paths.factory.some((g: unknown) => typeof g !== 'string')) p.push('paths.factory must list the factory path globs');
  if (!Array.isArray(x.owners?.bots) || !x.owners.bots.length) p.push('owners.bots must list the accounts the factory runs as');
  for (const k of REQUIRED) if (x[k] === undefined || x[k] === null) p.push(`missing key: ${k}`);
  for (const port of ['board', 'forge', 'vcs'] as const) {
    const a = x[port]?.adapter;
    if (x[port] && !ADAPTERS[port].includes(a)) p.push(`${port}.adapter '${a}' is not one of ${ADAPTERS[port].join('|')}`);
    const spec = OPTIONS[port][a];
    if (!spec) continue;
    const opts = x[port].options ?? {};
    for (const k of spec[0]) if (opts[k] === undefined || opts[k] === null || opts[k] === '') p.push(`${port}.options.${k} is required for adapter ${a}`);
    for (const k of Object.keys(opts)) if (!spec[0].includes(k) && !spec[1].includes(k)) p.push(`${port}.options.${k} is not read by adapter ${a} (known: ${[...spec[0], ...spec[1]].join(', ') || 'none'})`);
  }
  if (x.board) {
    if (!Array.isArray(x.board.statuses)) p.push('board.statuses must be a list');
    else for (const s of STATUSES) if (!x.board.statuses.includes(s)) p.push(`board.statuses lacks '${s}'`);
  }
  if (Array.isArray(x.sizes)) {
    for (const k of ['ready_size_limit', 'fast_lane_max_size']) if (x[k] && !x.sizes.includes(x[k])) p.push(`${k} '${x[k]}' is not in sizes`);
  }
  for (const t of ['fast', 'balanced', 'deep']) if (x.models && !x.models[t]) p.push(`models.${t} missing`);
  if (x.vcs && !String(x.vcs.change_pattern ?? '').includes('<ticket>')) p.push('vcs.change_pattern must contain <ticket>');
  if (x.vcs) {
    const lines = (x.product?.delivery ?? 'release-line') === 'release-line';
    for (const [k, what] of [['trunk', 'name the trunk branch'], ...(lines ? [['release_prefix', 'name the release line prefix']] : []), ['factory_change_pattern', 'be a branch pattern for factory changes']])
      if (typeof x.vcs[k] !== 'string' || !x.vcs[k]) p.push(`vcs.${k} must ${what}`);
    if (typeof x.vcs.tag_prefix !== 'string') p.push('vcs.tag_prefix must be a string (empty for none)');
    if (typeof x.vcs.release_prefix === 'string' && x.vcs.release_prefix && !x.vcs.release_prefix.endsWith('/')) p.push("vcs.release_prefix must end in '/'");
  }
  const pr = x.product;
  if (pr) {
    if (!Array.isArray(pr.environments) || !pr.environments.length) p.push('product.environments must be a non-empty list');
    if (pr.delivery !== undefined && !DELIVERY.includes(pr.delivery)) p.push(`product.delivery '${pr.delivery}' is not one of ${DELIVERY.join('|')}`);
    if (pr.delivery === 'release-line' && Array.isArray(pr.environments) && pr.environments.length < 2) p.push('product.delivery release-line needs two or more environments; use continuous');
    const ev = (pr.evidence ?? []).filter((k: string) => !EVIDENCE.includes(k));
    if (ev.length) p.push(`product.evidence has unknown kinds: ${ev.join(', ')} (known: ${EVIDENCE.join(', ')})`);
    const bad = (pr.proofs ?? []).filter((k: string) => !PROOFS.includes(k));
    if (bad.length) p.push(`product.proofs has unknown kinds: ${bad.join(', ')}`);
  }
  for (const [k, e] of Object.entries<any>(x.executors ?? {})) {
    if (!EXECUTORS.includes(e?.kind)) p.push(`executors.${k}.kind '${e?.kind}' is not one of ${EXECUTORS.join('|')}`);
    for (const key of EXECUTOR_KEYS[e?.kind] ?? []) if (!e[key]) p.push(`executors.${k}.${key} is required for kind ${e.kind}`);
    if (e?.kind === 'managed' && e.api !== undefined && !MANAGED_APIS.includes(e.api)) p.push(`executors.${k}.api '${e.api}' is not one of ${MANAGED_APIS.join('|')}`);
    for (const m of e?.mcps ?? []) if (!x.mcps?.[m]) p.push(`executors.${k}.mcps '${m}' is not in the binding's mcps`);
    for (const v of e?.secrets ?? []) if (!/^[A-Z_][A-Z0-9_]*$/.test(String(v))) p.push(`executors.${k}.secrets '${v}' is not an env var name`);
    if (e?.sandbox !== undefined && !SANDBOXES.includes(e.sandbox)) p.push(`executors.${k}.sandbox '${e.sandbox}' is not one of ${SANDBOXES.join('|')}`);
    if (e?.model !== undefined) {
      const { tier, id } = e.model ?? {};
      if ((tier === undefined) === (id === undefined)) p.push(`executors.${k}.model needs exactly one of tier or id`);
      else if (tier !== undefined && !TIERS.includes(tier)) p.push(`executors.${k}.model.tier '${tier}' is not one of ${TIERS.join('|')}`);
    }
  }
  if (['human-approval', 'ticket-linkage', 'proofs-on-base'].includes(x.forge?.review_check_name)) p.push(`forge.review_check_name '${x.forge.review_check_name}' is a gate's context`);
  const ha = x.forge?.human_approval;
  if (ha !== undefined && !HUMAN_APPROVAL.includes(ha)) p.push(`forge.human_approval '${ha}' is not one of ${HUMAN_APPROVAL.join('|')}`);
  for (const k of ['bench_min_cases', 'bench_trials']) {
    const v = x.learning?.[k];
    if (v !== undefined && !(Number.isInteger(v) && v > 0)) p.push(`learning.${k} must be a positive integer`);
  }
  for (const k of ['preview', 'proofs_on_base', 'evidence_check']) if (x.commands?.[k] !== undefined && typeof x.commands[k] !== 'string') p.push(`commands.${k} must be a command line`);
  if (x.traces && !String(x.traces.uri ?? '').includes('{run_id}')) p.push('traces.uri must contain {run_id}');
  if (x.executors && !x.executors.default) p.push('executors.default is missing');
  return p;
}

/** Non-fatal profile advice; validateBinding holds the hard rules. */
export function bindingWarnings(b: Binding): string[] {
  const w: string[] = [];
  const x = b as any;
  if (x?.product?.kind !== undefined) w.push('product.kind is unused; remove it');
  if (x?.board?.milestone !== undefined) w.push('board.milestone is unused; remove it');
  if ((x?.product?.evidence ?? []).length && !x?.commands?.evidence_check) w.push('product.evidence is set but commands.evidence_check is unset: no release can show its evidence');
  if (x?.forge?.review_runtime !== undefined) w.push('forge.review_runtime is unused: review-pr always runs in its own runtime; remove it');
  const size = x?.learning?.bench_size, min = x?.learning?.bench_min_cases ?? 20;
  if (size !== undefined && Number(size) < min) w.push(`learning.bench_size ${size} is below bench_min_cases ${min}: bench compare reports regressed for every change`);
  if (x?.profile === 'individual') {
    for (const [k, e] of Object.entries<any>(x.executors ?? {}))
      if (['managed', 'webhook', 'assign'].includes(e?.kind)) w.push(`executors.${k}: kind ${e.kind} needs an API or hosted agent; individual profile expects harness or a subscription CLI command`);
    const uri = x.traces?.uri;
    if (uri !== undefined && !['./', '.agents/', '/'].some((q) => String(uri).startsWith(q)) && !/^[A-Za-z]:[\\/]/.test(String(uri))) w.push(`traces.uri '${uri}' is not a local path (./, .agents/ or absolute); individual profile has no org storage`);
    if (Number(x.learning?.budget_usd_per_week) > 0 && !x.agent_command) w.push('learning.budget_usd_per_week > 0 but agent_command is unset: bench cannot run');
  } else if (x?.profile === 'enterprise') {
    const rt = x.forge?.options?.review_token_env;
    if (rt && rt === x.forge?.options?.token_env) w.push('forge.options.review_token_env equals token_env: the reviewer and implementer share one identity');
    const sb = x.executors?.default?.sandbox;
    if (!sb || sb === 'local') w.push('executors.default.sandbox is local or unset: enterprise expects cloud or container');
    if (!x.traces) w.push('traces is unset: enterprise expects traces.uri on org storage');
  }
  return w;
}

/** Shipped field options derived from product.environments; In release only with release lines and two or more environments. */
export function shippedOptions(envs: string[], delivery: string = 'release-line'): string[] {
  const inRelease = delivery === 'release-line' && envs.length > 1;
  return ['Not shipped', ...envs.slice(0, -1).map((e) => `On ${e}`), ...(inRelease ? ['In release'] : []), `On ${envs[envs.length - 1]}`];
}

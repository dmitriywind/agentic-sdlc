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

export const ADAPTERS = {
  board: ['github', 'github-issues', 'jira', 'linear', 'local'],
  forge: ['github'],
  vcs: ['git'],
};
/** Option keys each adapter reads: [required, optional]. Anything else is a typo the adapter would ignore. */
const OPTIONS: Record<string, Record<string, [string[], string[]]>> = {
  board: {
    github: [['owner', 'project_number', 'repo'], ['token_env']],
    'github-issues': [['repo'], []],
    jira: [['base_url', 'project_key', 'email_env', 'token_env'], []],
    linear: [['team_key', 'token_env'], []],
    local: [[], []],
  },
  forge: {
    github: [[], ['repo', 'token_env', 'review_token_env']],
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
const PROFILES = ['individual', 'individual-api', 'organization'];
export const DELIVERY = ['release-line', 'continuous'];
export const PROVENANCE = ['off', 'warn', 'require'];
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
  const who = (w: any) => (typeof w === 'string' && !!w) || (!!w && typeof w === 'object' && typeof w.board === 'string' && !!w.board && typeof w.forge === 'string' && !!w.forge);
  // A role is one entry or a non-empty list of entries; an entry is a name or { board, forge }.
  const role = (k: string) => {
    const v = x.owners?.[k], l = Array.isArray(v) ? v : [v];
    if (Array.isArray(v) && !v.length) p.push(`owners.${k} must not be an empty list`);
    else if (!l.every(who)) p.push(`owners.${k} must be a name or { board, forge }, or a list of them`);
  };
  if (x.owners?.factory === undefined) p.push('owners.factory must name the factory owner (a name, or { board, forge }, or a list of them)');
  else role('factory');
  for (const k of ['product', 'operator', 'security', 'compliance']) if (x.owners?.[k] !== undefined) role(k);
  const ids = (v: any) => (Array.isArray(v) ? v : v === undefined ? [] : [v]).flatMap((e: any) => (typeof e === 'object' && e ? [e.board, e.forge] : [e])).filter(Boolean).map((s: unknown) => String(s).toLowerCase());
  const rev = String(x.forge?.review_identity ?? '').toLowerCase();
  if (rev && ['product', 'factory', 'operator', 'security', 'compliance'].some((k) => ids(x.owners?.[k]).includes(rev))) p.push('forge.review_identity must not be an owner: the review identity is a bot separate from every owner');
  if (Array.isArray(x.owners?.bots) && !x.owners.bots.every(who)) p.push('owners.bots entries must be names, or { board, forge }');
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
    if (x.vcs.release_prefix === '') p.push('vcs.release_prefix must not be empty: it would match every branch (leave it out for continuous delivery)');
  }
  const pr = x.product;
  if (pr) {
    if (!Array.isArray(pr.environments) || !pr.environments.length) p.push('product.environments must be a non-empty list');
    if (pr.delivery !== undefined && !DELIVERY.includes(pr.delivery)) p.push(`product.delivery '${pr.delivery}' is not one of ${DELIVERY.join('|')}`);
    if (pr.delivery === 'release-line' && Array.isArray(pr.environments) && pr.environments.length < 2) p.push('product.delivery release-line needs two or more environments; use continuous');
    const ev = (pr.evidence ?? []).filter((k: string) => !EVIDENCE.includes(k));
    if (ev.length) p.push(`product.evidence has unknown kinds: ${ev.join(', ')} (known: ${EVIDENCE.join(', ')})`);
    if (pr.slo !== undefined) {
      const s = pr.slo;
      if (!s || typeof s !== 'object' || typeof s.change_failure_rate_max !== 'number' || !(s.change_failure_rate_max >= 0 && s.change_failure_rate_max <= 1)) p.push('product.slo.change_failure_rate_max must be a number from 0 to 1');
      if (!s || typeof s !== 'object' || !Number.isInteger(s.window_days) || !(s.window_days > 0)) p.push('product.slo.window_days must be a positive whole number');
    }
    const bad = (pr.proofs ?? []).filter((k: string) => !PROOFS.includes(k));
    if (bad.length) p.push(`product.proofs has unknown kinds: ${bad.join(', ')}`);
  }
  for (const [k, e] of Object.entries<any>(x.executors ?? {})) {
    if (!EXECUTORS.includes(e?.kind)) p.push(`executors.${k}.kind '${e?.kind}' is not one of ${EXECUTORS.join('|')}`);
    for (const key of EXECUTOR_KEYS[e?.kind] ?? []) if (!e[key]) p.push(`executors.${k}.${key} is required for kind ${e.kind}`);
    if (e?.kind === 'managed' && e.api !== undefined && !MANAGED_APIS.includes(e.api)) p.push(`executors.${k}.api '${e.api}' is not one of ${MANAGED_APIS.join('|')}`);
    for (const m of e?.mcps ?? []) if (!x.mcps?.[m]) p.push(`executors.${k}.mcps '${m}' is not in the binding's mcps`);
    for (const v of e?.secrets ?? []) if (!/^[A-Z_][A-Z0-9_]*$/.test(String(v))) p.push(`executors.${k}.secrets '${v}' is not an env var name`);
    for (const lk of ['max_turns', 'max_tokens', 'max_minutes']) if (e?.[lk] !== undefined && !(Number.isInteger(e[lk]) && e[lk] > 0)) p.push(`executors.${k}.${lk} must be a positive integer`);
    if (e?.sandbox !== undefined && !SANDBOXES.includes(e.sandbox)) p.push(`executors.${k}.sandbox '${e.sandbox}' is not one of ${SANDBOXES.join('|')}`);
    if (e?.model !== undefined) {
      const { tier, id } = e.model ?? {};
      if ((tier === undefined) === (id === undefined)) p.push(`executors.${k}.model needs exactly one of tier or id`);
      else if (tier !== undefined && !TIERS.includes(tier)) p.push(`executors.${k}.model.tier '${tier}' is not one of ${TIERS.join('|')}`);
    }
  }
  if (x.forge?.provenance !== undefined && !PROVENANCE.includes(x.forge.provenance)) p.push(`forge.provenance '${x.forge.provenance}' is not one of ${PROVENANCE.join('|')}`);
  if (['human-approval', 'ticket-linkage', 'proofs-on-base', 'agent-provenance'].includes(x.forge?.review_check_name)) p.push(`forge.review_check_name '${x.forge.review_check_name}' is a gate's context`);
  const rid = String(x.forge?.review_identity ?? ''), rt = x.forge?.options?.review_token_env;
  if (rid && !rt) p.push('forge.review_identity is set but forge.options.review_token_env is unset: name its token, or empty review_identity for one identity');
  if (!rid && rt) p.push('forge.options.review_token_env is set but forge.review_identity is empty: name the review identity, or remove review_token_env for one identity');
  if (rt && rt === x.forge?.options?.token_env) p.push('forge.options.review_token_env equals token_env: two identities need two tokens');
  if (x.profile === 'organization' && !rid) p.push('profile organization needs a separate review identity: set forge.review_identity and forge.options.review_token_env');
  const sc = x.board?.scope;
  if (sc !== undefined) {
    const label = String(sc?.label ?? ''), pre = label.split(':')[0];
    if (!/^[^:]+:.+/.test(label)) p.push("board.scope.label must be '<prefix>:<name>', e.g. repo:app-a");
    else if (sc.home && !(Array.isArray(sc.repos) && sc.repos.includes(label) && sc.repos.every((r: unknown) => String(r).startsWith(`${pre}:`))))
      p.push(`board.scope.repos must list every repo label, this repo's included, each starting '${pre}:'`);
    else if (!sc.home && sc.repos !== undefined) p.push('board.scope.repos is for the home repo only (board.scope.home: true)');
  }
  const ha = x.forge?.human_approval;
  if (ha !== undefined && !HUMAN_APPROVAL.includes(ha)) p.push(`forge.human_approval '${ha}' is not one of ${HUMAN_APPROVAL.join('|')}`);
  for (const k of ['bench_min_cases', 'bench_trials']) {
    const v = x.learning?.[k];
    if (v !== undefined && !(Number.isInteger(v) && v > 0)) p.push(`learning.${k} must be a positive integer`);
  }
  if (x.cycle?.land_wait_minutes !== undefined && !(Number.isInteger(x.cycle.land_wait_minutes) && x.cycle.land_wait_minutes >= 0)) p.push('cycle.land_wait_minutes must be a whole number of minutes');
  if (x.cycle?.max_tokens_per_ticket !== undefined && !(Number.isInteger(x.cycle.max_tokens_per_ticket) && x.cycle.max_tokens_per_ticket > 0)) p.push('cycle.max_tokens_per_ticket must be a positive integer');
  const bb = x.learning?.bench_budget;
  if (bb !== undefined) {
    if (!bb || typeof bb !== 'object' || Array.isArray(bb)) p.push('learning.bench_budget must be { max_runs, max_minutes }');
    else for (const [k, v] of Object.entries<any>(bb)) {
      if (!['max_runs', 'max_minutes'].includes(k)) p.push(`learning.bench_budget.${k} is not a bench cap (max_runs, max_minutes; bench results carry no token count)`);
      else if (!(Number.isInteger(v) && v > 0)) p.push(`learning.bench_budget.${k} must be a positive integer`);
    }
  }
  if (x.learning?.enabled !== undefined && typeof x.learning.enabled !== 'boolean') p.push('learning.enabled must be true or false');
  for (const k of ['preview', 'proofs_on_base', 'evidence_check']) if (x.commands?.[k] !== undefined && typeof x.commands[k] !== 'string') p.push(`commands.${k} must be a command line`);
  if (x.traces && !String(x.traces.uri ?? '').includes('{run_id}')) p.push('traces.uri must contain {run_id}');
  if (x.telemetry !== undefined) {
    if (!x.telemetry || typeof x.telemetry !== 'object' || Array.isArray(x.telemetry)) p.push('telemetry must be { otlp_endpoint_env, cdevents_sink_env, headers_env }');
    else for (const [k, v] of Object.entries<any>(x.telemetry)) {
      if (!['otlp_endpoint_env', 'cdevents_sink_env', 'headers_env'].includes(k)) p.push(`telemetry.${k} is not a telemetry key (otlp_endpoint_env, cdevents_sink_env, headers_env)`);
      else if (typeof v !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) p.push(`telemetry.${k} must be the NAME of an env var, never a URL or a value`);
    }
  }
  if (x.executors && !x.executors.default) p.push('executors.default is missing');
  if (x.heartbeat && !String(x.heartbeat.ticket ?? '').trim()) p.push('heartbeat.ticket is empty: create the heartbeat ticket and put its id here');
  // Keys the gates and skills read without a guard.
  const lists: [string, unknown][] = [['board.done_statuses', x.board?.done_statuses], ['board.env_labels', x.board?.env_labels], ['board.signal_streams', x.board?.signal_streams], ['forge.required_checks', x.forge?.required_checks]];
  for (const [k, v] of lists) if (v !== undefined && !Array.isArray(v)) p.push(`${k} must be a list`);
  for (const k of ['human', 'bug', 'feature']) if (x.board?.labels !== undefined && typeof x.board.labels?.[k] !== 'string') p.push(`board.labels.${k} must be a label name`);
  if (x.vcs?.version_scheme !== undefined && !['calver', 'semver'].includes(x.vcs.version_scheme)) p.push(`vcs.version_scheme '${x.vcs.version_scheme}' is not one of calver|semver`);
  if (x.learning?.judge_tier !== undefined && !TIERS.includes(x.learning.judge_tier)) p.push(`learning.judge_tier '${x.learning.judge_tier}' is not one of ${TIERS.join('|')}`);
  for (const c of x.learning?.auto_merge_classes ?? []) if (c !== 'tuning') p.push(`learning.auto_merge_classes '${c}': only tuning may merge without the factory owner`);
  for (const [n, m] of Object.entries<any>(x.mcps ?? {})) if (!m?.url === !m?.command) p.push(`mcps.${n} needs exactly one of url or command`);
  for (const [k, e] of Object.entries<any>(x.executors ?? {})) {
    if (e?.kind !== 'managed') continue;
    const api = e.api ?? 'generic';
    const need = api === 'claude' ? ['agent_env', 'environment_env'] : api === 'cursor' ? ['repo_url'] : api === 'generic' ? ['endpoint_env'] : [];
    for (const key of need) if (!e[key]) p.push(`executors.${k}.${key} is required for a managed executor with api ${api}`);
  }
  return p;
}

/** Non-fatal profile advice; validateBinding holds the hard rules. */
export function bindingWarnings(b: Binding): string[] {
  const w: string[] = [];
  const x = b as any;
  for (const k of Object.keys(x?.owners ?? {})) if (!['product', 'factory', 'operator', 'security', 'compliance', 'bots'].includes(k)) w.push(`owners.${k} is not a known owner role (product, factory, operator, security, compliance, bots); remove it`);
  if (x?.product?.kind !== undefined) w.push('product.kind is unused; remove it');
  if (x?.board?.milestone !== undefined) w.push('board.milestone is unused; remove it');
  const hb = String(x?.heartbeat?.ticket ?? '');
  if (['github', 'github-issues', 'local'].includes(x?.board?.adapter) && hb && !/^\d+$/.test(hb)) w.push(`heartbeat.ticket '${hb}' is not an issue number; the ${x.board.adapter} board addresses tickets by number`);
  const envs: string[] = x?.product?.environments ?? [];
  for (const l of x?.board?.env_labels ?? []) if (String(l).startsWith('env:') && !envs.includes(String(l).slice(4))) w.push(`board.env_labels '${l}' names no product.environments entry`);
  if ((x?.product?.evidence ?? []).length && !x?.commands?.evidence_check) w.push('product.evidence is set but commands.evidence_check is unset: no release can show its evidence');
  if (x?.forge?.provenance === 'require' && !(x.forge.required_checks ?? []).includes('agent-provenance')) w.push("forge.provenance is require but 'agent-provenance' is not in forge.required_checks: the gate can fail without blocking a merge; add it here and to the trunk ruleset");
  if (x?.forge?.review_runtime !== undefined) w.push('forge.review_runtime is unused: review/review runs where forge.review_identity says; remove it');
  const size = x?.learning?.bench_size, min = x?.learning?.bench_min_cases ?? 20;
  if (size !== undefined && Number(size) < min) w.push(`learning.bench_size ${size} is below bench_min_cases ${min}: bench compare reports regressed for every change`);
  if (x?.learning?.enabled === true && !x.agent_command) w.push('learning.enabled is true but agent_command is unset: bench cannot run');
  if (x?.learning?.budget_usd_per_week !== undefined) w.push('learning.budget_usd_per_week is unused; learning.enabled turns learning on; remove it');
  if (x?.profile === 'individual') {
    for (const [k, e] of Object.entries<any>(x.executors ?? {}))
      if (['managed', 'webhook', 'assign'].includes(e?.kind)) w.push(`executors.${k}: kind ${e.kind} needs an API or hosted agent; profile individual is subscriptions only: use individual-api`);
    const uri = x.traces?.uri;
    if (uri !== undefined && !['./', '.agents/', '/'].some((q) => String(uri).startsWith(q)) && !/^[A-Za-z]:[\\/]/.test(String(uri))) w.push(`traces.uri '${uri}' is not a local path (./, .agents/ or absolute); individual profile has no org storage`);
  } else if (x?.profile === 'organization') {
    const sb = x.executors?.default?.sandbox;
    if (!sb || sb === 'local') w.push('executors.default.sandbox is local or unset: organization expects cloud or container');
    if (!x.traces) w.push('traces is unset: organization expects traces.uri on org storage');
    if (!Object.values<any>(x.executors ?? {}).some((e) => e?.kind === 'managed')) w.push('no executor is kind managed: organization runs its stages on managed agents');
  }
  return w;
}

/** Shipped field options derived from product.environments; In release only with release lines and two or more environments. */
export function shippedOptions(envs: string[], delivery: string = 'release-line'): string[] {
  const inRelease = delivery === 'release-line' && envs.length > 1;
  return ['Not shipped', ...envs.slice(0, -1).map((e) => `On ${e}`), ...(inRelease ? ['In release'] : []), `On ${envs[envs.length - 1]}`];
}

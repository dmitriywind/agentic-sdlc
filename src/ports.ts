// Port interfaces. references/architecture.md section 3 is the contract; this file is its type form.
import type { Exec, Http } from './exec.ts';

export type LogicalField = 'size' | 'priority' | 'lane' | 'shipped' | 'release_version';

export interface Item {
  id: string;
  title: string;
  url: string;
  status: string;
  kind?: string;
  labels: string[];
  fields: Partial<Record<LogicalField, string>>;
  milestone?: string;
  parent?: string;
  children: string[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  statusChangedAt?: string;
  body?: string;
}

export interface Comment { id: string; author: string; createdAt: string; body: string; url?: string }

export interface Board {
  list(q?: { status?: string[]; label?: string; search?: string }): Promise<Item[]>;
  get(id: string): Promise<Item>;
  create(t: { title: string; body: string; status: string; labels?: string[]; parent?: string; milestone?: string }): Promise<Item>;
  /** Refuses (throws MovedError) when onlyFrom is set and the item is not in that status. */
  move(id: string, status: string, onlyFrom?: string): Promise<Item>;
  set(id: string, field: LogicalField, value: string | null): Promise<Item>;
  label(id: string, op: 'add' | 'remove', label: string): Promise<Item>;
  assign(id: string, user: string | null): Promise<Item>;
  /** Sets the ticket's milestone (the place `create --milestone` puts it), or clears it with null. */
  milestone(id: string, name: string | null): Promise<Item>;
  comment(id: string, body: string): Promise<{ id: string; url?: string }>;
  comments(id: string, q?: { last?: number; marker?: string }): Promise<Comment[]>;
  close(id: string, reason: 'completed' | 'not_planned'): Promise<Item>;
  child(parent: string, child: string): Promise<Item>;
}

export interface Check { name: string; state: 'pending' | 'success' | 'failure' | 'missing' }

export interface CR {
  n: string;
  url: string;
  title: string;
  source: string;
  target: string;
  headSha: string;
  baseSha: string;
  mergeSha?: string;
  draft: boolean;
  state: 'open' | 'merged' | 'closed';
  behind: boolean;
  closes: string[];
  checks: Check[];
  body: string;
  /** The forge login that opened the CR, in the form comment authors use. */
  author: string;
  /** When the head reached the forge (ISO time): the first CI suite on headSha. Absent before CI starts. */
  pushedAt?: string;
}

/** One review of a CR, oldest first. state is lower case: approved, changes_requested, commented, dismissed, pending. sha: the commit reviewed. */
/** assoc: the reviewer's relation to the repo (OWNER, MEMBER, COLLABORATOR, CONTRIBUTOR, NONE ...), when the forge reports it. */
export interface Review { user: string; state: string; sha: string; assoc?: string }

/** One commit of a CR, oldest first. author and committer: forge logins, empty when the forge links no account to the commit email; authorName and committerName: the names git recorded; committerEmail: the committer email git recorded. */
export interface CrCommit { sha: string; message: string; author: string; committer: string; authorName: string; committerName: string; committerEmail?: string; parents: number }

export interface Run { id: string; name: string; ref: string; sha: string; state: 'pending' | 'success' | 'failure'; url: string; at: string }

export interface Forge {
  open(o: { source: string; title: string; body: string; draft: boolean }): Promise<CR>;
  view(n: string): Promise<CR>;
  viewBySha(sha: string): Promise<CR>;
  diff(n: string): Promise<string>;
  /**
   * limit: the newest n by update; since: an ISO date, merged (state merged) or updated since. Without `checks`,
   * each CR has `checks: []` and no `pushedAt`, and `behind` is false: a list row carries no check data.
   */
  list(q?: { state?: 'open' | 'merged' | 'all'; limit?: number; since?: string; checks?: boolean }): Promise<CR[]>;
  /** Merged CRs whose body closes ticket `id`. Optional: without it, callers filter list({ state: 'merged' }). */
  closing?(id: string): Promise<CR[]>;
  /** Asks the forge to cut a release line through its release workflow, which the Product owner approves. Optional. */
  cut(revision: string, version: string): Promise<{ requested: true; run?: string; url?: string }>;
  ready(n: string): Promise<CR>;
  draft(n: string): Promise<CR>;
  sync(n: string): Promise<CR>;
  automerge(n: string): Promise<CR>;
  comment(n: string, body: string): Promise<{ id: string; url?: string }>;
  /** Every human-visible comment on the CR, oldest first; author is the login or username. System notes are dropped. */
  comments(n: string): Promise<Comment[]>;
  /** Posts with review_token_env; { as: 'ci' } (the proofs-on-base and linkage gates) posts with token_env, the CI job's own token. */
  status(sha: string, s: { context: string; state: 'pending' | 'success' | 'failure'; description: string; url?: string }, opts?: { as?: 'ci' }): Promise<void>;
  approve(n: string): Promise<void>;
  approvals(n: string): Promise<Review[]>;
  /** Every commit of the CR, oldest first, with message and authors (gate provenance). Throws when the list cannot be read whole. */
  commits(n: string): Promise<CrCommit[]>;
  runs(q?: { ref?: string; failed?: boolean }): Promise<Run[]>;
  /** One CI run by id; throws when it does not exist. */
  run(id: string): Promise<Run>;
}

/** `forge verdict`: status is `posted` when the review identity posted the status (and approval), `ci` when CI's review gate reads the report. */
export interface VerdictResult { verdict: 'PASS' | 'REMEDIATION REQUIRED'; comment: { id: string; url?: string }; status: 'posted' | 'ci' }

/** `forge land`: blocking lists what holds the CR (check: a required check name or `draft`). needsHuman: the only wait left is a human approval; who: the forge accounts that may give it. */
export interface LandResult {
  state: 'merged' | 'armed' | 'waiting' | 'blocked';
  blocking: { check: string; state: string }[];
  needsHuman?: { class: string; who: string[] };
}

export type QueueAction = 'review' | 'rework' | 'land' | 'sync' | 'wait' | 'escalate';
/**
 * `forge queue`: one row per open CR. since: when the CR last moved (head push or newest trusted comment); absent when unknown.
 * held: its ticket carries the human label. release: the ticket is held and the CR waits only to land, its human approval given.
 */
export interface QueueRow { n: string; ticket?: string; class: string; action: QueueAction; reason: string; reworks: number; since?: string; held: boolean; release?: true }

/** `board holds`: a ticket with the human label. replied: an owner-role account commented after the last ask. */
export interface Hold { id: string; kind: string; askedAt: string; replied: boolean; reply?: { author: string; createdAt: string; url?: string } }

export interface Vcs {
  start(name: string): Promise<{ workdir: string; ref: string }>;
  head(): Promise<{ ref: string; sha: string }>;
  changed(since?: string): Promise<string[]>;
  base(): Promise<{ sha: string }>;
  push(): Promise<{ ref: string; sha: string }>;
  cut(rev: string, release: string): Promise<{ ref: string }>;
  tag(name: string, rev: string): Promise<void>;
  tags(prefix?: string): Promise<{ name: string; sha: string }[]>;
  checkoutTests(rev: string, paths: string[]): Promise<void>;
  /** Remove a tree `start` made: workdir, and its branch / topic / client. Missing parts are ignored. */
  drop(name: string): Promise<void>;
  /**
   * A detached tree at `rev` outside the repo root (bench only). `changed` lists every path the
   * tree now differs from `rev` in (added, modified, deleted, untracked).
   */
  snapshot(rev: string): Promise<{ workdir: string; changed(): Promise<string[]>; drop(): Promise<void> }>;
}

/** What every adapter factory receives. */
export interface AdapterContext {
  root: string;
  binding: Binding;
  options: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
  exec: Exec;
  http: Http;
}

export class MovedError extends Error {
  constructor(id: string, expected: string, actual: string) {
    super(`${id} is at ${actual}, not ${expected}; not moved`);
  }
}

/** The shared rule for CR linkage: exactly the lines `Closes <id>`. */
export const parseCloses = (body: string): string[] =>
  [...new Set([...body.matchAll(/^[ \t]*Closes[ \t]+#?([A-Za-z0-9_-]+)[ \t]*$/gim)].map((m) => m[1]))];

/** The stage's agent definition, shared by every executor kind (references/architecture.md section 7). */
export interface StageDef {
  /** Names from Binding.mcps. */
  mcps?: string[];
  /** Env var names the stage may receive; nothing else is passed. */
  secrets?: string[];
  sandbox?: 'cloud' | 'container' | 'local';
  model?: { tier?: 'fast' | 'balanced' | 'deep'; id?: string };
  /** Per-run caps, positive integers; a stage that sets none inherits executors.default (section 6, `limitsOf`). */
  max_turns?: number;
  max_tokens?: number;
  max_minutes?: number;
}

export const LIMIT_KEYS = ['max_turns', 'max_tokens', 'max_minutes'] as const;
export type Limits = { [K in (typeof LIMIT_KEYS)[number]]?: number };

/** A stage's caps: its own, else the default executor's, per key. Only set keys appear. */
export function limitsOf(b: Pick<Binding, 'executors'>, ex: StageDef): Limits {
  const out: Limits = {};
  for (const k of LIMIT_KEYS) { const v = ex[k] ?? b.executors?.default?.[k]; if (v !== undefined) out[k] = v; }
  return out;
}

export type Executor = StageDef &
  (
    | { kind: 'harness' }
    | { kind: 'command'; run: string }
  );

export interface McpServer { url?: string; command?: string; token_env?: string }

/** An account: one name on both ports, or one name per port. */
export type Who = string | { board: string; forge: string };
/** An owner role: one account or a list of them. The first entry is the primary, the one a skill asks or assigns. */
export type WhoList = Who | Who[];
/** Every role as a list of account names (empty when unset). */
export type Owners = { product: string[]; factory: string[]; operator: string[]; security: string[]; compliance: string[]; bots: string[] };
/** The owners as the board or the forge names them; every role is a list, any member counts as the owner. */
export function ownersFor(o: Binding['owners'] | undefined, side: 'board' | 'forge'): Owners {
  const list = (w: WhoList | undefined): string[] =>
    (w === undefined || w === null ? [] : Array.isArray(w) ? w : [w])
      .map((x) => (typeof x === 'object' && x ? x[side] : x)).filter((x): x is string => !!x);
  return { product: list(o?.product), factory: list(o?.factory), operator: list(o?.operator), security: list(o?.security), compliance: list(o?.compliance), bots: list(o?.bots) };
}

/** The parsed binding. src/binding.ts validates it; keys follow references/architecture.md section 4. */
export interface Binding {
  version: 2;
  /** individual: one identity; organization: a separate review identity (architecture.md section 10). */
  profile: 'individual' | 'organization';
  /** bots: the accounts the factory runs as; only their heartbeat comments are trusted. Each account is one
   * name, or `{ board, forge }` when the board and the forge know the person by different names.
   * product and factory take one account or a list (the first is the primary); operator, security and
   * compliance are optional roles of the same shape. */
  owners: { product: WhoList; factory: WhoList; operator?: WhoList; security?: WhoList; compliance?: WhoList; bots: Who[] };
  board: {
    adapter: 'github-issues' | 'local';
    options: Record<string, unknown>;
    statuses: string[];
    fields: Partial<Record<LogicalField, string>>;
    labels: { human: string; bug: string; feature: string; release?: string };
    env_labels: string[];
    done_statuses: string[];
    later_milestone?: string;
    views?: string[];
    signal_streams: string[];
    /** Many repos on one board: this repo's tickets carry `label`; `home` also takes items with no label of its prefix. Unset: one repo. */
    scope?: { label: string; home?: boolean; repos?: string[] };
  };
  forge: {
    adapter: 'github';
    options: Record<string, unknown>;
    /** The account behind review_token_env. Empty: one identity, the implementer's (architecture.md section 10). */
    review_identity: string;
    /** Who must approve besides the agent review (status human-approval). Absent: full-lane. */
    human_approval?: 'full-lane' | 'always' | 'never';
    /** Gate provenance: agent commits carry Agent-Run and Agent-Model trailers. off (default) does nothing; warn reports; require fails the check `agent-provenance`. */
    provenance?: 'off' | 'warn' | 'require';
    review_check_name: string;
    verify_check_name: string;
    required_checks: string[];
    planned_checks: string[];
  };
  vcs: {
    adapter: 'git';
    options?: Record<string, unknown>;
    trunk: string;
    change_pattern: string;
    factory_change_pattern: string;
    release_prefix: string;
    tag_prefix: string;
    version_scheme: 'calver' | 'semver';
  };
  mcps?: Record<string, McpServer>;
  /** Where executors write run traces; must contain {run_id}. */
  traces?: { uri: string };
  models: { fast: string; balanced: string; deep: string };
  agent_command?: string;
  commands: {
    setup?: string; install: string; fast_check: string; verify: string; light_verify?: string; rollback?: string;
    /** Deploys a CR head for review/verify (run by that step, not by the CLI). */
    preview?: string;
    /** Runs proof files on the merge base; {files} is filled. Without it, gate proofs-on-base fails closed. */
    proofs_on_base?: string;
    /** Exits 0 when every product.evidence kind exists for {sha}; the release ready check runs it. */
    evidence_check?: string;
  };
  paths: Record<string, string | string[]>;
  sizes: string[];
  ready_size_limit: string;
  fast_lane_max_size: string;
  priorities: string[];
  p0_setters: string[];
  max_subissue_depth: number;
  spec_marker: string;
  stall_minutes: number;
  parallel_agents: number;
  cycle: { max_implementations: number; min_ready: number; time_budget_minutes: number; failure_limit: number; dedupe_minutes?: number; max_rework?: number; land_wait_minutes?: number; max_tokens_per_ticket?: number };
  heartbeat: { ticket: string };
  /** delivery: release-line (default) cuts release lines for the last environment; continuous ships every environment from the trunk. */
  product: { environments: string[]; proofs: string[]; delivery?: 'release-line' | 'continuous'; evidence?: ('sbom' | 'provenance' | 'signature')[]; slo?: { change_failure_rate_max: number; window_days: number } };
  /** Who runs each step: the key is `<skill>/<step>`, else `<skill>`, else `default` is used (a one-step skill is named by the skill alone). */
  executors: { default: Executor; [step: string]: Executor };
  learning: {
    /** The self-improvement loop runs only when true (default false). */
    enabled?: boolean;
    every_cycles: number;
    min_evidence_runs: number;
    bench_size: number;
    auto_merge_classes: ('tuning' | 'guardrail')[];
    judge_tier: 'fast' | 'balanced' | 'deep';
    /** bench compare needs this many shared cases (default 20). */
    bench_min_cases?: number;
    /** bench run trials per case, and the trials compare needs (default 3). */
    bench_trials?: number;
    /** bench run caps: planned runs (cases x trials) and elapsed minutes. Bench results carry no token count, so there is no token cap. */
    bench_budget?: { max_runs?: number; max_minutes?: number };
  };
}

/** Every CLI module (board/, forge/, vcs/ index, gates, ledger, bench, install) exports `cli` of this type. */
export type PortCli = (argv: string[], ctx: Omit<AdapterContext, 'options'>) => Promise<number>;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRe = (p: string) =>
  new RegExp('^' + p.split(/(<ticket>|<name>)/).map((x) => x === '<ticket>' ? '[A-Za-z0-9_-]+' : x === '<name>' ? '[a-z0-9]+(?:-[a-z0-9]+)*' : esc(x)).join('') + '$');

/** A name that fits `vcs.change_pattern` or `vcs.factory_change_pattern`. */
export const isChangeLine = (b: Binding, n: string): boolean => patternRe(b.vcs.change_pattern).test(n) || patternRe(b.vcs.factory_change_pattern).test(n);

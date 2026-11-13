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
}

/** One review of a CR, oldest first. state is lower case: approved, changes_requested, commented, dismissed, pending. sha: the commit reviewed. */
export interface Review { user: string; state: string; sha: string }

export interface Run { id: string; name: string; ref: string; sha: string; state: 'pending' | 'success' | 'failure'; url: string; at: string }

export interface Forge {
  open(o: { source: string; title: string; body: string; draft: boolean }): Promise<CR>;
  view(n: string): Promise<CR>;
  viewBySha(sha: string): Promise<CR>;
  diff(n: string): Promise<string>;
  list(q?: { state?: 'open' | 'merged' | 'all' }): Promise<CR[]>;
  /** Merged CRs whose body closes ticket `id`. Optional: without it, callers filter list({ state: 'merged' }). */
  closing?(id: string): Promise<CR[]>;
  /** Asks the forge to cut a release line through its release workflow, which the Product owner approves. Optional. */
  cut?(revision: string, version: string): Promise<{ requested: true; url?: string }>;
  ready(n: string): Promise<CR>;
  draft(n: string): Promise<CR>;
  sync(n: string): Promise<CR>;
  automerge(n: string): Promise<CR>;
  comment(n: string, body: string): Promise<{ id: string; url?: string }>;
  /** Every human-visible comment on the CR, oldest first; author is the login or username. System notes are dropped. */
  comments(n: string): Promise<Comment[]>;
  /** Posts with review_token_env; { as: 'ci' } (only the proofs-on-base gate) posts with token_env, the CI job's own token. */
  status(sha: string, s: { context: string; state: 'pending' | 'success' | 'failure'; description: string; url?: string }, opts?: { as?: 'ci' }): Promise<void>;
  approve(n: string): Promise<void>;
  approvals(n: string): Promise<Review[]>;
  runs(q?: { ref?: string; failed?: boolean }): Promise<Run[]>;
}

export interface Vcs {
  start(name: string): Promise<{ workdir: string; ref: string }>;
  head(): Promise<{ ref: string; sha: string }>;
  changed(since?: string): Promise<string[]>;
  base(): Promise<{ sha: string }>;
  push(): Promise<void>;
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
}

export type Executor = StageDef &
  (
    | { kind: 'harness' }
    | { kind: 'command'; run: string }
    | { kind: 'webhook'; url_env: string; token_env?: string }
    | {
        kind: 'managed';
        /** Request shape: claude (Managed Agents sessions), cursor (Cloud Agents), antigravity (Gemini Interactions), generic (POST <endpoint>/sessions). */
        api?: 'claude' | 'cursor' | 'antigravity' | 'generic';
        agent_env?: string;
        token_env: string;
        endpoint_env?: string;
        environment_env?: string; // claude: environment_id
        repo_url?: string; // cursor: repos[].url
      }
    | { kind: 'assign'; user: string }
  );

export interface McpServer { url?: string; command?: string; token_env?: string }

/** The parsed binding. src/binding.ts validates it; keys follow references/architecture.md section 4. */
export interface Binding {
  version: 2;
  /** individual: subscriptions only; enterprise: APIs and managed agents (architecture.md section 10). */
  profile: 'individual' | 'enterprise';
  /** bots: the accounts the factory runs as; only their heartbeat comments are trusted. */
  owners: { product: string; factory: string; bots: string[] };
  board: {
    adapter: 'github' | 'jira' | 'linear' | 'local';
    options: Record<string, unknown>;
    mcp?: Record<string, unknown>;
    statuses: string[];
    fields: Partial<Record<LogicalField, string>>;
    labels: { human: string; bug: string; feature: string; release?: string };
    env_labels: string[];
    done_statuses: string[];
    later_milestone?: string;
    views?: string[];
    signal_streams: string[];
  };
  forge: {
    adapter: 'github' | 'gitlab' | 'azure' | 'bitbucket';
    options: Record<string, unknown>;
    review_identity: string;
    /** Who must approve besides the agent review (status human-approval). Absent: full-lane. */
    human_approval?: 'full-lane' | 'always' | 'never';
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
    /** Deploys a CR head for verify-ux (run by that skill, not by the CLI). */
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
  cycle: { max_implementations: number; min_ready: number; time_budget_minutes: number; failure_limit: number; dedupe_minutes?: number };
  heartbeat: { ticket: string };
  /** delivery: release-line (default) cuts release lines for the last environment; continuous ships every environment from the trunk. */
  product: { environments: string[]; proofs: string[]; delivery?: 'release-line' | 'continuous'; evidence?: ('sbom' | 'provenance' | 'signature')[] };
  executors: { default: Executor; [skill: string]: Executor };
  learning: {
    every_cycles: number;
    min_evidence_runs: number;
    bench_size: number;
    auto_merge_classes: ('tuning' | 'guardrail')[];
    judge_tier: 'fast' | 'balanced' | 'deep';
    budget_usd_per_week: number;
    /** bench compare needs this many shared cases (default 20). */
    bench_min_cases?: number;
    /** bench run trials per case, and the trials compare needs (default 3). */
    bench_trials?: number;
  };
}

/** Every CLI module (board/, forge/, vcs/ index, gates, ledger, bench, install) exports `cli` of this type. */
export type PortCli = (argv: string[], ctx: Omit<AdapterContext, 'options'>) => Promise<number>;

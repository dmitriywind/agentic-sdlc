export interface Ticket {
  id: string;
  stage: string;
  conditions: string[];
  evidence: string[];
  revision: string;
  priority?: number;
  dependencies?: string[];
  context?: string;
  eligible?: boolean;
  attempts?: Record<string, number>;
  retryAt?: Record<string, string>;
  escalations?: string[];
}

export interface Snapshot {
  revision: string;
  tickets: Ticket[];
}

export type TransitionAction = {
  type: 'transition';
  ticket: string;
  from: string;
  to: string;
  evidence: string;
};

export type DispatchAction = {
  type: 'dispatch';
  ticket: string;
  run: string;
  lane: string;
  revision: string;
  context?: string;
  attempt?: number;
  workId?: string;
  completionEvidence?: string;
  produces?: string[];
  requiresPlan?: boolean;
  requiresChange?: boolean;
  requiresPullRequest?: boolean;
  allowedProtectedPaths?: string[];
};

export type EscalateAction = {
  type: 'escalate';
  ticket: string;
  reason: string;
};

export type Action = TransitionAction | DispatchAction | EscalateAction;

export type Outcome = 'completed' | 'failed' | 'needs-human';

export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
}

export interface ExecutionInfo {
  route: string;
  profile: string;
  model?: string;
  effort?: string;
  fallbackIndex: number;
  goalContinuations: number;
  durationMs: number;
}

export interface RunResult {
  ticket: string;
  run: string;
  revision: string;
  nextRevision?: string;
  outcome: Outcome;
  retryable?: boolean;
  evidence?: string[];
  summary: string;
  plan?: string;
  pullRequest?: number;
  artifacts?: string[];
  changes?: string[];
  usage?: UsageInfo;
  execution?: ExecutionInfo;
  retryAt?: string;
  attempt?: number;
}

export interface RouteConfig {
  primary: string;
  fallbacks: string[];
  why: string;
}

export interface ProfileConfig {
  model: string;
  effort: string;
  command: string;
  args: string[];
  continueArgs?: string[];
  prompt?: 'stdin' | 'file';
}

export interface WorkRule {
  id: string;
  stage: string;
  run: string;
  lane: string;
  completionEvidence: string;
  produces: string[];
  requiresPlan?: boolean;
  requiresChange?: boolean;
  requiresPullRequest?: boolean;
  requiresEvidence?: string[];
  forbidsEvidence?: string[];
  allowedProtectedPaths?: string[];
}

export interface TransitionRule {
  from: string;
  to: string;
  evidence: string;
}

export interface Policy {
  tracker: {
    adapter: string;
    options?: Record<string, unknown>;
  };
  runner: {
    adapter: string;
    routes: Record<string, RouteConfig>;
    profiles: Record<string, ProfileConfig>;
    goal?: {
      enabled: boolean;
      maxContinuations: number;
    };
    workspace?: {
      enabled: boolean;
      baseRef: string;
      branchPrefix: string;
    };
  };
  process: {
    stages: string[];
    transitions: TransitionRule[];
    work: WorkRule[];
    conditions: string[];
  };
  limits: {
    maxParallel: number;
    maxAttempts: number;
    retryBackoffSeconds: number;
    intervalSeconds: number;
    runTimeoutSeconds: number;
  };
  rules: {
    files: string[];
    context: string[];
    protectedPaths: string[];
  };
  runtime: {
    directory: string;
    enabled?: boolean;
  };
}

export interface TrackerAdapter {
  read(): Promise<Snapshot>;
  transition(action: TransitionAction): Promise<void>;
  publish(result: RunResult): Promise<void>;
  escalate(action: EscalateAction): Promise<void>;
}

export interface DispatchRunOptions {
  ticket: Ticket;
  rule: WorkRule;
  route: RouteConfig;
  profiles: Record<string, ProfileConfig>;
  policy: Policy;
  projectRoot: string;
}

export interface RunnerAdapter {
  run(action: DispatchAction): Promise<RunResult>;
}

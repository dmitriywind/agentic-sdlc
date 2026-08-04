import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validatePolicy } from './policy.js';
import type {
  Action,
  DispatchAction,
  Outcome,
  Policy,
  RunResult,
  Snapshot,
  Ticket,
  TrackerAdapter,
  RunnerAdapter,
} from './types.js';

const OUTCOMES = new Set<string>(['completed', 'failed', 'needs-human']);

function hasAll(actual: string[], expected: string[] = []): boolean {
  const values = new Set(actual);
  return expected.every((value) => values.has(value));
}

function hasAny(actual: string[], expected: string[] = []): boolean {
  const values = new Set(actual);
  return expected.some((value) => values.has(value));
}

function retryTime(ticket: Ticket, run: string): number {
  const value = ticket.retryAt?.[run];
  return value ? Date.parse(value) : 0;
}

export function deriveActions(policy: Policy, snapshot: Snapshot, now: Date): Action[] {
  if (!snapshot || !Array.isArray(snapshot.tickets)) throw new Error('Tracker returned an invalid snapshot');
  const stageSet = new Set(policy.process.stages);
  const blocking = new Set(policy.process.conditions);
  const actions: Action[] = [];
  const tickets = [...snapshot.tickets].sort(
    (left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id)
  );

  for (const ticket of tickets) {
    if (
      !ticket.id ||
      !stageSet.has(ticket.stage) ||
      !Array.isArray(ticket.conditions) ||
      !Array.isArray(ticket.evidence) ||
      !ticket.revision
    ) {
      throw new Error(`Tracker returned an invalid ticket: ${ticket.id ?? '<unknown>'}`);
    }
    if (ticket.eligible === false) continue;

    const transition = policy.process.transitions.find(
      (item) => item.from === ticket.stage && ticket.evidence.includes(item.evidence)
    );
    if (transition) {
      actions.push({
        type: 'transition',
        ticket: ticket.id,
        from: ticket.stage,
        to: transition.to,
        evidence: transition.evidence,
      });
      continue;
    }

    if (ticket.conditions.some((condition) => blocking.has(condition))) continue;
    const rule = policy.process.work.find(
      (candidate) =>
        candidate.stage === ticket.stage &&
        hasAll(ticket.evidence, candidate.requiresEvidence) &&
        !hasAny(ticket.evidence, candidate.forbidsEvidence) &&
        !ticket.evidence.includes(candidate.completionEvidence)
    );
    if (!rule) continue;

    const attempt = Number(ticket.attempts?.[rule.run] ?? 0) + 1;
    const exhausted = attempt > policy.limits.maxAttempts;
    const reason = `attempts-exhausted:${rule.run}`;
    if (exhausted) {
      if (!(ticket.escalations ?? []).includes(reason)) {
        actions.push({ type: 'escalate', ticket: ticket.id, reason });
      }
      continue;
    }
    if (retryTime(ticket, rule.run) > now.getTime()) continue;

    actions.push({
      type: 'dispatch',
      ticket: ticket.id,
      run: rule.run,
      lane: rule.lane,
      revision: ticket.revision,
      context: ticket.context ?? '',
      attempt,
      workId: rule.id,
      completionEvidence: rule.completionEvidence,
      produces: rule.produces,
      requiresPlan: rule.requiresPlan === true,
      requiresChange: rule.requiresChange === true,
      requiresPullRequest: rule.requiresPullRequest === true,
      allowedProtectedPaths: rule.allowedProtectedPaths ?? [],
    });
  }
  return actions;
}

function pathMatches(path: string, prefix: string): boolean {
  const normalizedPath = String(path).replaceAll('\\', '/');
  const normalizedPrefix = String(prefix).replaceAll('\\', '/');
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(normalizedPrefix);
}

export function normalizeResult(policy: Policy, action: DispatchAction, value: any, now: Date): RunResult {
  const result = value && typeof value === 'object' ? value : {};
  const invalid: string[] = [];

  if (result.ticket !== action.ticket) invalid.push('ticket');
  if (result.run !== action.run) invalid.push('run');
  if (result.revision !== action.revision) invalid.push('revision');
  if (!OUTCOMES.has(result.outcome)) invalid.push('outcome');
  if (typeof result.summary !== 'string' || !result.summary.trim()) invalid.push('summary');

  const evidence: string[] = Array.isArray(result.evidence) ? result.evidence : [];
  const produces = action.produces ?? [];
  if (evidence.some((item) => !produces.includes(item))) invalid.push('evidence capability');

  if (
    action.requiresPlan &&
    result.outcome === 'completed' &&
    evidence.includes(action.completionEvidence ?? '') &&
    (typeof result.plan !== 'string' || !result.plan.trim())
  ) {
    invalid.push('durable plan');
  }

  if (
    action.requiresChange &&
    result.outcome === 'completed' &&
    evidence.includes(action.completionEvidence ?? '') &&
    !result.nextRevision
  ) {
    invalid.push('committed revision');
  }

  if (
    action.requiresPullRequest &&
    result.outcome === 'completed' &&
    evidence.includes(action.completionEvidence ?? '') &&
    !Number.isInteger(result.pullRequest)
  ) {
    invalid.push('pull request');
  }

  const changes: string[] = Array.isArray(result.changes) ? result.changes : [];
  const allowedProtected = action.allowedProtectedPaths ?? [];
  const protectedChange = changes.find(
    (path) =>
      policy.rules.protectedPaths.some((prefix) => pathMatches(path, prefix)) &&
      !allowedProtected.some((prefix: string) => pathMatches(path, prefix))
  );
  if (protectedChange) invalid.push(`protected path ${protectedChange}`);

  const attempt = action.attempt ?? 1;

  if (invalid.length) {
    return {
      ticket: action.ticket,
      run: action.run,
      revision: action.revision,
      attempt,
      outcome: 'needs-human',
      evidence: [],
      summary: `Run result rejected: ${invalid.join(', ')}`,
    };
  }

  const normalized: RunResult = {
    ticket: result.ticket,
    run: result.run,
    revision: result.revision,
    attempt,
    outcome: result.outcome as Outcome,
    retryable: Boolean(result.retryable),
    evidence,
    summary: result.summary,
    artifacts: Array.isArray(result.artifacts) ? result.artifacts : [],
    changes,
    usage: result.usage,
  };

  if (typeof result.plan === 'string' && result.plan.trim()) normalized.plan = result.plan.trim();
  if (result.nextRevision) normalized.nextRevision = result.nextRevision;
  if (Number.isInteger(result.pullRequest)) normalized.pullRequest = result.pullRequest;
  if (result.execution && typeof result.execution === 'object' && !Array.isArray(result.execution)) {
    normalized.execution = result.execution;
  }
  if (normalized.outcome === 'failed' && normalized.retryable) {
    normalized.retryAt = new Date(
      now.getTime() + policy.limits.retryBackoffSeconds * 1000 * Math.pow(2, attempt - 1)
    ).toISOString();
  }
  if (normalized.outcome === 'failed' && !normalized.retryable) {
    normalized.outcome = 'needs-human';
  }
  return normalized;
}

interface State {
  pending: RunResult[];
}

async function readState(path: string): Promise<State> {
  try {
    const state = JSON.parse(await readFile(path, 'utf8'));
    return { pending: Array.isArray(state.pending) ? state.pending : [] };
  } catch (error: any) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return { pending: [] };
    throw error;
  }
}

async function writeState(path: string, state: State): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export interface SupervisorOptions {
  tracker: TrackerAdapter;
  runner: RunnerAdapter;
  root?: string;
  clock?: () => Date;
}

export interface TickOptions {
  readOnly?: boolean;
}

export interface TickResult {
  actions: Action[];
  published: RunResult[];
  rejected: RunResult[];
  results: RunResult[];
}

export function createSupervisor(
  policy: Policy,
  { tracker, runner, root = process.cwd(), clock = () => new Date() }: SupervisorOptions
) {
  validatePolicy(policy);
  if (!tracker?.read || !tracker?.publish || !tracker?.transition || !tracker?.escalate) {
    throw new Error('Tracker adapter must implement read, publish, transition, and escalate');
  }
  if (!runner?.run) throw new Error('Runner adapter must implement run');

  const statePath = resolve(root, policy.runtime.directory, 'state.json');
  let ticking = false;

  return {
    async tick({ readOnly = false }: TickOptions = {}): Promise<TickResult> {
      if (ticking) throw new Error('Agentic SDLC tick already running');
      ticking = true;
      try {
        const now = clock();
        if (readOnly) {
          const snapshot = await tracker.read();
          return {
            actions: deriveActions(policy, snapshot, now),
            published: [],
            rejected: [],
            results: [],
          };
        }

        const state = await readState(statePath);
        const published: RunResult[] = [];
        const rejected: RunResult[] = [];
        const retained: RunResult[] = [];
        const publicationFailures: string[] = [];

        for (const result of state.pending) {
          try {
            await tracker.publish(result);
            published.push(result);
          } catch (error: any) {
            if (error?.code === 'STALE_RESULT') rejected.push(result);
            else {
              retained.push(result);
              publicationFailures.push(
                `${result.ticket}/${result.run}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        }
        state.pending = retained;
        await writeState(statePath, state);

        if (retained.length) {
          throw new Error(`Tracker publication failed; pending results retained (${publicationFailures.join('; ')})`);
        }

        const snapshot = await tracker.read();
        const actions = deriveActions(policy, snapshot, now);

        for (const action of actions.filter((item): item is Extract<Action, { type: 'transition' }> => item.type === 'transition')) {
          await tracker.transition(action);
        }
        for (const action of actions.filter((item): item is Extract<Action, { type: 'escalate' }> => item.type === 'escalate')) {
          await tracker.escalate(action);
        }

        const dispatchActions = actions.filter((item): item is DispatchAction => item.type === 'dispatch');
        const claims = (policy.runtime.enabled !== false ? dispatchActions : [])
          .slice(0, policy.limits.maxParallel);

        const results = await Promise.all(
          claims.map(async (action) => {
            try {
              return normalizeResult(policy, action, await runner.run(action), now);
            } catch (error: any) {
              return normalizeResult(
                policy,
                action,
                {
                  ticket: action.ticket,
                  run: action.run,
                  revision: action.revision,
                  outcome: 'failed',
                  retryable: true,
                  summary: error.message,
                  ...(error.execution ? { execution: error.execution } : {}),
                },
                now
              );
            }
          })
        );

        state.pending.push(...results);
        await writeState(statePath, state);
        return { actions, published, rejected, results };
      } finally {
        ticking = false;
      }
    },
  };
}

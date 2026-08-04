import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const OUTCOMES = new Set(['completed', 'failed', 'needs-human']);

function fail(message) {
  throw new Error(`Invalid Agentic SDLC policy: ${message}`);
}

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}

function inside(root, path, label) {
  const target = resolve(root, path);
  const relation = relative(root, target);
  if (relation === '..' || relation.startsWith(`..\\`) || relation.startsWith('../') || isAbsolute(relation)) {
    fail(`${label} must stay inside the project`);
  }
}

export function validatePolicy(policy, { root } = {}) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) fail('root must be an object');
  const stages = policy.process?.stages;
  const transitions = policy.process?.transitions;
  const work = policy.process?.work;
  const conditions = policy.process?.conditions;
  const routes = policy.runner?.routes;
  const profiles = policy.runner?.profiles;
  if (!Array.isArray(stages) || stages.length === 0) fail('process.stages must be non-empty');
  if (!Array.isArray(transitions) || !Array.isArray(work) || !Array.isArray(conditions)) {
    fail('process.transitions, process.work, and process.conditions must be arrays');
  }
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
    fail('runner.routes must be an object');
  }
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    fail('runner.profiles must be an object');
  }

  unique(stages, 'stage names');
  unique(conditions, 'condition names');
  unique(Object.keys(routes), 'route names');
  unique(Object.keys(profiles), 'profile names');
  unique(work.map((rule) => rule.id), 'work rule ids');
  unique(transitions.map((item) => `${item.from}\0${item.to}\0${item.evidence}`), 'transitions');

  const stageSet = new Set(stages);
  for (const transition of transitions) {
    if (!stageSet.has(transition.from) || !stageSet.has(transition.to) || !transition.evidence) {
      fail('each transition needs known from/to stages and evidence');
    }
  }
  for (const rule of work) {
    if (!rule.id || !stageSet.has(rule.stage) || !rule.run || !routes[rule.lane]) {
      fail('each work rule needs an id, known stage, run, and lane');
    }
    if (!rule.completionEvidence || !Array.isArray(rule.produces)) {
      fail(`work rule ${rule.id} needs completionEvidence and produces`);
    }
    for (const key of ['requiresEvidence', 'forbidsEvidence', 'allowedProtectedPaths']) {
      if (rule[key] !== undefined && !Array.isArray(rule[key])) fail(`${rule.id}.${key} must be an array`);
    }
    for (const key of ['requiresPlan', 'requiresChange', 'requiresPullRequest']) {
      if (rule[key] !== undefined && typeof rule[key] !== 'boolean') fail(`${rule.id}.${key} must be boolean`);
    }
  }

  for (const [name, route] of Object.entries(routes)) {
    if (typeof route.why !== 'string' || !route.why.trim()) fail(`route ${name} needs why`);
    if (!profiles[route.primary]) fail(`route ${name} has an unknown primary profile`);
    if (!Array.isArray(route.fallbacks)) fail(`route ${name}.fallbacks must be an array`);
    const candidates = [route.primary, ...route.fallbacks];
    unique(candidates, `route ${name} profiles`);
    if (candidates.some((profile) => !profiles[profile])) fail(`route ${name} has an unknown fallback profile`);
  }
  for (const [name, profile] of Object.entries(profiles)) {
    if (typeof profile.model !== 'string' || !profile.model.trim()) fail(`profile ${name} needs model`);
    if (typeof profile.effort !== 'string' || !profile.effort.trim()) fail(`profile ${name} needs effort`);
    if (typeof profile.command !== 'string' || !profile.command) fail(`profile ${name} needs command`);
    if (!Array.isArray(profile.args)) fail(`profile ${name}.args must be an array`);
    if (profile.continueArgs !== undefined && !Array.isArray(profile.continueArgs)) {
      fail(`profile ${name}.continueArgs must be an array`);
    }
    if (profile.prompt !== undefined && !['stdin', 'file'].includes(profile.prompt)) {
      fail(`profile ${name}.prompt must be stdin or file`);
    }
  }
  if (typeof policy.runner.goal?.enabled !== 'boolean') fail('runner.goal.enabled must be boolean');
  if (!Number.isInteger(policy.runner.goal?.maxContinuations)
    || policy.runner.goal.maxContinuations < 0) {
    fail('runner.goal.maxContinuations must be a non-negative integer');
  }
  if (typeof policy.runner.workspace?.baseRef !== 'string' || !policy.runner.workspace.baseRef.trim()) {
    fail('runner.workspace.baseRef must be a non-empty string');
  }
  if (typeof policy.runner.workspace?.enabled !== 'boolean') fail('runner.workspace.enabled must be boolean');
  if (typeof policy.runner.workspace?.branchPrefix !== 'string' || !policy.runner.workspace.branchPrefix.trim()) {
    fail('runner.workspace.branchPrefix must be a non-empty string');
  }

  for (const name of [
    'maxParallel',
    'maxAttempts',
    'retryBackoffSeconds',
    'intervalSeconds',
    'runTimeoutSeconds',
  ]) {
    if (!Number.isFinite(policy.limits?.[name]) || policy.limits[name] <= 0) {
      fail(`limits.${name} must be positive`);
    }
  }
  if (!policy.tracker?.adapter || !policy.runner?.adapter) fail('tracker.adapter and runner.adapter are required');
  if (!Array.isArray(policy.rules?.files)
    || !Array.isArray(policy.rules?.context)
    || !Array.isArray(policy.rules?.protectedPaths)) {
    fail('rules.files, rules.context, and rules.protectedPaths must be arrays');
  }
  if (!policy.runtime?.directory) fail('runtime.directory is required');
  if (policy.runtime.enabled !== undefined && typeof policy.runtime.enabled !== 'boolean') {
    fail('runtime.enabled must be boolean');
  }

  if (root) {
    inside(root, policy.tracker.adapter, 'tracker.adapter');
    inside(root, policy.runner.adapter, 'runner.adapter');
    inside(root, policy.runtime.directory, 'runtime.directory');
    for (const path of [...policy.rules.files, ...policy.rules.context]) inside(root, path, 'rules path');
  }
  return policy;
}

function hasAll(actual, expected = []) {
  const values = new Set(actual);
  return expected.every((value) => values.has(value));
}

function hasAny(actual, expected = []) {
  const values = new Set(actual);
  return expected.some((value) => values.has(value));
}

function retryTime(ticket, run) {
  const value = ticket.retryAt?.[run];
  return value ? Date.parse(value) : 0;
}

function derive(policy, snapshot, now) {
  if (!snapshot || !Array.isArray(snapshot.tickets)) throw new Error('Tracker returned an invalid snapshot');
  const stageSet = new Set(policy.process.stages);
  const blocking = new Set(policy.process.conditions);
  const actions = [];
  const tickets = [...snapshot.tickets].sort(
    (left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id),
  );

  for (const ticket of tickets) {
    if (!ticket.id || !stageSet.has(ticket.stage) || !Array.isArray(ticket.conditions)
      || !Array.isArray(ticket.evidence) || !ticket.revision) {
      throw new Error(`Tracker returned an invalid ticket: ${ticket.id ?? '<unknown>'}`);
    }
    if (ticket.eligible === false) continue;

    const transition = policy.process.transitions.find(
      (item) => item.from === ticket.stage && ticket.evidence.includes(item.evidence),
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
    const rule = policy.process.work.find((candidate) => (
      candidate.stage === ticket.stage
      && hasAll(ticket.evidence, candidate.requiresEvidence)
      && !hasAny(ticket.evidence, candidate.forbidsEvidence)
      && !ticket.evidence.includes(candidate.completionEvidence)
    ));
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

function pathMatches(path, prefix) {
  const normalizedPath = String(path).replaceAll('\\', '/');
  const normalizedPrefix = String(prefix).replaceAll('\\', '/');
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(normalizedPrefix);
}

function normalizeResult(policy, action, value, now) {
  const result = value && typeof value === 'object' ? value : {};
  const invalid = [];
  if (result.ticket !== action.ticket) invalid.push('ticket');
  if (result.run !== action.run) invalid.push('run');
  if (result.revision !== action.revision) invalid.push('revision');
  if (!OUTCOMES.has(result.outcome)) invalid.push('outcome');
  if (typeof result.summary !== 'string' || !result.summary.trim()) invalid.push('summary');
  const evidence = Array.isArray(result.evidence) ? result.evidence : [];
  if (evidence.some((item) => !action.produces.includes(item))) invalid.push('evidence capability');
  if (action.requiresPlan && result.outcome === 'completed'
    && evidence.includes(action.completionEvidence)
    && (typeof result.plan !== 'string' || !result.plan.trim())) {
    invalid.push('durable plan');
  }
  if (action.requiresChange && result.outcome === 'completed'
    && evidence.includes(action.completionEvidence) && !result.nextRevision) invalid.push('committed revision');
  if (action.requiresPullRequest && result.outcome === 'completed'
    && evidence.includes(action.completionEvidence) && !Number.isInteger(result.pullRequest)) invalid.push('pull request');
  const changes = Array.isArray(result.changes) ? result.changes : [];
  const protectedChange = changes.find((path) => (
    policy.rules.protectedPaths.some((prefix) => pathMatches(path, prefix))
    && !action.allowedProtectedPaths.some((prefix) => pathMatches(path, prefix))
  ));
  if (protectedChange) invalid.push(`protected path ${protectedChange}`);

  if (invalid.length) {
    return {
      ticket: action.ticket,
      run: action.run,
      revision: action.revision,
      attempt: action.attempt,
      outcome: 'needs-human',
      evidence: [],
      summary: `Run result rejected: ${invalid.join(', ')}`,
    };
  }

  const normalized = {
    ticket: result.ticket,
    run: result.run,
    revision: result.revision,
    attempt: action.attempt,
    outcome: result.outcome,
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
      now.getTime() + policy.limits.retryBackoffSeconds * 1000 * (2 ** (action.attempt - 1)),
    ).toISOString();
  }
  if (normalized.outcome === 'failed' && !normalized.retryable) {
    normalized.outcome = 'needs-human';
  }
  return normalized;
}

async function readState(path) {
  try {
    const state = JSON.parse(await readFile(path, 'utf8'));
    return { pending: Array.isArray(state.pending) ? state.pending : [] };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return { pending: [] };
    throw error;
  }
}

async function writeState(path, state) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function createSupervisor(policy, {
  tracker,
  runner,
  root = process.cwd(),
  clock = () => new Date(),
} = {}) {
  validatePolicy(policy);
  if (!tracker?.read || !tracker?.publish || !tracker?.transition || !tracker?.escalate) {
    throw new Error('Tracker adapter must implement read, publish, transition, and escalate');
  }
  if (!runner?.run) throw new Error('Runner adapter must implement run');
  const statePath = resolve(root, policy.runtime.directory, 'state.json');
  let ticking = false;

  return {
    async tick({ readOnly = false } = {}) {
      if (ticking) throw new Error('Agentic SDLC tick already running');
      ticking = true;
      try {
        const now = clock();
        if (readOnly) {
          const snapshot = await tracker.read();
          return {
            actions: derive(policy, snapshot, now),
            published: [],
            rejected: [],
            results: [],
          };
        }
        const state = await readState(statePath);
        const published = [];
        const rejected = [];
        const retained = [];
        const publicationFailures = [];
        for (const result of state.pending) {
          try {
            await tracker.publish(result);
            published.push(result);
          } catch (error) {
            if (error?.code === 'STALE_RESULT') rejected.push(result);
            else {
              retained.push(result);
              publicationFailures.push(`${result.ticket}/${result.run}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
        state.pending = retained;
        await writeState(statePath, state);
        if (retained.length) {
          throw new Error(`Tracker publication failed; pending results retained (${publicationFailures.join('; ')})`);
        }

        const snapshot = await tracker.read();
        const actions = derive(policy, snapshot, now);
        for (const action of actions.filter((item) => item.type === 'transition')) {
          await tracker.transition(action);
        }
        for (const action of actions.filter((item) => item.type === 'escalate')) {
          await tracker.escalate(action);
        }

        const claims = actions
          .filter((item) => item.type === 'dispatch')
          .filter(() => policy.runtime.enabled !== false)
          .slice(0, policy.limits.maxParallel);
        const results = await Promise.all(claims.map(async (action) => {
          try {
            return normalizeResult(policy, action, await runner.run(action), now);
          } catch (error) {
            return normalizeResult(policy, action, {
              ticket: action.ticket,
              run: action.run,
              revision: action.revision,
              outcome: 'failed',
              retryable: true,
              summary: error.message,
              ...(error.execution ? { execution: error.execution } : {}),
            }, now);
          }
        }));
        state.pending.push(...results);
        await writeState(statePath, state);
        return { actions, published, rejected, results };
      } finally {
        ticking = false;
      }
    },
  };
}

import { isAbsolute, relative, resolve } from 'node:path';
import type { Policy } from './types.js';

function fail(message: string): never {
  throw new Error(`Invalid Agentic SDLC policy: ${message}`);
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}

function inside(root: string, path: string, label: string): void {
  const target = resolve(root, path);
  const relation = relative(root, target);
  if (relation === '..' || relation.startsWith('..\\') || relation.startsWith('../') || isAbsolute(relation)) {
    fail(`${label} must stay inside the project`);
  }
}

export function validatePolicy(policy: Policy, { root }: { root?: string } = {}): Policy {
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
    for (const key of ['requiresEvidence', 'forbidsEvidence', 'allowedProtectedPaths'] as const) {
      if (rule[key] !== undefined && !Array.isArray(rule[key])) fail(`${rule.id}.${key} must be an array`);
    }
    for (const key of ['requiresPlan', 'requiresChange', 'requiresPullRequest'] as const) {
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

  if (policy.runner.goal?.enabled !== undefined && typeof policy.runner.goal.enabled !== 'boolean') {
    fail('runner.goal.enabled must be boolean');
  }
  if (
    policy.runner.goal?.maxContinuations !== undefined &&
    (!Number.isInteger(policy.runner.goal.maxContinuations) || policy.runner.goal.maxContinuations < 0)
  ) {
    fail('runner.goal.maxContinuations must be a non-negative integer');
  }
  if (
    policy.runner.workspace?.baseRef !== undefined &&
    (typeof policy.runner.workspace.baseRef !== 'string' || !policy.runner.workspace.baseRef.trim())
  ) {
    fail('runner.workspace.baseRef must be a non-empty string');
  }
  if (policy.runner.workspace?.enabled !== undefined && typeof policy.runner.workspace.enabled !== 'boolean') {
    fail('runner.workspace.enabled must be boolean');
  }
  if (
    policy.runner.workspace?.branchPrefix !== undefined &&
    (typeof policy.runner.workspace.branchPrefix !== 'string' || !policy.runner.workspace.branchPrefix.trim())
  ) {
    fail('runner.workspace.branchPrefix must be a non-empty string');
  }

  for (const name of ['maxParallel', 'maxAttempts', 'retryBackoffSeconds', 'intervalSeconds', 'runTimeoutSeconds'] as const) {
    if (!Number.isFinite(policy.limits?.[name]) || policy.limits[name] <= 0) {
      fail(`limits.${name} must be positive`);
    }
  }

  if (!policy.tracker?.adapter || !policy.runner?.adapter) fail('tracker.adapter and runner.adapter are required');
  if (
    !Array.isArray(policy.rules?.files) ||
    !Array.isArray(policy.rules?.context) ||
    !Array.isArray(policy.rules?.protectedPaths)
  ) {
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

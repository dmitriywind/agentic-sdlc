#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createSupervisor } from './supervisor.mjs';
import { loadPolicy } from './validate.mjs';

function has(flag) {
  return process.argv.includes(flag);
}

function value(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
}

function summarize(action) {
  return Object.fromEntries([
    'type',
    'ticket',
    'run',
    'lane',
    'from',
    'to',
    'evidence',
    'reason',
    'revision',
    'attempt',
  ].filter((key) => action[key] !== undefined).map((key) => [key, action[key]]));
}

async function adapter(root, path, factory, options) {
  const module = await import(pathToFileURL(resolve(root, path)));
  if (typeof module[factory] !== 'function') throw new Error(`${path} must export ${factory}()`);
  return module[factory](options);
}

export async function start({
  policyPath = 'agentic-sdlc-policy.json',
  once = false,
  readOnly = false,
} = {}) {
  const { policy, root } = await loadPolicy(policyPath);
  const tracker = await adapter(root, policy.tracker.adapter, 'createTracker', {
    policy,
    root,
    options: policy.tracker.options,
  });
  const runner = await adapter(root, policy.runner.adapter, 'createRunner', { policy, root });
  const supervisor = createSupervisor(policy, { tracker, runner, root });

  async function tick() {
    const report = await supervisor.tick({ readOnly });
    console.log(JSON.stringify({
      at: new Date().toISOString(),
      readOnly,
      actions: report.actions.length,
      published: report.published.length,
      rejected: report.rejected.length,
      results: report.results.length,
      ...(readOnly ? { derivedActions: report.actions.map(summarize) } : {}),
    }));
  }

  await tick();
  if (once) return;
  const timer = setInterval(() => tick().catch((error) => console.error(error.stack ?? error.message)),
    policy.limits.intervalSeconds * 1000);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      clearInterval(timer);
      process.exitCode = 0;
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  start({
    policyPath: value('--policy', 'agentic-sdlc-policy.json'),
    once: has('--once'),
    readOnly: has('--read-only'),
  }).catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

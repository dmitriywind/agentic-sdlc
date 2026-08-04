#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePolicy } from './supervisor.mjs';

export async function loadPolicy(path) {
  const policyPath = resolve(path);
  const root = dirname(policyPath);
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  validatePolicy(policy, { root });
  return { policy, policyPath, root };
}

export async function validateInstallation(path) {
  const loaded = await loadPolicy(path);
  const required = [
    loaded.policy.tracker.adapter,
    loaded.policy.runner.adapter,
    ...loaded.policy.rules.files,
    ...loaded.policy.rules.context,
  ];
  await Promise.all(required.map((item) => access(resolve(loaded.root, item))));
  return loaded;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? 'agentic-sdlc-policy.json';
  try {
    const { policyPath } = await validateInstallation(path);
    console.log(`Agentic SDLC policy valid: ${policyPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

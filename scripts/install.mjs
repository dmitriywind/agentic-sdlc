#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePolicy } from './supervisor.mjs';

const START = '<!-- agentic-sdlc:start -->';
const END = '<!-- agentic-sdlc:end -->';
const BLOCK = `${START}
## Agentic SDLC

Work and delivery evidence live in the tracker configured by \`agentic-sdlc-policy.json\`. Use the
\`agentic-sdlc\` skill for installation, operation, or process changes; its specification is the
portable authority. Keep project rules as a pointer—do not duplicate the workflow here.
${END}`;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

export function upsertRulesBlock(source) {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start >= 0 && end > start) {
    return `${source.slice(0, start)}${BLOCK}${source.slice(end + END.length)}`;
  }
  return `${source.trimEnd()}\n\n---\n\n${BLOCK}\n`;
}

export async function install({
  root = process.cwd(),
  policyName = 'agentic-sdlc-policy.json',
} = {}) {
  const projectRoot = resolve(root);
  const policyPath = join(projectRoot, policyName);
  const template = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'policy.template.json');
  let created = false;
  try {
    await readFile(policyPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await copyFile(template, policyPath);
    created = true;
  }

  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  validatePolicy(policy, { root: projectRoot });
  for (const rulesPath of policy.rules.files) {
    const path = resolve(projectRoot, rulesPath);
    await mkdir(dirname(path), { recursive: true });
    const source = await readFile(path, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    const updated = upsertRulesBlock(source);
    if (updated !== source) await writeFile(path, updated, 'utf8');
  }
  return { created, policyPath, rules: policy.rules.files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await install({
      root: argument('--root', '.'),
      policyName: argument('--policy', 'agentic-sdlc-policy.json'),
    });
    console.log(`${result.created ? 'Created' : 'Kept'} ${result.policyPath}`);
    console.log(`Updated Agentic SDLC block in ${result.rules.length} project-rules file(s).`);
    if (result.created) console.log('Configure tracker and CLI lanes, then run validate.mjs.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

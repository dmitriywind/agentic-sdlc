import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePolicy } from './policy.js';

const START = '<!-- agentic-sdlc:start -->';
const END = '<!-- agentic-sdlc:end -->';
const BLOCK = `${START}
## Agentic SDLC

Work and delivery evidence live in the tracker configured by \`agentic-sdlc-policy.json\`. Use \`npx agentic-sdlc\` for installation, validation, or supervision; its specification is the portable authority. Keep project rules as a pointer—do not duplicate the workflow here.
${END}`;

export function upsertRulesBlock(source: string): string {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start >= 0 && end > start) {
    return `${source.slice(0, start)}${BLOCK}${source.slice(end + END.length)}`;
  }
  return `${source.trimEnd()}\n\n---\n\n${BLOCK}\n`;
}

export interface InstallOptions {
  root?: string;
  policyName?: string;
}

export interface InstallResult {
  created: boolean;
  policyPath: string;
  rules: string[];
}

export async function install({
  root = process.cwd(),
  policyName = 'agentic-sdlc-policy.json',
}: InstallOptions = {}): Promise<InstallResult> {
  const projectRoot = resolve(root);
  const policyPath = join(projectRoot, policyName);
  const template = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'policy.template.json');

  let created = false;
  try {
    await readFile(policyPath, 'utf8');
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    await copyFile(template, policyPath).catch(async () => {
      // Fallback template inline if template file relative path fails in bundled mode
      const defaultPolicy = {
        tracker: { adapter: "src/trackers/local.ts", options: { path: ".agentic-sdlc/tracker.json" } },
        runner: {
          adapter: "src/runners/process.ts",
          routes: {
            triage: { primary: "claude", fallbacks: [], why: "Classification" },
            planning: { primary: "claude", fallbacks: [], why: "Planning" },
            execution: { primary: "claude", fallbacks: [], why: "Coding" },
            review: { primary: "claude", fallbacks: [], why: "Reviewing" }
          },
          profiles: {
            claude: { model: "claude-3-7-sonnet-20250219", effort: "high", command: "claude", args: ["--dangerously-skip-permissions"] }
          },
          workspace: { enabled: true, baseRef: "main", branchPrefix: "agentic/" }
        },
        process: {
          stages: ["triage", "planning", "implementation", "review", "done"],
          transitions: [
            { from: "triage", to: "planning", evidence: "triage-ready" },
            { from: "planning", to: "implementation", evidence: "plan-ready" },
            { from: "implementation", to: "review", evidence: "change-submitted" },
            { from: "review", to: "done", evidence: "change-approved" }
          ],
          work: [
            { id: "triage", stage: "triage", run: "triage", lane: "triage", completionEvidence: "triage-ready", produces: ["triage-ready"] },
            { id: "plan", stage: "planning", run: "plan", lane: "planning", completionEvidence: "plan-ready", produces: ["plan-ready"], requiresPlan: true },
            { id: "build", stage: "implementation", run: "build", lane: "execution", completionEvidence: "change-submitted", produces: ["change-submitted"], requiresChange: true, requiresPullRequest: true },
            { id: "review", stage: "review", run: "review", lane: "review", completionEvidence: "change-approved", produces: ["change-approved"] }
          ],
          conditions: ["waiting:decision", "waiting:dependency"]
        },
        limits: { maxParallel: 1, maxAttempts: 3, retryBackoffSeconds: 10, intervalSeconds: 30, runTimeoutSeconds: 300 },
        rules: { files: ["AGENTS.md"], context: [], protectedPaths: ["package.json"] },
        runtime: { directory: ".agentic-sdlc/runtime" }
      };
      await writeFile(policyPath, `${JSON.stringify(defaultPolicy, null, 2)}\n`, 'utf8');
    });
    created = true;
  }

  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  validatePolicy(policy, { root: projectRoot });

  for (const rulesPath of policy.rules.files) {
    const path = resolve(projectRoot, rulesPath);
    await mkdir(dirname(path), { recursive: true });
    const source = await readFile(path, 'utf8').catch((error: any) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    const updated = upsertRulesBlock(source);
    if (updated !== source) await writeFile(path, updated, 'utf8');
  }

  return { created, policyPath, rules: policy.rules.files };
}

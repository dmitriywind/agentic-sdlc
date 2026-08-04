import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { install } from './installer.js';
import { validatePolicy } from './policy.js';
import { createProcessRunner } from './runners/process.js';
import { createSupervisor } from './supervisor.js';
import { createLocalTracker } from './trackers/local.js';
import { createGitHubTracker } from './trackers/github.js';
import { createJiraTracker } from './trackers/jira.js';

function parseArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export async function runCli(): Promise<void> {
  const command = process.argv[2] ?? '--help';
  const root = parseArg('--root', process.cwd());
  const policyName = parseArg('--policy', 'agentic-sdlc-policy.json');
  const policyPath = resolve(root, policyName);

  switch (command) {
    case 'init':
    case 'install': {
      const result = await install({ root, policyName });
      console.log(`${result.created ? 'Created' : 'Kept'} ${result.policyPath}`);
      console.log(`Updated Agentic SDLC block in ${result.rules.length} project-rules file(s).`);
      break;
    }

    case 'validate': {
      const policy = JSON.parse(await readFile(policyPath, 'utf8'));
      validatePolicy(policy, { root });
      console.log(`Policy '${policyName}' is valid.`);
      break;
    }

    case 'supervise': {
      const readOnly = hasFlag('--read-only');
      const once = hasFlag('--once');
      const policy = JSON.parse(await readFile(policyPath, 'utf8'));
      validatePolicy(policy, { root });

      let tracker;
      if (policy.tracker.adapter.includes('jira')) {
        tracker = createJiraTracker({ root, options: policy.tracker.options });
      } else if (policy.tracker.adapter.includes('github')) {
        tracker = createGitHubTracker({ root, options: policy.tracker.options });
      } else {
        tracker = createLocalTracker({ root, options: policy.tracker.options });
      }

      const runner = createProcessRunner({ policy, root });
      const supervisor = createSupervisor(policy, { tracker, runner, root });

      if (once) {
        const result = await supervisor.tick({ readOnly });
        console.log(`Supervisor tick complete (${readOnly ? 'read-only' : 'mutating'}). Actions: ${result.actions.length}, Results: ${result.results.length}`);
      } else {
        console.log(`Agentic SDLC supervisor daemon started. Interval: ${policy.limits.intervalSeconds}s.`);
        const tick = async () => {
          try {
            const result = await supervisor.tick({ readOnly });
            if (result.actions.length > 0) {
              console.log(`Tick actions: ${result.actions.length}`);
            }
          } catch (err: any) {
            console.error(`Supervisor error: ${err.message}`);
          }
        };
        await tick();
        setInterval(tick, policy.limits.intervalSeconds * 1000);
      }
      break;
    }

    case '--help':
    case '-h':
    default: {
      console.log(`
Agentic SDLC CLI (npx agentic-sdlc)

Usage:
  npx agentic-sdlc init                     Initialize project policy and rules pointers
  npx agentic-sdlc validate [--policy path] Validate project policy file
  npx agentic-sdlc supervise [--once] [--read-only]  Run supervisor loop
`);
      break;
    }
  }
}

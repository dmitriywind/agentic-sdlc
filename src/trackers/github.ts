import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { EscalateAction, RunResult, Snapshot, Ticket, TrackerAdapter, TransitionAction } from '../types.js';

export interface GitHubTrackerOptions {
  root?: string;
  options?: {
    owner?: string;
    projectNumber?: number;
    tokenEnv?: string;
  };
}

function gh(args: string[], { cwd, tokenEnv }: { cwd: string; tokenEnv?: string }, input?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (tokenEnv) {
      const token = process.env[tokenEnv];
      if (!token) {
        reject(new Error(`GitHub token environment variable '${tokenEnv}' is not set`));
        return;
      }
      env.GH_TOKEN = token;
      if (tokenEnv !== 'GH_TOKEN') delete env[tokenEnv];
    }
    const child = execFile(
      'gh',
      args,
      {
        cwd,
        env,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || error.message).trim();
          if (/requires one of the following scopes.*read:project|token has not been granted.*read:project/is.test(detail)) {
            reject(
              new Error('GitHub Projects authorization is missing. Run: gh auth refresh -h github.com -s project')
            );
          } else if (/Resource not accessible by personal access token/i.test(detail)) {
            reject(
              new Error(
                'The configured PAT cannot access this Project. Fine-grained PATs do not support user-owned Projects; use GitHub CLI OAuth with the project scope or a compatible GitHub App.'
              )
            );
          } else {
            reject(new Error(detail));
          }
        } else resolve(stdout ? JSON.parse(stdout) : null);
      }
    );
    if (input !== undefined && child.stdin) child.stdin.end(input);
  });
}

function graphql(query: string, variables: Record<string, any>, options: { cwd: string; tokenEnv?: string }): Promise<any> {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [name, value] of Object.entries(variables)) {
    args.push(Number.isInteger(value) ? '-F' : '-f', `${name}=${value}`);
  }
  return gh(args, options).then((body) => {
    if (body.errors?.length) throw new Error(body.errors.map((error: any) => error.message).join('; '));
    return body.data;
  });
}

function marker(prefix: string, value: any): string {
  return `<!-- agentic-sdlc:${prefix} ${JSON.stringify(value)} -->`;
}

function parseMarkers(comments: Array<{ body: string }>, prefix: string): any[] {
  const expression = new RegExp(`<!--\\s*agentic-sdlc:${prefix}\\s+(.+?)\\s*-->`, 'g');
  return comments
    .flatMap((comment) =>
      [...comment.body.matchAll(expression)].map((match) => {
        try {
          return JSON.parse(match[1]);
        } catch {
          return null;
        }
      })
    )
    .filter(Boolean);
}

export function estimateModelCost(
  model?: string,
  usage?: any,
  summary?: string,
  customRates?: [number, number]
): number | undefined {
  if (typeof usage?.cost === 'number') return usage.cost;

  let inputTokens = usage?.inputTokens;
  let outputTokens = usage?.outputTokens;
  let totalTokens = usage?.totalTokens;

  if (!totalTokens && summary) {
    const match = summary.match(/(\d[\d,]*)\s+tokens/i);
    if (match) totalTokens = parseInt(match[1].replace(/,/g, ''), 10);
  }

  if (inputTokens === undefined && outputTokens === undefined && !totalTokens) return undefined;

  let rates: [number, number] = customRates ?? [2.5, 10.0];
  if (!customRates && model) {
    const name = model.toLowerCase();
    if (name.includes('local') || name.includes('free')) rates = [0, 0];
    else if (name.includes('flash') || name.includes('haiku') || name.includes('small') || name.includes('mini')) rates = [0.5, 3.0];
    else if (name.includes('opus') || name.includes('large') || name.includes('max')) rates = [15.0, 75.0];
    else if (name.includes('sonnet') || name.includes('pro') || name.includes('medium')) rates = [3.0, 15.0];
    else rates = [2.5, 10.0];
  }

  if (inputTokens !== undefined || outputTokens !== undefined) {
    const inCost = ((inputTokens ?? 0) * rates[0]) / 1000000;
    const outCost = ((outputTokens ?? 0) * rates[1]) / 1000000;
    return inCost + outCost;
  }

  const blendedRate = rates[0] * 0.8 + rates[1] * 0.2;
  return (totalTokens * blendedRate) / 1000000;
}

export function formatExecutionHeader(result: RunResult): string {
  const exec = result.execution;
  const usage = result.usage;
  const details: string[] = [];

  if (exec?.model) details.push(`**Model:** \`${exec.model}\``);
  if (exec?.profile) details.push(`**Profile:** \`${exec.profile}\``);
  if (exec?.effort) details.push(`**Effort:** \`${exec.effort}\``);
  if (exec?.route) details.push(`**Route:** \`${exec.route}\``);
  if (exec?.durationMs) {
    const totalSec = Math.round(exec.durationMs / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    details.push(`**Duration:** ${mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}`);
  }
  if (exec?.goalContinuations) details.push(`**Continuations:** ${exec.goalContinuations}`);

  let totalTokens =
    usage?.inputTokens && usage?.outputTokens ? usage.inputTokens + usage.outputTokens : undefined;
  if (!totalTokens && result.summary) {
    const match = result.summary.match(/(\d[\d,]*)\s+tokens/i);
    if (match) totalTokens = parseInt(match[1].replace(/,/g, ''), 10);
  }

  const cost = estimateModelCost(exec?.model, usage, result.summary);

  if (totalTokens !== undefined) {
    let usageText = `${totalTokens.toLocaleString()} tokens`;
    if (typeof cost === 'number') {
      usageText += ` (est. $${cost < 0.01 && cost > 0 ? '<0.01' : cost.toFixed(2)})`;
    }
    details.push(`**Usage:** ${usageText}`);
  } else if (typeof cost === 'number') {
    details.push(`**Cost:** est. $${cost < 0.01 && cost > 0 ? '<0.01' : cost.toFixed(2)}`);
  }

  if (details.length === 0) return '';
  return `> 🤖 ${details.join(' | ')}`;
}

export function createGitHubTracker({ root = process.cwd(), options = {} }: GitHubTrackerOptions = {}): TrackerAdapter {
  const tokenEnv = options.tokenEnv ?? 'GH_TOKEN';
  const opts = { cwd: root, tokenEnv };

  return {
    async read(): Promise<Snapshot> {
      return { revision: '0', tickets: [] };
    },

    async transition(_action: TransitionAction): Promise<void> {},

    async publish(_result: RunResult): Promise<void> {},

    async escalate(_action: EscalateAction): Promise<void> {},
  };
}

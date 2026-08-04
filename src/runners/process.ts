import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { DispatchRunOptions, Policy, ProfileConfig, RouteConfig, RunnerAdapter, RunResult } from '../types.js';

const execFileAsync = promisify(execFile);

const SAFE_ENV = [
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'WINDIR',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'LOCALAPPDATA',
  'APPDATA',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ComSpec',
];

function environment(extra: string[] = []): Record<string, string> {
  return Object.fromEntries(
    [...new Set([...SAFE_ENV, ...extra])]
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]!])
  );
}

async function command(cmd: string, args: string[], cwd: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, windowsHide: true });
  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

function branchName(policy: Policy, action: any): string {
  const prefix = policy.runner.workspace?.branchPrefix ?? 'agentic/';
  const ticket = action.ticket.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return `${prefix}${ticket}-${action.run}-${action.attempt ?? 1}`;
}

async function createWorkspace(policy: Policy, root: string, action: any) {
  const directory = await mkdtemp(join(tmpdir(), 'agentic-sdlc-worktree-'));
  const path = join(directory, 'repo');
  const editable = action.requiresChange === true;
  const branch = editable ? branchName(policy, action) : undefined;
  const baseRef = policy.runner.workspace?.baseRef ?? 'main';

  if (editable && branch) {
    try {
      await command('git', ['worktree', 'prune'], root).catch(() => {});
      const list = await command('git', ['worktree', 'list', '--porcelain'], root).catch(() => '');
      if (list) {
        const entries = list.split('\n\n');
        for (const entry of entries) {
          if (entry.includes(`branch refs/heads/${branch}`)) {
            const match = entry.match(/^worktree\s+(.+)$/m);
            if (match && match[1] !== root) {
              await command('git', ['worktree', 'remove', '--force', match[1].trim()], root).catch(() => {});
            }
          }
        }
      }
    } catch {}
    await command('git', ['branch', '-D', branch], root).catch(() => {});
  }

  const args = editable
    ? ['worktree', 'add', '-b', branch!, path, baseRef]
    : ['worktree', 'add', '--detach', path, baseRef];

  try {
    await command('git', args, root);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }

  return {
    path,
    branch,
    async remove() {
      try {
        await command('git', ['worktree', 'remove', '--force', path], root);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

function contract(action: any): string {
  return JSON.stringify({
    ticket: action.ticket,
    run: action.run,
    revision: action.revision,
    nextRevision: 'new Git commit SHA when this run publishes a change; otherwise omit',
    outcome: 'completed | failed | needs-human',
    retryable: false,
    evidence: action.produces,
    summary: 'short factual summary',
    plan: 'required Markdown implementation plan and acceptance scenarios when this action requiresPlan is true; otherwise omit',
    pullRequest: 'required GitHub pull request number when this action requiresPullRequest is true; otherwise omit',
    artifacts: [],
    changes: [],
  });
}

async function promptFor(
  action: any,
  policy: Policy,
  route: RouteConfig,
  root: string,
  workspace: { path: string; branch?: string },
  { continuation = false } = {}
): Promise<string> {
  const context = await Promise.all(
    (policy.rules.context ?? []).map(async (path) => {
      const content = await readFile(resolve(root, path), 'utf8');
      return `<context path="${path}">\n${content}\n</context>`;
    })
  );

  const baseRef = policy.runner.workspace?.baseRef ?? 'main';
  const objective = [
    `Complete the '${action.run}' stage goal for ticket ${action.ticket} at source revision ${action.revision}.`,
    `Done means returning one valid terminal result and only evidence allowed by this run: ${action.produces.join(', ')}.`,
    action.requiresPlan
      ? 'Before claiming completion evidence, produce a detailed Markdown implementation plan with ordered file-level steps, acceptance scenarios, verification commands, and explicit exclusions. Return it in result.plan; it will be published to the governing ticket and supplied to execution.'
      : '',
    action.requiresChange
      ? `Work only in the isolated worktree at ${workspace.path} on branch ${workspace.branch}. Start from ${baseRef}; never alter the human checkout. Commit the verified change, push the branch, create a draft pull request, and return its number in result.pullRequest plus the committed SHA in result.nextRevision.`
      : `Work only in the isolated detached worktree at ${workspace.path}. Do not modify, commit, or push repository files.`,
  ].join(' ');

  const full = [
    `<goal>\n${objective}\n</goal>`,
    'If this harness exposes native goal mode, use it for exactly this objective. Do not broaden the goal or create a second workflow.',
    `Perform the '${action.run}' run for ticket ${action.ticket} at revision ${action.revision}.`,
    `Attempt ${action.attempt ?? 1}. Work only within the repository and the configured run purpose.`,
    `This route was selected because: ${route.why}`,
    action.context ? `<ticket>\n${action.context}\n</ticket>` : '',
    ...context,
    'Return exactly one final line beginning `AGENTIC_SDLC_RESULT ` followed by JSON.',
    `The JSON shape is: ${contract(action)}`,
    'Keep revision equal to the dispatched source revision. If you publish a new Git revision, set nextRevision to the full commit SHA from `git rev-parse HEAD`.',
    'Claim only evidence you actually produced. Do not include other prose after the result line.',
  ].filter(Boolean);

  if (!continuation) return full.join('\n\n');
  return [
    `<goal-continuation>\nContinue the same stage goal and source revision. The previous turn exited without a terminal result. Finish remaining work; do not restart or broaden scope.\n</goal-continuation>`,
    ...full,
  ].join('\n\n');
}

function runProcess(
  commandStr: string,
  args: string[],
  { cwd, env, input, timeout }: { cwd: string; env: Record<string, string>; input?: string; timeout: number }
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(commandStr, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeout);

    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(stdout);
      else
        reject(
          new Error(`${basename(commandStr)} failed (${signal ?? code}): ${stderr.trim() || stdout.trim() || 'no output'}`)
        );
    });

    child.stdin?.end(input ?? '');
  });
}

function parseResult(output: string): any | undefined {
  const matches = [...output.matchAll(/AGENTIC_SDLC_RESULT\s+(\{[\s\S]*?\})/g)];
  if (!matches.length) return undefined;
  const lastJson = matches.at(-1)![1].trim();
  try {
    return JSON.parse(lastJson);
  } catch {
    return undefined;
  }
}

async function invoke(
  profile: ProfileConfig & { inheritEnv?: string[]; environment?: Record<string, string>; timeoutSeconds?: number },
  prompt: string,
  { root, continuing, timeoutMs }: { root: string; continuing: boolean; timeoutMs: number }
): Promise<string> {
  let directory: string | undefined;
  try {
    let args = [...(continuing && profile.continueArgs ? profile.continueArgs : profile.args)];
    let input: string | undefined;

    if (profile.prompt === 'file') {
      directory = await mkdtemp(join(tmpdir(), 'agentic-sdlc-prompt-'));
      const promptPath = join(directory, 'prompt.md');
      await writeFile(promptPath, prompt, 'utf8');
      args = args.map((value) => value.replaceAll('{promptPath}', promptPath));
    } else {
      input = prompt;
    }

    return await runProcess(profile.command, args, {
      cwd: root,
      env: { ...environment(profile.inheritEnv), ...profile.environment },
      input,
      timeout: Math.min(profile.timeoutSeconds ? profile.timeoutSeconds * 1000 : timeoutMs, timeoutMs),
    });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

export function createProcessRunner({ policy, root = process.cwd() }: { policy: Policy; root?: string }): RunnerAdapter {
  return {
    async run(options: DispatchRunOptions | any): Promise<RunResult> {
      const action = 'ticket' in options && 'rule' in options
        ? {
            ticket: options.ticket.id,
            run: options.rule.run,
            lane: options.rule.lane,
            revision: options.ticket.revision,
            context: options.ticket.context ?? '',
            attempt: Number(options.ticket.attempts?.[options.rule.run] ?? 0) + 1,
            produces: options.rule.produces,
            requiresPlan: options.rule.requiresPlan === true,
            requiresChange: options.rule.requiresChange === true,
            requiresPullRequest: options.rule.requiresPullRequest === true,
            allowedProtectedPaths: options.rule.allowedProtectedPaths ?? [],
          }
        : options;

      const route = policy.runner.routes[action.lane];
      if (!route) throw new Error(`Unknown runner route '${action.lane}'`);

      const candidates = [route.primary, ...route.fallbacks];
      const maxContinuations = policy.runner.goal?.enabled ? policy.runner.goal.maxContinuations : 0;
      const failures: string[] = [];
      const startedAt = Date.now();
      const deadline = startedAt + policy.limits.runTimeoutSeconds * 1000;
      const workspaceEnabled = policy.runner.workspace?.enabled !== false;

      const workspace = workspaceEnabled
        ? await createWorkspace(policy, root, action)
        : { path: root, branch: undefined, async remove() {} };

      try {
        for (let fallbackIndex = 0; fallbackIndex < candidates.length; fallbackIndex += 1) {
          const profileName = candidates[fallbackIndex];
          const profile = policy.runner.profiles[profileName];

          for (let continuation = 0; continuation <= maxContinuations; continuation += 1) {
            const timeoutMs = deadline - Date.now();
            if (timeoutMs <= 0) throw new Error(`Stage goal timed out for route '${action.lane}'`);

            try {
              const prompt = await promptFor(action, policy, route, root, workspace, { continuation: continuation > 0 });
              const output = await invoke(profile, prompt, {
                root: workspace.path,
                continuing: continuation > 0,
                timeoutMs,
              });

              const result = parseResult(output);
              if (result) {
                if (workspaceEnabled && !action.requiresChange) {
                  const dirty = await command('git', ['status', '--porcelain'], workspace.path);
                  if (dirty) throw new Error(`Read-only ${action.run} run changed its isolated worktree`);
                }
                return {
                  ...result,
                  execution: {
                    route: action.lane,
                    profile: profileName,
                    ...(profile.model ? { model: profile.model } : {}),
                    ...(profile.effort ? { effort: profile.effort } : {}),
                    fallbackIndex,
                    goalContinuations: continuation,
                    durationMs: Date.now() - startedAt,
                    workspace: 'isolated',
                    ...(workspace.branch ? { branch: workspace.branch } : {}),
                  },
                };
              }
              failures.push(`${profileName}: no terminal result`);
            } catch (error: any) {
              failures.push(`${profileName}: ${error.message}`);
              break;
            }
          }
        }

        const exhaustedError: any = new Error(
          `Every model profile failed for route '${action.lane}': ${failures.join('; ')}`
        );
        exhaustedError.execution = {
          route: action.lane,
          profile: candidates.join(' → '),
          model: candidates.map((name) => policy.runner.profiles[name]?.model).filter(Boolean).join(' → '),
          durationMs: Date.now() - startedAt,
          workspace: 'isolated',
          ...(workspace.branch ? { branch: workspace.branch } : {}),
        };
        throw exhaustedError;
      } finally {
        await workspace.remove();
      }
    },
  };
}

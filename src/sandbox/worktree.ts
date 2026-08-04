import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SandboxOptions {
  projectRoot?: string;
  baseRef?: string;
  branchPrefix?: string;
  ticketId: string;
  purpose: 'plan' | 'build' | 'review' | 'fix' | 'triage';
  worktreeDir?: string;
}

export interface SandboxContext {
  worktreePath: string;
  branchName?: string;
  baseRef: string;
  cleanup: () => Promise<void>;
  commit: (message: string) => Promise<string>;
}

export async function createSandbox({
  projectRoot = process.cwd(),
  baseRef = 'main',
  branchPrefix = 'agentic/',
  ticketId,
  purpose,
  worktreeDir,
}: SandboxOptions): Promise<SandboxContext> {
  const sanitizedId = ticketId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetDir = worktreeDir ?? resolve(projectRoot, '.agentic-sdlc', 'worktrees', `${purpose}-${sanitizedId}`);

  await mkdir(dirname(targetDir), { recursive: true });

  let branchName: string | undefined;
  const gitArgs: string[] = ['worktree', 'add'];

  if (purpose === 'plan' || purpose === 'triage' || purpose === 'review') {
    gitArgs.push('--detach', targetDir, baseRef);
  } else {
    branchName = `${branchPrefix}${sanitizedId}`;
    gitArgs.push('-B', branchName, targetDir, baseRef);
  }

  try {
    await execFileAsync('git', gitArgs, { cwd: projectRoot });
  } catch (error: any) {
    throw new Error(`Failed to create Git worktree at '${targetDir}': ${error.message}`);
  }

  const cleanup = async () => {
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', targetDir], { cwd: projectRoot });
    } catch {
      await rm(targetDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  const commit = async (message: string): Promise<string> => {
    await execFileAsync('git', ['add', '-A'], { cwd: targetDir });
    await execFileAsync('git', ['commit', '-m', message], { cwd: targetDir });
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: targetDir });
    return stdout.trim();
  };

  return {
    worktreePath: targetDir,
    branchName,
    baseRef,
    cleanup,
    commit,
  };
}

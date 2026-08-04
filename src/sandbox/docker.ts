import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSandbox, type SandboxContext, type SandboxOptions } from './worktree.js';

const execFileAsync = promisify(execFile);

export interface DockerSandboxOptions extends SandboxOptions {
  image?: string;
  containerName?: string;
  autoRemove?: boolean;
}

export interface DockerSandboxContext extends SandboxContext {
  containerId?: string;
  image: string;
  execInContainer: (command: string, args?: string[]) => Promise<{ stdout: string; stderr: string }>;
}

async function isDockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['version']);
    return true;
  } catch {
    return false;
  }
}

export async function createDockerSandbox({
  image = 'node:20-slim',
  containerName,
  autoRemove = true,
  ...worktreeOptions
}: DockerSandboxOptions): Promise<DockerSandboxContext> {
  const baseContext = await createSandbox(worktreeOptions);
  const dockerAvailable = await isDockerAvailable();

  let containerId: string | undefined;

  if (dockerAvailable) {
    const sanitizedTicket = worktreeOptions.ticketId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const name = containerName ?? `agentic-sdlc-${worktreeOptions.purpose}-${sanitizedTicket}-${Date.now()}`;

    try {
      const { stdout } = await execFileAsync('docker', [
        'run',
        '-d',
        '--name',
        name,
        '-v',
        `${baseContext.worktreePath}:/workspace`,
        '-w',
        '/workspace',
        image,
        'tail',
        '-f',
        '/dev/null',
      ]);
      containerId = stdout.trim();
    } catch {
      // Fallback: If container start fails, base git worktree sandbox handles local execution
    }
  }

  const execInContainer = async (
    command: string,
    args: string[] = []
  ): Promise<{ stdout: string; stderr: string }> => {
    if (containerId) {
      return execFileAsync('docker', ['exec', containerId, command, ...args]);
    }
    return execFileAsync(command, args, { cwd: baseContext.worktreePath });
  };

  const cleanup = async () => {
    if (containerId) {
      try {
        await execFileAsync('docker', ['rm', '-f', containerId]);
      } catch {
        // Ignored if container already stopped/removed
      }
    }
    await baseContext.cleanup();
  };

  return {
    ...baseContext,
    containerId,
    image,
    execInContainer,
    cleanup,
  };
}

// Shared helpers for the forge, vcs and gate CLIs.
import type { AdapterContext, CR } from '../ports.ts';

export class UsageError extends Error {}

export const MARKER = '<!-- agentic-sdlc:automerge -->';

export function parseArgs(argv: string[], bool: string[] = []) {
  const pos: string[] = [];
  const flags: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && a.length > 2) {
      const k = a.slice(2);
      if (bool.includes(k)) (flags[k] ??= []).push('true');
      else {
        if (i + 1 >= argv.length) throw new UsageError(`--${k} needs a value`);
        (flags[k] ??= []).push(argv[++i]);
      }
    } else pos.push(a);
  }
  return {
    pos,
    flags,
    get: (k: string) => flags[k]?.[0],
    all: (k: string) => flags[k] ?? [],
    has: (k: string) => k in flags,
    need: (k: string) => {
      const v = flags[k]?.[0];
      if (v === undefined) throw new UsageError(`--${k} is required`);
      return v;
    },
  };
}

/** Run a verb: strings print as text, anything else as JSON. 0 ok, 1 failure, 2 usage. */
export async function guard(fn: () => Promise<unknown>): Promise<number> {
  try {
    const r = await fn();
    process.stdout.write(typeof r === 'string' ? (r.endsWith('\n') ? r : r + '\n') : JSON.stringify(r ?? {}) + '\n');
    return 0;
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return e instanceof UsageError ? 2 : 1;
  }
}

/** Credential from the env var NAMED by options[key]; the value is never logged. */
export function secret(ctx: AdapterContext, key: string): string {
  const name = String(ctx.options[key] ?? '');
  const v = name && ctx.env[name];
  if (!v) throw new Error(`env var named by options.${key} (${name || 'unset'}) is not set`);
  return v;
}

export const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

/** Diff of a CR from local git objects, for forges without a unified-diff endpoint. */
export const localDiff = (ctx: AdapterContext, cr: CR): string =>
  ctx.exec('git', ['diff', '--no-color', `${cr.baseSha}...${cr.headSha}`], { cwd: ctx.root });

/** Every required check (all checks when none are named) is success. */
export function allGreen(cr: CR, required: string[]): boolean {
  const names = required.length ? required : cr.checks.map((c) => c.name);
  return names.every((n) => cr.checks.find((c) => c.name === n)?.state === 'success');
}

export const title1 = (s: string) => (s ?? '').split('\n')[0];

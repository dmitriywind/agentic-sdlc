import { execFileSync } from 'node:child_process';

/** Runs a command and returns stdout. Throws on a non-zero exit. Tests pass a fake. */
export type Exec = (cmd: string, args: string[], opts?: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv }) => string;

export const exec: Exec = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', cwd: opts.cwd, input: opts.input, env: opts.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });

/** HTTP JSON call for REST adapters. Tests pass a fake. */
export type Http = (method: string, url: string, opts?: { headers?: Record<string, string>; body?: unknown }) => Promise<any>;

export const http: Http = async (method, url, opts = {}) => {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json', ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${new URL(url).pathname} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
};

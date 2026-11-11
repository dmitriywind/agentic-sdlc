import { execFileSync } from 'node:child_process';

/** Runs a command and returns stdout. Throws on a non-zero exit. Tests pass a fake. */
export type Exec = (cmd: string, args: string[], opts?: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv }) => string;

export const exec: Exec = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', cwd: opts.cwd, input: opts.input, env: opts.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });

/** HTTP JSON call for REST adapters. Tests pass a fake. */
export type Http = (method: string, url: string, opts?: { headers?: Record<string, string>; body?: unknown }) => Promise<any>;

/** The wait between HTTP retries. Tests swap it with setSleep. */
let sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const setSleep = (f: (ms: number) => Promise<void>) => { const prev = sleep; sleep = f; return prev; };

let HTTP_TIMEOUT_MS = 30_000;
/** Tests shorten the per-request timeout. */
export const setHttpTimeout = (ms: number) => { const prev = HTTP_TIMEOUT_MS; HTTP_TIMEOUT_MS = ms; return prev; };
const TRIES = 3;
const MAX_WAIT_MS = 30_000;

/** Retry-After in ms (seconds or an HTTP date), else exponential backoff from 1s; capped at 30s. */
export function retryWait(retryAfter: string | null, attempt: number, now = Date.now()): number {
  let ms = 1000 * 2 ** (attempt - 1);
  if (retryAfter) {
    const secs = Number(retryAfter);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(secs)) ms = secs * 1000;
    else if (!Number.isNaN(at)) ms = at - now;
  }
  return Math.min(MAX_WAIT_MS, Math.max(0, ms));
}

/**
 * Retries 429 for every method, and 5xx except on POST: a POST that failed with 5xx may still have
 * started something (a session, a comment), so it is not sent twice.
 */
export const http: Http = async (method, url, opts = {}) => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', accept: 'application/json', ...opts.headers },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : {};
    const retry = res.status === 429 || (res.status >= 500 && method.toUpperCase() !== 'POST');
    if (!retry || attempt >= TRIES) throw new Error(`${method} ${new URL(url).pathname} -> ${res.status}: ${text.slice(0, 300)}`);
    await sleep(retryWait(res.headers.get('retry-after'), attempt));
  }
};

// The World: a fresh object per scenario. Helpers wrap what test/helpers.ts gave: a temp project, a binding
// builder, the CLI as a process, a recorder for exec/http with programmable answers, a clock. Cleaned up after each scenario.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setSleep } from '../../src/exec.ts';
import type { AdapterContext } from '../../src/ports.ts';
import { GateFakes, baseBinding } from './fakes.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const BIN = join(repoRoot, 'src', 'bin.ts');
export const GUARD = join(repoRoot, 'hooks', 'guard.mjs');
export const HOOKS_JSON = join(repoRoot, 'hooks', 'hooks.json');
export const REPO = repoRoot;

/** What a process run left: exit code and both streams; json() parses stdout. */
export class Outcome {
  code: number;
  stdout: string;
  stderr: string;
  constructor(code: number, stdout: string, stderr: string) { this.code = code; this.stdout = stdout; this.stderr = stderr; }
  json(): any { return JSON.parse(this.stdout); } // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Both streams: what the user would see in the terminal. */
  get output() { return this.stdout + this.stderr; }
}

const merge = (a: any, b: any): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return b;
  const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
  return out;
};

export class World {
  private cleanups: (() => void)[] = [];
  private dir?: string;

  /** The last process run (CLI or hook). */
  last!: Outcome;
  /** Free-form scenario state for one area's steps; keep keys documented in that area's steps file. */
  state: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  env: Record<string, string> = {};

  // ---- temp project ----
  /** The project directory (created on first use). */
  get root(): string {
    if (!this.dir) { this.dir = mkdtempSync(join(tmpdir(), 'feature-')); this.cleanups.push(() => rmSync(this.dir!, { recursive: true, force: true })); }
    return this.dir;
  }
  path(...p: string[]) { return join(this.root, ...p); }
  write(rel: string, text: string) { mkdirSync(dirname(this.path(rel)), { recursive: true }); writeFileSync(this.path(rel), text); }
  read(rel: string) { return readFileSync(this.path(rel), 'utf8'); }
  exists(rel: string) { return existsSync(this.path(rel)); }
  /** Runs `git` in a directory (default: the project) with a fixed identity. */
  git(args: string[], cwd = this.root) {
    return spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  }

  // ---- binding builder ----
  bindingPatch: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** A local board in a project with the smallest binding the CLI reads. Deep-merges patches; written on every CLI call. */
  binding = (patch: Record<string, unknown> = {}) => { this.bindingPatch = merge(this.bindingPatch, patch); return this; };
  private writeBinding() {
    const b = merge({
      version: 2,
      board: { adapter: 'local', options: {}, statuses: [], fields: { size: 'Size', priority: 'Priority' } },
      priorities: ['P0', 'High', 'Default', 'Low'],
      executors: { default: { kind: 'harness' } },
    }, this.bindingPatch);
    // YAML is a superset of JSON: the CLI reads this file as YAML.
    this.write('.agents/binding.yml', JSON.stringify(b, null, 2));
  }

  // ---- the CLI as a process ----
  /** Runs `agentic-sdlc --root <project> ...args` and keeps the outcome in `last`. */
  cli(...args: string[]): Outcome {
    this.writeBinding();
    return (this.last = this.spawn([BIN, '--root', this.root, ...args]));
  }
  /** Runs a node script with an optional stdin. */
  spawn(argv: string[], input?: string, cwd?: string): Outcome {
    const r = spawnSync(process.execPath, ['--no-warnings', ...argv], { input, cwd, encoding: 'utf8', env: { ...process.env, ...this.env } });
    return new Outcome(r.status ?? -1, r.stdout ?? '', r.stderr ?? '');
  }

  // ---- fake exec/http: records calls, answers from programmable rules ----
  calls: string[] = [];
  private answers: [RegExp, unknown][] = [];
  /** The next calls whose text ("cmd arg arg" or "METHOD url body") matches the pattern answer with `response`. First rule added wins. */
  answer(pattern: RegExp, response: unknown) { this.answers.push([pattern, response]); }
  /** An AdapterContext whose exec and http record into `calls`. */
  adapterContext(options: Record<string, unknown> = {}): AdapterContext {
    const reply = (c: string) => this.answers.find(([re]) => re.test(c))?.[1];
    this.writeBinding();
    return {
      root: this.root, options, env: this.env,
      binding: JSON.parse(readFileSync(this.path('.agents/binding.yml'), 'utf8')),
      exec: (cmd, args) => { const c = [cmd, ...args].join(' '); this.calls.push(c); const r = reply(c); return typeof r === 'string' ? r : JSON.stringify(r ?? {}); },
      http: async (method, url, o) => { const c = `${method} ${url} ${o?.body ? JSON.stringify(o.body) : ''}`; this.calls.push(c); return (reply(c) ?? {}) as any; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    };
  }

  // ---- clock: the injectable sleep ----
  /** Slept milliseconds, in order. The retry helpers of src/exec.ts call this instead of waiting. */
  sleeps: number[] = [];
  useFakeSleep() {
    const prev = setSleep(async (ms) => { this.sleeps.push(ms); });
    this.cleanups.push(() => { setSleep(prev); });
  }

  // ---- gates: in-memory board and forge ----
  private fakes?: GateFakes;
  get gate(): GateFakes { return (this.fakes ??= new GateFakes()); }
  /** Gate dependencies: the gate base binding with this scenario's binding patches on top. */
  gateDeps() {
    this.gate.binding = merge(baseBinding(), this.bindingPatch);
    return this.gate.deps(this.root);
  }

  cleanup() {
    for (const c of this.cleanups.reverse()) { try { c(); } catch { /* best effort */ } }
    this.cleanups = [];
  }
}

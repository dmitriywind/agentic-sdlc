// The bench: cases from the project's own merged tickets, replayed headless (references/architecture.md 6.6).
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBinding } from './binding.ts';
import { diffPaths, matchesAny } from './gates.ts';
import { median } from './ledger.ts';
import type { Exec } from './exec.ts';
import type { AdapterContext, Binding, Board, Executor, Forge, PortCli, Vcs } from './ports.ts';

export interface BenchCase {
  id: string; ticket: string; title: string; spec: string; baseSha: string; headSha: string; oracleTests: string[];
  size?: string; // the ticket's Size field
  area?: string; // the most touched top-two-level directory of the CR's product files
  mergedAt?: string; // the ticket's last update, as the merge time
}
/** scorerInput: the prompt and the agent's changed files, for judge-run to score later. */
export interface CaseResult { id: string; pass: boolean; minutes: number; cost_usd?: number; error?: string; scorerInput?: string }
export interface BenchResult { model: string; executor: string; executorKind?: string; factory?: string; suite?: string; at: string; cases: CaseResult[]; passRate: number; cost_usd: number; minutes: number; stopped?: 'budget' }
export interface Suite { name: string; cases: BenchCase[] }

export const CASES_FILE = '.agents/bench/cases.json';
export const SUITES_DIR = '.agents/bench/suites';
export const RESULTS_DIR = '.agents/bench/results';
export const suiteFile = (name: string) => {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`bad suite name ${name}`);
  return `${SUITES_DIR}/${name}.json`;
};
/**
 * Default rule for a proof file (test, eval case, data check: architecture.md 8); the binding may
 * override it with `paths.proof_pattern` (a regex). Manual proofs have no file and are never oracle.
 */
export const PROOF_FILE = /(^|\/)(tests?|__tests__|spec|evals?|data[-_]?checks?|checks)\/|[._-](test|spec|eval|check)\.[^/]+$/i;

/** `--executor`: a key of binding.executors, `harness`, or inline executor JSON. */
export function resolveExecutor(arg: string, binding: Binding): Executor {
  if (arg.trim().startsWith('{')) return JSON.parse(arg) as Executor;
  const e = binding.executors?.[arg] ?? (arg === 'harness' ? { kind: 'harness' as const } : undefined);
  if (!e) throw new Error(`no executor ${arg} in binding.executors`);
  return e;
}

/** The headless command for one case. Only harness and command executors run on a local workdir. */
export function agentCommand(e: Executor, binding: Binding, vars: { model: string; ticket: string; prompt_file: string; workdir: string }): string {
  if (e.kind === 'harness') {
    if (!binding.agent_command) throw new Error('binding.agent_command is not set');
    return fill(binding.agent_command, vars);
  }
  if (e.kind === 'command') return fill(e.run, { ...vars, skill: 'implement-spec', cr: '' });
  throw new Error(`executor kind ${e.kind} cannot run on the bench; use harness or command`);
}

/** Paths a unified diff adds (old side /dev/null). */
export const addedFiles = (diff: string): string[] =>
  [...diff.matchAll(/^--- \/dev\/null\r?\n\+\+\+ (?:b\/)?(.+?)\s*$/gm)].map((m) => m[1]);

/** The last stdout line that is JSON with a numeric cost_usd. */
export function parseCost(stdout: string): number | undefined {
  for (const line of stdout.split(/\r?\n/).reverse()) {
    if (!line.includes('"cost_usd"')) continue;
    try {
      const v = JSON.parse(line.trim()).cost_usd;
      if (typeof v === 'number') return v;
    } catch { /* not JSON */ }
  }
  return undefined;
}

/**
 * Files that decide what `verify` runs (scripts, lockfiles, test config, the factory itself). The
 * agent's edits to them never reach the verify tree; the CR head's version does. The binding may
 * override it with `paths.verify_config_pattern` (a regex).
 * ponytail: a verify script elsewhere (scripts/verify.sh) is not covered; set the pattern for it.
 */
export const VERIFY_CONFIG =
  /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|bun\.lockb?|tsconfig[^/]*\.json|[^/]+\.config\.[^/]+|\.[^/]+rc(\.[^/]+)?|pytest\.ini|tox\.ini|setup\.cfg|pyproject\.toml|poetry\.lock|conftest\.py|Makefile|go\.mod|go\.sum|Cargo\.toml|Cargo\.lock|Gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|[^/]+\.gradle(\.kts)?)$|^\.agents\//;

const rule = (b: Binding, key: string, dflt: RegExp) => (b.paths?.[key] ? new RegExp(String(b.paths[key])) : dflt);

/** One value for a shell command line: POSIX single quotes, Windows double quotes. */
export function quote(v: string, win = process.platform === 'win32'): string {
  if (/[\r\n\0]/.test(v)) throw new Error(`refusing a command value with a newline or NUL: ${JSON.stringify(v)}`);
  if (!win) return `'${v.replaceAll("'", `'\\''`)}'`;
  if (v.includes('"')) throw new Error(`refusing a command value with a double quote: ${v}`);
  return `"${v.replace(/(\\+)$/, '$1$1')}"`; // a trailing backslash must not escape the closing quote
}

/** Fills `{name}` placeholders with quoted values; unknown placeholders stay. */
export const fill = (tpl: string, vars: Record<string, string>, win?: boolean): string =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined ? m : quote(vars[k], win)));

/**
 * Runs a command line in the platform shell. On Windows the line travels in an env var: Node's
 * argv quoting (`\"`) is not what cmd parses, and a value's `%` is then never expanded.
 */
export const shell = (exec: Exec, cmd: string, cwd: string): string =>
  process.platform === 'win32'
    ? exec('cmd', ['/d', '/v:off', '/c', '%AGENTIC_SDLC_CMD%'], { cwd, env: { ...process.env, AGENTIC_SDLC_CMD: cmd } })
    : exec('sh', ['-c', cmd], { cwd });

/** Accounts whose spec comments are trusted: the factory's bots and the two owners. */
export const specAuthors = (b: Binding): string[] => [...(b.owners?.bots ?? []), b.owners?.product, b.owners?.factory].filter((a): a is string => !!a);

/** The most frequent top-two-level directory among product (non-proof) paths. */
export function area(paths: string[], isProof: RegExp = PROOF_FILE): string {
  const n = new Map<string, number>();
  for (const p of paths) if (!isProof.test(p)) { const a = p.split('/').slice(0, -1).slice(0, 2).join('/') || '.'; n.set(a, (n.get(a) ?? 0) + 1); }
  return [...n].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
}

/** Up to `perSize` cases per Size (binding order, unsized last), spread evenly from the oldest to the newest merge. */
export function stratify(cases: BenchCase[], perSize: number, sizes: string[] = []): BenchCase[] {
  const g = new Map<string, BenchCase[]>();
  for (const c of cases) g.set(c.size ?? '', [...(g.get(c.size ?? '') ?? []), c]);
  const rank = (k: string) => (sizes.includes(k) ? sizes.indexOf(k) : sizes.length + (k ? 0 : 1));
  return [...g].sort(([a], [b]) => rank(a) - rank(b)).flatMap(([, cs]) => {
    const s = [...cs].sort((a, b) => (a.mergedAt ?? '').localeCompare(b.mergedAt ?? ''));
    if (s.length <= perSize) return s;
    const idx = new Set(Array.from({ length: perSize }, (_, i) => (perSize === 1 ? 0 : Math.round((i * (s.length - 1)) / (perSize - 1)))));
    return [...idx].map((i) => s[i]);
  });
}

/** Up to n cases, one per (size, area) group in turn, so the pick is diverse. */
export function diverse(cases: BenchCase[], n: number): BenchCase[] {
  const g = new Map<string, BenchCase[]>();
  for (const c of cases) { const k = `${c.size ?? ''}|${c.area ?? ''}`; g.set(k, [...(g.get(k) ?? []), c]); }
  const out: BenchCase[] = [];
  for (let i = 0; out.length < n && [...g.values()].some((cs) => cs.length > i); i++)
    for (const cs of g.values()) if (cs[i] && out.length < n) out.push(cs[i]);
  return out;
}

/** Done tickets whose merged CR added proofs. With `paths`, only CRs touching a matching file; with `perSize`, stratified by Size. */
export async function buildCases(board: Board, forge: Forge, binding: Binding, limit: number, o: { paths?: string[]; perSize?: number } = {}): Promise<BenchCase[]> {
  const isTest = rule(binding, 'proof_pattern', PROOF_FILE);
  const trusted = specAuthors(binding).map((a) => a.toLowerCase());
  const merged = (await forge.list({ state: 'merged' })).filter((c) => c.state === 'merged');
  const tickets = (await board.list({ status: binding.board.done_statuses })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cases: BenchCase[] = [];
  for (const t of tickets) {
    if (!o.perSize && cases.length >= limit) break;
    const cr = merged.find((c) => c.closes.includes(t.id));
    if (!cr) continue;
    const d = await forge.diff(cr.n);
    const oracleTests = addedFiles(d).filter((p) => isTest.test(p));
    if (!oracleTests.length) continue;
    const touched = diffPaths(d);
    if (o.paths?.length && !touched?.some((p) => matchesAny(p, o.paths!))) continue; // an unparsable diff fails closed
    const [spec] = (await board.comments(t.id, { marker: binding.spec_marker })).filter((s) => trusted.includes(s.author?.toLowerCase()));
    const body = spec?.body ?? t.body ?? (await board.get(t.id)).body ?? '';
    const size = t.fields?.size;
    cases.push({ id: t.id, ticket: t.id, title: t.title, spec: body, baseSha: cr.baseSha, headSha: cr.headSha, oracleTests, ...(size ? { size } : {}), area: area(touched ?? [], isTest), mergedAt: t.updatedAt });
  }
  return o.perSize ? stratify(cases, o.perSize, binding.sizes).slice(0, limit) : cases;
}

export interface BenchDeps {
  exec: Exec;
  /** A Vcs for the project root: `snapshot` gives each case its trees, outside the root. */
  vcs: Vcs;
  now?: () => number;
}

type Tree = Awaited<ReturnType<NonNullable<Vcs['snapshot']>>>;

export function prompt(c: BenchCase, skillPath: string, workdir: string, fastCheck: string): string {
  return [
    `Bench run. Implement ticket ${c.ticket} ("${c.title}") in ${workdir}.`,
    `Follow the skill at ${skillPath}, with one change: skip every board, forge and push step.`,
    `Stop when the code and its tests are written and \`${fastCheck}\` passes.`,
    '',
    'Spec:',
    '',
    c.spec,
    '',
  ].join('\n');
}

/** A failed cleanup never fails the run. */
const dropAll = async (trees: Tree[]) => { for (const t of trees) try { await t.drop(); } catch { /* leftover tree is harmless */ } };

/** Copies `p` from `from` into `to`, or deletes it in `to` when `from` lacks it. */
function carry(from: string, to: string, p: string) {
  const src = join(from, p), dst = join(to, p);
  if (!existsSync(src)) return rmSync(dst, { recursive: true, force: true });
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}

/**
 * Each case gets three trees outside the repo root: the agent's (base), a fresh verify tree (base)
 * and the oracle (CR head). The verify tree takes the agent's edits on product paths only; proof
 * and verify-config paths come from the CR head, so the agent can neither see nor rewrite the proof.
 */
export async function runBench(
  cases: BenchCase[],
  o: { model: string; executor?: Executor; executorName?: string; factory?: string; suite?: string; root: string; binding: Binding; dryRun?: boolean; scorerDir?: string },
  deps: BenchDeps,
): Promise<BenchResult | { dryRun: { id: string; command: string }[] }> {
  const executor = o.executor ?? { kind: 'harness' };
  const now = deps.now ?? Date.now;
  const promptFile = (scratch: string, c: BenchCase) => join(scratch, `${c.id}.md`);
  const command = (b: Binding, c: BenchCase, scratch: string, workdir: string) =>
    agentCommand(executor, b, { model: o.model, ticket: c.ticket, prompt_file: promptFile(scratch, c), workdir });
  if (o.dryRun) return { dryRun: cases.map((c) => ({ id: c.id, command: command(o.binding, c, '<scratch>', '<workdir>') })) };
  const vcs = deps.vcs;
  if (!vcs.snapshot) throw new Error(`bench run needs a VCS that can snapshot a revision outside the repo; ${o.binding.vcs?.adapter ?? 'this'} adapter cannot`);
  const snap = (rev: string) => vcs.snapshot!(rev);
  // --factory: the candidate's skills AND binding, so binding-value tuning is exercised too.
  const factory = o.factory ? await snap(o.factory) : undefined;
  const results: CaseResult[] = [];
  let stopped: 'budget' | undefined;
  try {
    const binding = factory ? loadBinding(factory.workdir) : o.binding;
    if (cases[0]) command(binding, cases[0], '<scratch>', '<workdir>'); // a bad executor fails before any case starts
    const skillPath = join(factory?.workdir ?? o.root, '.agents/skills/implement-spec/SKILL.md');
    const isProof = rule(binding, 'proof_pattern', PROOF_FILE);
    const isConfig = rule(binding, 'verify_config_pattern', VERIFY_CONFIG);
    const scratch = mkdtempSync(join(tmpdir(), 'agentic-bench-prompts-'));
    const budget = binding.learning.budget_usd_per_week;
    let spent = 0;
    for (const c of cases) {
      if (spent > budget) { stopped = 'budget'; break; }
      const trees: Tree[] = [];
      try {
        const agent = await snap(c.baseSha);
        trees.push(agent);
        writeFileSync(promptFile(scratch, c), prompt(c, skillPath, agent.workdir, binding.commands.fast_check));
        const t0 = now();
        let out = '';
        let error: string | undefined;
        try {
          out = shell(deps.exec, command(binding, c, scratch, agent.workdir), agent.workdir);
        } catch (e) {
          out = String((e as { stdout?: unknown }).stdout ?? '');
          error = `agent: ${(e as Error).message.split('\n')[0]}`;
        }
        const minutes = Math.round(((now() - t0) / 60000) * 10) / 10;
        const cost_usd = parseCost(out);
        spent += cost_usd ?? 0;
        const touched = await agent.changed();
        const verify = await snap(c.baseSha);
        trees.push(verify);
        const scorerInput = o.scorerDir ? writeScorerInput(o.scorerDir, o.root, c, readFileSync(promptFile(scratch, c), 'utf8'), touched, verify.workdir, agent.workdir) : undefined;
        const oracle = await snap(c.headSha);
        trees.push(oracle);
        for (const p of touched) {
          if (isProof.test(p)) continue; // the agent's own tests never count
          carry(isConfig.test(p) ? oracle.workdir : agent.workdir, verify.workdir, p);
        }
        for (const p of c.oracleTests) carry(oracle.workdir, verify.workdir, p);
        let pass = true;
        try {
          if (binding.commands.install) shell(deps.exec, binding.commands.install, verify.workdir);
          shell(deps.exec, binding.commands.verify, verify.workdir);
        } catch { pass = false; }
        results.push({ id: c.id, pass, minutes, ...(cost_usd === undefined ? {} : { cost_usd }), ...(error ? { error } : {}), ...(scorerInput ? { scorerInput } : {}) });
      } finally {
        await dropAll(trees);
      }
    }
    rmSync(scratch, { recursive: true, force: true });
  } finally {
    if (factory) await dropAll([factory]);
  }
  const total = (k: 'cost_usd' | 'minutes') => Math.round(results.reduce((t, r) => t + (r[k] ?? 0), 0) * 100) / 100;
  return {
    model: o.model,
    executor: o.executorName ?? (o.executor ? 'inline' : 'harness'),
    executorKind: executor.kind,
    ...(o.factory ? { factory: o.factory } : {}),
    ...(o.suite ? { suite: o.suite } : {}),
    at: new Date(now()).toISOString(),
    cases: results,
    passRate: results.length ? results.filter((r) => r.pass).length / results.length : 0,
    cost_usd: total('cost_usd'),
    minutes: total('minutes'),
    ...(stopped ? { stopped } : {}),
  };
}

const MAX_FILE_CHARS = 20000; // ponytail: big files are cut; the judge sees the head only

/** The prompt and each changed file before (base) and after (agent), for a scorer to read. Returns the path relative to root. */
function writeScorerInput(dir: string, root: string, c: BenchCase, promptText: string, touched: string[], base: string, after: string): string {
  const read = (d: string, p: string) => {
    if (!existsSync(join(d, p))) return '(absent)';
    const t = readFileSync(join(d, p), 'utf8');
    return t.length > MAX_FILE_CHARS ? `${t.slice(0, MAX_FILE_CHARS)}\n… cut` : t;
  };
  const fence = '````';
  const parts = [promptText, '## Changed files', ...touched.flatMap((p) => [`### ${p}`, 'Before:', fence, read(base, p), fence, 'After:', fence, read(after, p), fence])];
  const file = join(dir, `${c.id.replace(/[^\w.-]/g, '_')}.md`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, parts.join('\n\n') + '\n');
  return relative(root, file).replaceAll('\\', '/');
}

export interface ReportRow { model: string; executor: string; executorKind?: string; factory?: string; passRate: number; medianCost: number | null; medianMinutes: number | null; n: number; pareto: boolean }

/** Per model, executor and factory over every result given: pass rate, median case cost and minutes; `pareto` marks the non-dominated set (max passRate, min cost). */
export function report(results: BenchResult[]): ReportRow[] {
  const g = new Map<string, { r: BenchResult; cases: CaseResult[] }>();
  for (const r of results) {
    const k = JSON.stringify([r.model, r.executor, r.factory ?? null]);
    g.set(k, { r, cases: [...(g.get(k)?.cases ?? []), ...r.cases] });
  }
  const rows = [...g.values()].map(({ r, cases }) => ({
    model: r.model,
    executor: r.executor,
    ...(r.executorKind ? { executorKind: r.executorKind } : {}),
    ...(r.factory ? { factory: r.factory } : {}),
    passRate: cases.length ? cases.filter((c) => c.pass).length / cases.length : 0,
    medianCost: median(cases.flatMap((c) => (typeof c.cost_usd === 'number' ? [c.cost_usd] : []))),
    medianMinutes: median(cases.map((c) => c.minutes)),
    n: cases.length,
    pareto: false,
  }));
  const cost = (x: ReportRow) => x.medianCost ?? Infinity; // unknown cost is never cheap
  for (const a of rows) a.pareto = !rows.some((b) => b !== a && b.passRate >= a.passRate && cost(b) <= cost(a) && (b.passRate > a.passRate || cost(b) < cost(a)));
  return rows.sort((a, b) => b.passRate - a.passRate || cost(a) - cost(b));
}

/** Compares two results on the cases they share. b regresses when its pass rate is lower. */
export function compare(a: BenchResult, b: BenchResult) {
  const ids = new Set(b.cases.map((c) => c.id));
  const common = a.cases.map((c) => c.id).filter((id) => ids.has(id));
  const side = (r: BenchResult) => {
    const cs = r.cases.filter((c) => common.includes(c.id));
    const sum = (k: 'cost_usd' | 'minutes') => Math.round(cs.reduce((t, c) => t + (c[k] ?? 0), 0) * 100) / 100;
    return { model: r.model, executor: r.executor, factory: r.factory, passRate: cs.length ? cs.filter((c) => c.pass).length / cs.length : 0, cost_usd: sum('cost_usd'), minutes: sum('minutes') };
  };
  const [sa, sb] = [side(a), side(b)];
  const d = (x: number, y: number) => Math.round((y - x) * 1000) / 1000;
  return {
    cases: common.length,
    a: sa,
    b: sb,
    delta: { passRate: d(sa.passRate, sb.passRate), cost_usd: d(sa.cost_usd, sb.cost_usd), minutes: d(sa.minutes, sb.minutes) },
    // No shared case, or fewer cases in b, proves nothing: fail closed.
    regressed: common.length === 0 || b.cases.length < a.cases.length || sb.passRate < sa.passRate,
  };
}

const USAGE = [
  'usage: bench build [--suite <name>] [--paths <glob>]… [--per-size <n>] [--limit n]',
  '       bench propose --suite <name> [--n k]',
  '       bench run [--suite <s>] --model <id> | --executor <name|json> [--model <id>] [--factory <rev>] [--cases <ids>] [--dry-run]',
  '       bench report --suite <s> [results.json…]',
  '       bench compare <a.json> <b.json>',
].join('\n');

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

export const cli: PortCli = async (argv, ctx) => {
  const [verb, ...rest] = argv;
  let a;
  try {
    a = parseArgs({
      args: rest,
      options: {
        limit: { type: 'string' }, model: { type: 'string' }, executor: { type: 'string' }, factory: { type: 'string' }, cases: { type: 'string' }, 'dry-run': { type: 'boolean' },
        suite: { type: 'string' }, paths: { type: 'string', multiple: true }, 'per-size': { type: 'string' }, n: { type: 'string' },
      },
      allowPositionals: true,
    });
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  const { binding, root } = ctx;
  const with_ = (options: Record<string, unknown> | undefined, r = root): AdapterContext => ({ ...ctx, root: r, options: options ?? {} });
  try {
    if (verb === 'compare') {
      const [pa, pb] = a.positionals;
      if (!pa || !pb) return (console.error(USAGE), 2);
      const r = compare(readJson(resolve(root, pa)), readJson(resolve(root, pb)));
      console.log(JSON.stringify(r, null, 2));
      return r.regressed ? 1 : 0;
    }
    const suite = a.values.suite;
    const suiteCases = (s: string) => (readJson(join(root, suiteFile(s))) as Suite).cases;
    const allCases = async (limit: number, o: { paths?: string[]; perSize?: number }) => {
      const { createBoard } = await import('./board/index.ts');
      const { createForge } = await import('./forge/index.ts');
      return buildCases(await createBoard(with_(binding.board.options)), await createForge(with_(binding.forge.options)), binding, limit, o);
    };
    if (verb === 'report') {
      if (!suite) return (console.error(USAGE), 2);
      const dir = join(root, RESULTS_DIR);
      const files = a.positionals.length ? a.positionals.map((p) => resolve(root, p))
        : existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : [];
      const results = files.map((f) => readJson(f) as BenchResult).filter((r) => r.suite === suite);
      console.log(JSON.stringify({ suite, results: results.length, rows: report(results) }, null, 2));
      return 0;
    }
    if (verb === 'propose') {
      if (!suite) return (console.error(USAGE), 2);
      const n = a.values.n ? Number(a.values.n) : binding.learning.bench_size;
      if (!(n > 0)) return (console.error(USAGE), 2);
      const sdir = join(root, SUITES_DIR);
      const used = new Set((existsSync(sdir) ? readdirSync(sdir).filter((f) => f.endsWith('.json')) : []).flatMap((f) => (readJson(join(sdir, f)) as Suite).cases.map((c) => c.id)));
      const fresh = (await allCases(Infinity, { perSize: Infinity })).filter((c) => !used.has(c.id));
      console.log(JSON.stringify({ suite, cases: diverse(fresh, n) }, null, 2));
      return 0;
    }
    if (verb === 'build') {
      const limit = a.values.limit ? Number(a.values.limit) : binding.learning.bench_size;
      const perSize = a.values['per-size'] ? Number(a.values['per-size']) : undefined;
      if (!(limit > 0) || (perSize !== undefined && !(perSize > 0))) return (console.error(USAGE), 2);
      const cases = await allCases(limit, { paths: a.values.paths, perSize });
      const rel = suite ? suiteFile(suite) : CASES_FILE;
      const file = join(root, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(suite ? { name: suite, cases } : cases, null, 2) + '\n');
      console.log(JSON.stringify({ file: rel, cases: cases.length }));
      return 0;
    }
    if (verb === 'run') {
      if (!a.values.model && !a.values.executor) return (console.error(USAGE), 2);
      const executor = a.values.executor ? resolveExecutor(a.values.executor, binding) : undefined;
      // An executor run without --model uses the implement-spec tier's model; it only fills {model}.
      const model = a.values.model ?? binding.models.balanced;
      // The --executor name groups the report; inline JSON has none.
      const executorName = a.values.executor ? (a.values.executor.trim().startsWith('{') ? 'inline' : a.values.executor) : undefined;
      const label = a.values.model ?? executorName!;
      const want = a.values.cases?.split(',').map((s) => s.trim());
      const cases = (suite ? suiteCases(suite) : (readJson(join(root, CASES_FILE)) as BenchCase[])).filter((c) => !want || want.includes(c.id));
      const stem = `${new Date().toISOString().replace(/[:.]/g, '-')}-${label.replace(/[^\w.-]/g, '_')}`;
      const { createVcs } = await import('./vcs/index.ts');
      const r = await runBench(
        cases,
        { model, executor, executorName, factory: a.values.factory, suite, root, binding, dryRun: a.values['dry-run'], scorerDir: join(root, RESULTS_DIR, stem) },
        { exec: ctx.exec, vcs: await createVcs(with_(binding.vcs.options)) },
      );
      if ('cases' in r) {
        const file = `${RESULTS_DIR}/${stem}.json`;
        mkdirSync(join(root, RESULTS_DIR), { recursive: true });
        writeFileSync(join(root, file), JSON.stringify(r, null, 2) + '\n');
        console.log(JSON.stringify({ file, passRate: r.passRate, cost_usd: r.cost_usd, minutes: r.minutes, stopped: r.stopped }));
      } else console.log(JSON.stringify(r, null, 2));
      return 0;
    }
    console.error(USAGE);
    return 2;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
};

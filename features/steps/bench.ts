// The bench, driven in-process: cases are built from a fake board and forge, runs go through a fake exec and a fake vcs
// whose trees the scenario describes; compare and report read result files through the CLI.
// State on w.state.bench: board (tickets, spec comments), forge (change requests, diffs, the lists it was asked for),
// trees (files by revision), agent (what the fake agent does), seen (what the fake exec observed), made (every tree dir).
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { agentCommand, buildCases, diverse, quote, resolveExecutor, runBench } from '../../src/bench.ts';
import type { BenchCase } from '../../src/bench.ts';
import type { Board, CR, Forge, Item, Vcs } from '../../src/ports.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { Outcome, type World } from '../support/world.ts';
import { capture } from './ledger.ts';

type Agent = { edits: { path: string; content: string }[]; minutes: number; failVerify: number[]; clockStep: number };
type Seen = { agentTree?: Record<string, string>; prompt?: string; skillText?: string; verifies: { cwd: string; files: Record<string, string> }[]; commands: string[]; agentDir?: string; verifyRuns: number };
type B = {
  items: Item[]; specs: { ticket: string; author: string; body: string }[]; crs: CR[]; diffs: Map<string, string>; asked: Record<string, unknown>[]; mergedRows: number;
  trees: Record<string, Record<string, string>>; agent: Agent; seen: Seen; made: string[]; cases: BenchCase[];
};
const bench = (w: World): B => (w.state.bench ??= {
  items: [], specs: [], crs: [], diffs: new Map(), asked: [], mergedRows: 0, trees: {}, made: [], cases: [],
  agent: { edits: [], minutes: 0, failVerify: [], clockStep: 0 }, seen: { verifies: [], commands: [], verifyRuns: 0 },
} satisfies B);

const done = (w: World, value: unknown) => { w.last = new Outcome(0, JSON.stringify(value), ''); };
const failed = (w: World, e: unknown) => { w.last = new Outcome(1, '', (e as Error).message); };

// ---- the project ----
Given('a project that benches with the agent command {string}', (w, command: string) => w.binding({
  board: { done_statuses: ['Done'] }, paths: {}, spec_marker: '<!-- spec -->', agent_command: command,
  commands: { fast_check: 'npm run check', verify: 'npm test' }, learning: { bench_size: 10 },
  owners: { product: 'po', factory: 'fo', bots: ['factory-bot'] }, vcs: { adapter: 'git' },
}));
Given('the bench demands {int} shared cases and {int} trials', (w, cases: number, trials: number) => w.binding({ learning: { bench_min_cases: cases, bench_trials: trials } }));
Given('the executors:', (w, t: DataTable) => w.binding({
  executors: Object.fromEntries(t.hashes().map((r) => [r.name, { kind: r.kind, ...(r.run ? { run: r.run } : {}), ...(r.max_turns ? { max_turns: Number(r.max_turns) } : {}) }])),
}));

// ---- the board and the forge that cases are built from ----
Given('these Done tickets:', (w, t: DataTable) => {
  for (const r of t.hashes()) bench(w).items.push({ id: r.id, title: `T${r.id}`, updatedAt: r.updated, ...(r.body ? { body: r.body } : {}), ...(r.size ? { fields: { size: r.size } } : {}) } as Item);
});
Given('the forge has these change requests:', (w, t: DataTable) => {
  for (const r of t.hashes()) bench(w).crs.push({ n: r.cr, closes: [r.closes], state: r.state || 'merged', baseSha: `b${r.cr}`, headSha: `h${r.cr}` } as CR);
});

const diffText = (changes: string[], adds: string[]) => [
  ...changes.flatMap((p) => [`diff --git a/${p} b/${p}`, `--- a/${p}`, `+++ b/${p}`, '@@ -1 +1 @@', '-x', '+y']),
  ...adds.flatMap((p) => [`diff --git a/${p} b/${p}`, 'new file mode 100644', '--- /dev/null', `+++ b/${p}`, '@@ -0,0 +1 @@', '+t']),
].join('\n');
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
Given('the diff of CR {string} changes {string} and adds {string}', (w, cr: string, changes: string, adds: string) => bench(w).diffs.set(cr, diffText(list(changes), list(adds))));

const fakes = (w: World) => {
  const b = bench(w);
  const board = {
    list: async (q: { status?: string[] }) => (assert.deepEqual(q.status, ['Done']), b.items),
    comments: async (id: string) => b.specs.filter((s) => s.ticket === id),
    get: async (id: string) => b.items.find((i) => i.id === id) ?? ({ id } as Item),
  } as unknown as Board;
  const forge = {
    list: async (q: Record<string, unknown>) => (b.asked.push(q), b.crs),
    diff: async (n: string) => b.diffs.get(n) ?? '',
  } as unknown as Forge;
  return { board, forge };
};

const num = (s: string) => (s === 'all' ? Infinity : Number(s));
When('the bench builds cases with limit {string}, per-size {string}, paths {string}, merged-limit {string} and since {string}', async (w, limit: string, perSize: string, paths: string, merged: string, since: string) => {
  const { board, forge } = fakes(w);
  const binding = w.adapterContext().binding;
  await capture(w, async () => {
    const o = { ...(paths ? { paths: list(paths) } : {}), ...(perSize ? { perSize: num(perSize) } : {}), ...(merged ? { mergedLimit: Number(merged) } : {}), ...(since ? { since } : {}) };
    bench(w).cases = await buildCases(board, forge, binding, limit ? num(limit) : 5, o);
    console.log(JSON.stringify(bench(w).cases));
    return 0;
  });
});
When('the bench builds {int} cases', async (w, n: number) => {
  const { board, forge } = fakes(w);
  const binding = w.adapterContext().binding;
  await capture(w, async () => { console.log(JSON.stringify(bench(w).cases = await buildCases(board, forge, binding, n))); return 0; });
});

Given('these bench cases:', (w, t: DataTable) => {
  bench(w).cases = t.hashes().map((r) => ({ id: r.id, ticket: r.id, title: 'T', spec: 's', baseSha: 'base', headSha: 'head', oracleTests: ['test/a.test.ts'], size: r.size, area: r.area, ...(r.merged ? { mergedAt: r.merged } : {}) }));
});
When('{int} cases are picked for diversity', (w, n: number) => done(w, diverse(bench(w).cases, n)));

// ---- running the bench ----
Given('the revision {string} holds the files:', (w, rev: string, t: DataTable) => {
  const files = (bench(w).trees[rev] ??= {});
  for (const r of t.hashes()) files[r.path] = r.content;
});
Given('the agent edits the files:', (w, t: DataTable) => { bench(w).agent.edits = t.hashes().map((r) => ({ path: r.path, content: r.content })); });
Given('the agent takes {int} minutes', (w, n: number) => { bench(w).agent.minutes = n; });
Given('the verify run number {int} fails', (w, n: number) => { bench(w).agent.failVerify.push(n); });

const filesIn = (dir: string): Record<string, string> => Object.fromEntries(
  (readdirSync(dir, { recursive: true, withFileTypes: true }) as Dirent[]).filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath, d.name)).replaceAll('\\', '/')).sort().map((p) => [p, readFileSync(join(dir, p), 'utf8')]),
);

const fakeVcs = (b: B): Vcs => ({
  snapshot: async (rev: string) => {
    const workdir = mkdtempSync(join(tmpdir(), 'agentic-bench-'));
    b.made.push(workdir);
    for (const [p, s] of Object.entries(b.trees[rev])) { mkdirSync(dirname(join(workdir, p)), { recursive: true }); writeFileSync(join(workdir, p), s); }
    return {
      workdir,
      changed: async () => {
        const now = Object.keys(filesIn(workdir));
        return [...new Set([...now, ...Object.keys(b.trees[rev])])].filter((p) => !now.includes(p) || b.trees[rev][p] !== readFileSync(join(workdir, p), 'utf8'));
      },
      drop: async () => rmSync(workdir, { recursive: true, force: true }),
    };
  },
}) as unknown as Vcs;

const fakeExec = (b: B, tick: (ms: number) => void) => (_cmd: string, args: string[], o?: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
  const line = o?.env?.AGENTIC_SDLC_CMD ?? args.at(-1)!;
  const cwd = o!.cwd!;
  b.seen.commands.push(line);
  if (/^(fac-)?agent /.test(line)) {
    b.seen.agentDir = cwd;
    b.seen.agentTree = filesIn(cwd);
    const promptFile = /--prompt (['"])(.+?)\1/.exec(line)![2];
    b.seen.prompt = readFileSync(promptFile, 'utf8');
    const skill = /Follow the skill at (.+?), with/.exec(b.seen.prompt)?.[1];
    if (skill && existsSync(skill)) b.seen.skillText = readFileSync(skill, 'utf8');
    for (const e of b.agent.edits) {
      if (e.content === '<deleted>') rmSync(join(cwd, e.path));
      else { mkdirSync(dirname(join(cwd, e.path)), { recursive: true }); writeFileSync(join(cwd, e.path), e.content); }
    }
    tick(b.agent.minutes * 60000);
    return '';
  }
  assert.notEqual(cwd, b.seen.agentDir, 'verify ran in the agent tree');
  b.seen.verifies.push({ cwd, files: filesIn(cwd) });
  if (line === 'npm test' && b.agent.failVerify.includes(++b.seen.verifyRuns)) throw new Error('red');
  return '';
};

const runCases = async (w: World, n: number, opts: Record<string, string>) => {
  const b = bench(w);
  const cases: BenchCase[] = Array.from({ length: n }, (_, i) => ({ id: String(i + 1), ticket: String(i + 1), title: 'T', spec: 'do it', baseSha: 'base', headSha: 'head', oracleTests: ['test/a.test.ts'] }));
  let t = 0;
  const now = () => (b.agent.clockStep ? (t += b.agent.clockStep * 60000) : t);
  const binding = w.adapterContext().binding;
  try {
    const r = await runBench(cases, {
      model: opts.model ?? 'm1', root: w.root, binding, trials: opts.trials ? Number(opts.trials) : undefined, factory: opts.factory, dryRun: opts['dry-run'] === 'true',
      allowOverBudget: opts['allow-over-budget'] === 'true', scorerDir: opts['scorer-dir'] ? join(w.root, opts['scorer-dir']) : undefined,
    }, { exec: fakeExec(b, (ms) => { t += ms; }) as never, vcs: b.trees.base || b.trees.fac ? fakeVcs(b) : ({} as Vcs), now });
    done(w, r);
  } catch (e) { failed(w, e); }
};
When('the bench runs {int} cases', (w, n: number) => runCases(w, n, {}));
When('the bench runs {int} cases with the options:', (w, n: number, t: DataTable) => runCases(w, n, Object.fromEntries(t.raw().map((r) => [r[0], r[1]]))));
Then('the bench started no command', (w) => assert.deepEqual([bench(w).seen.commands, bench(w).made], [[], []]));


// ---- the agent command ----
When('the agent command is built for the executor {string}', (w, executor: string) => {
  const binding = w.adapterContext().binding;
  try { w.state.command = agentCommand(resolveExecutor(executor, binding), binding, { model: 'm', ticket: '7', prompt_file: 'p.md', workdir: 'w' }); done(w, w.state.command); } catch (e) { failed(w, e); }
});
Then('the agent command is {string}', (w, expected: string) => {
  const vars: Record<string, string> = { model: 'm', ticket: '7', prompt_file: 'p.md', workdir: 'w', skill: 'build', max_turns: '40', max_minutes: '' };
  assert.equal(w.state.command, expected.replace(/<(\w+)>/g, (_m, k: string) => quote(vars[k])));
});
/** A table cell cannot hold these characters: <LF> a line feed, <NUL> a NUL, <BS> a backslash, <DQ> a double quote. */

// ---- results: files the CLI compares and reports ----
const resultFile = (w: World, file: string) => JSON.parse(w.read(file));
Given('a bench result {string} of the model {string} that ran:', (w, file: string, model: string, t: DataTable) => {
  const cases = t.hashes().map((r) => ({ id: r.id, ...(r.trial ? { trial: Number(r.trial) } : {}), pass: r.pass === 'true', minutes: Number(r.minutes), ...(r.skipped ? { skipped: r.skipped } : {}) }));
  w.state.resultFile = file;
  w.write(file, JSON.stringify({ model, executor: 'harness', at: '', passRate: 0, minutes: 0, cases }));
});
const amend = (w: World, patch: Record<string, unknown>) => w.write(w.state.resultFile, JSON.stringify({ ...resultFile(w, w.state.resultFile), ...patch }));
Given('that result is of the suite {string}', (w, suite: string) => amend(w, { suite }));


// ---- the step the bench replays ----

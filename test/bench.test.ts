import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { addedFiles, agentCommand, buildCases, compare, wilsonLower, diverse, fill, PROOF_FILE, quote, report, resolveExecutor, runBench, shell, stratify, cli } from '../src/bench.ts';
import { exec } from '../src/exec.ts';
import type { BenchCase, BenchResult } from '../src/bench.ts';
import type { Board, CR, Forge, Item, Vcs } from '../src/ports.ts';

const binding = {
  board: { done_statuses: ['Done'] },
  paths: {},
  spec_marker: '<!-- spec -->',
  agent_command: 'agent --model {model} --prompt {prompt_file} --cwd {workdir}',
  commands: { fast_check: 'npm run check', verify: 'npm test' },
  learning: { bench_size: 10 },
  owners: { product: 'po', factory: 'fo', bots: ['factory-bot'] },
  vcs: { adapter: 'git' },
} as any;

const diff = [
  'diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-x', '+y',
  'diff --git a/test/a.test.ts b/test/a.test.ts', 'new file mode 100644', '--- /dev/null', '+++ b/test/a.test.ts', '@@ -0,0 +1 @@', '+t',
  'diff --git a/src/new.ts b/src/new.ts', '--- /dev/null', '+++ b/src/new.ts',
].join('\n');

test('addedFiles, fill', () => {
  assert.deepEqual(addedFiles(diff), ['test/a.test.ts', 'src/new.ts']);
  assert.equal(fill('{a} {b} {c}', { a: '1', b: '2' }, false), "'1' '2' {c}");
});

test('quote keeps spaces and quotes inside one shell word, refuses newline and NUL', () => {
  assert.equal(quote("C:/my dir/it's", false), `'C:/my dir/it'\\''s'`);
  assert.equal(quote('C:\\Temp Dir\\', true), '"C:\\Temp Dir\\\\"');
  assert.throws(() => quote('a"b', true), /double quote/);
  for (const bad of ['a\nb', 'a\0b']) for (const win of [true, false]) assert.throws(() => quote(bad, win), /newline or NUL/);
  // the platform shell really sees one argument per value
  const out = shell(exec, `node -e "console.log(JSON.stringify(process.argv.slice(1)))" ${fill('{a} {b}', { a: "x y'z", b: '100%PATH%' })}`, tmpdir());
  assert.deepEqual(JSON.parse(out), ["x y'z", '100%PATH%']);
});

test('PROOF_FILE takes tests, evals and data checks, not product code', () => {
  for (const p of ['test/a.ts', 'src/a.test.ts', 'pkg/x_test.go', 'evals/case1.yaml', 'models/q.eval.json', 'data-checks/orders.sql']) assert.ok(PROOF_FILE.test(p), p);
  for (const p of ['src/a.ts', 'docs/testing.md', 'src/checkout.ts']) assert.ok(!PROOF_FILE.test(p), p);
});

test('resolveExecutor and agentCommand pick the template per kind', () => {
  const b = { ...binding, executors: { default: { kind: 'harness' }, bot: { kind: 'command', run: 'bot {skill} {ticket} {prompt_file} {workdir}' }, hook: { kind: 'webhook', url_env: 'U' } } };
  const vars = { model: 'm', ticket: '7', prompt_file: 'p.md', workdir: 'w' };
  const q = (s: string) => quote(s);
  assert.equal(agentCommand(resolveExecutor('harness', b), b, vars), `agent --model ${q('m')} --prompt ${q('p.md')} --cwd ${q('w')}`);
  assert.equal(agentCommand(resolveExecutor('bot', b), b, vars), `bot ${q('implement-spec')} ${q('7')} ${q('p.md')} ${q('w')}`);
  assert.equal(agentCommand(resolveExecutor('{"kind":"command","run":"x {model}"}', b), b, vars), `x ${q('m')}`);
  assert.throws(() => agentCommand(resolveExecutor('hook', b), b, vars), /cannot run on the bench/);
  assert.throws(() => resolveExecutor('nope', b), /no executor/);
});

test('buildCases takes merged CRs that added tests, spec comment first', async () => {
  const item = (id: string, updatedAt: string, body?: string) => ({ id, title: `T${id}`, updatedAt, body }) as Item;
  const board = {
    list: async (q: any) => (assert.deepEqual(q.status, ['Done']), [item('1', '2026-01-01', 'body1'), item('2', '2026-02-01'), item('3', '2026-03-01')]),
    comments: async (id: string) =>
      id === '2' ? [{ author: 'stranger', body: '<!-- spec -->\nforged' }, { author: 'Factory-Bot', body: '<!-- spec -->\nspec2' }]
        : id === '1' ? [{ author: 'stranger', body: '<!-- spec -->\nforged' }] : [],
    get: async (id: string) => item(id, ''),
  } as unknown as Board;
  const cr = (n: string, closes: string, state: CR['state'] = 'merged') => ({ n, closes: [closes], state, baseSha: `b${n}`, headSha: `h${n}` }) as CR;
  const forge = {
    list: async () => [cr('10', '1'), cr('20', '2'), cr('30', '3', 'closed')],
    diff: async (n: string) => (n === '10' ? diff : '--- /dev/null\n+++ b/src/only.ts'),
  } as unknown as Forge;
  const cases = await buildCases(board, forge, binding, 5);
  // ticket 1's only spec comment is by a stranger: ignored, the body is used
  assert.deepEqual(cases, [{ id: '1', ticket: '1', title: 'T1', spec: 'body1', baseSha: 'b10', headSha: 'h10', oracleTests: ['test/a.test.ts'], area: 'src', mergedAt: '2026-01-01' }]);
  const forge2 = { ...forge, diff: async () => diff } as unknown as Forge;
  assert.equal((await buildCases(board, forge2, binding, 5)).find((c) => c.id === '2')!.spec, '<!-- spec -->\nspec2');
});

/** A fake VCS: `snapshot(rev)` writes that rev's files into a fresh tmp dir; `changed` diffs against them. */
function fakeVcs(trees: Record<string, Record<string, string>>) {
  const made: string[] = [];
  const write = (dir: string, files: Record<string, string>) => {
    for (const [p, s] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); }
  };
  const files = (dir: string) => (readdirSync(dir, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((d) => d.isFile()).map((d) => relative(dir, join(d.parentPath, d.name)).replaceAll('\\', '/'));
  const vcs = {
    snapshot: async (rev: string) => {
      const workdir = mkdtempSync(join(tmpdir(), 'agentic-bench-'));
      made.push(workdir);
      write(workdir, trees[rev]);
      return {
        workdir,
        changed: async () => {
          const now = files(workdir);
          const all = new Set([...now, ...Object.keys(trees[rev])]);
          return [...all].filter((p) => !now.includes(p) || trees[rev][p] !== readFileSync(join(workdir, p), 'utf8'));
        },
        drop: async () => rmSync(workdir, { recursive: true, force: true }),
      };
    },
  } as unknown as Vcs;
  return { vcs, made };
}

const kase: BenchCase = { id: '1', ticket: '1', title: 'T', spec: 'do it', baseSha: 'base', headSha: 'head', oracleTests: ['test/a.test.ts'] };
const lineOf = (args: string[], o?: { env?: NodeJS.ProcessEnv }) => o?.env?.AGENTIC_SDLC_CMD ?? args.at(-1)!;
const promptOf = (line: string) => /--prompt (['"])(.+?)\1/.exec(line)![2];
const benchBinding = { ...binding, commands: { ...binding.commands, install: 'npm ci' } };

test('runBench: the agent never sees the oracle; verify runs in a fresh tree with the head proof and config', async () => {
  const root = mkdtempSync(join(tmpdir(), 'root-'));
  const { vcs, made } = fakeVcs({
    base: { 'src/a.ts': 'old', 'src/gone.ts': 'g', 'package.json': 'base-pkg', 'test/old.test.ts': 'base-test' },
    head: { 'src/a.ts': 'solution', 'src/gone.ts': 'g', 'package.json': 'head-pkg', 'test/old.test.ts': 'base-test', 'test/a.test.ts': 'oracle' },
  });
  const calls: string[] = [];
  let t = 0, agentDir = '', verifies = 0;
  const exec = (_cmd: string, args: string[], o?: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
    const line = lineOf(args, o);
    const cwd = o!.cwd!;
    calls.push(line);
    assert.ok(!cwd.startsWith(root), 'case tree inside the repo root');
    if (line.startsWith('agent')) {
      agentDir = cwd;
      assert.equal(existsSync(join(cwd, 'test/a.test.ts')), false, 'oracle visible to the agent');
      assert.equal(readFileSync(join(cwd, 'src/a.ts'), 'utf8'), 'old');
      assert.match(readFileSync(promptOf(line), 'utf8'), /implement-spec[\\/]SKILL\.md[\s\S]*do it/);
      // the agent edits product code, games the tests and the verify config, writes its own oracle
      writeFileSync(join(cwd, 'src/a.ts'), 'agent');
      writeFileSync(join(cwd, 'src/b.ts'), 'new');
      rmSync(join(cwd, 'src/gone.ts'));
      writeFileSync(join(cwd, 'test/old.test.ts'), 'gamed');
      writeFileSync(join(cwd, 'test/a.test.ts'), 'gamed');
      writeFileSync(join(cwd, 'package.json'), 'gamed');
      t += 120000;
      return '';
    }
    assert.notEqual(cwd, agentDir, 'verify ran in the agent tree');
    const read = (p: string) => readFileSync(join(cwd, p), 'utf8');
    assert.deepEqual([read('src/a.ts'), read('src/b.ts'), existsSync(join(cwd, 'src/gone.ts'))], ['agent', 'new', false]);
    assert.deepEqual([read('test/a.test.ts'), read('test/old.test.ts'), read('package.json')], ['oracle', 'base-test', 'head-pkg']);
    if (line === 'npm test' && ++verifies === 2) throw new Error('red');
    return '';
  };
  const r = await runBench([kase, { ...kase, id: '2' }], { model: 'm1', root, binding: benchBinding, scorerDir: join(root, 'si') }, { exec, vcs, now: () => t });
  assert.ok('cases' in r);
  assert.deepEqual(r.cases.map((c) => [c.id, c.pass, c.minutes]), [['1', true, 2], ['2', false, 2]]);
  assert.equal(r.cases[0].scorerInput, 'si/1.md');
  assert.match(readFileSync(join(root, 'si/1.md'), 'utf8'), /do it[\s\S]*### src\/a\.ts\s+Before:\s+`{4}\s+old[\s\S]*After:\s+`{4}\s+agent/);
  assert.equal(r.passRate, 0.5);
  assert.equal(r.minutes, 4);
  assert.match(calls[0], /^agent --model .m1. --prompt .+ --cwd .+agentic-bench-/);
  assert.deepEqual(calls.slice(1, 3), ['npm ci', 'npm test']);
  assert.deepEqual(made.filter((d) => existsSync(d)), [], 'case trees left behind');
});

test('runBench --factory runs the candidate skill AND binding', async () => {
  const facBinding = { ...benchBinding, agent_command: 'fac-agent --prompt {prompt_file} --cwd {workdir}' };
  const { vcs } = fakeVcs({
    base: { 'src/a.ts': 'old' },
    head: { 'src/a.ts': 'x', 'test/a.test.ts': 'oracle' },
    fac: { '.agents/binding.yml': JSON.stringify(facBinding), '.agents/skills/implement-spec/SKILL.md': 'candidate' },
  });
  const calls: string[] = [];
  const exec = (_c: string, args: string[], o?: { env?: NodeJS.ProcessEnv }) => {
    const line = lineOf(args, o);
    calls.push(line);
    if (line.startsWith('fac-agent')) {
      const skill = /Follow the skill at (.+?), with/.exec(readFileSync(promptOf(line), 'utf8'))![1];
      assert.equal(readFileSync(skill, 'utf8'), 'candidate');
    }
    return '';
  };
  const r = await runBench([kase], { model: 'm', root: mkdtempSync(join(tmpdir(), 'root-')), binding: benchBinding, factory: 'fac' }, { exec, vcs });
  assert.ok('cases' in r);
  assert.match(calls[0], /^fac-agent /);
  assert.equal(r.factory, 'fac');
  assert.deepEqual([r.executor, r.executorKind], ['harness', 'harness']);
});

test('runBench --dry-run starts nothing', async () => {
  const exec = () => { throw new Error('ran'); };
  const r = await runBench([kase], { model: 'm', root: '/r', binding, dryRun: true }, { exec, vcs: {} as Vcs });
  assert.ok('dryRun' in r);
  assert.match(r.dryRun[0].command, /--cwd .<workdir>.$/);
});

const result = (model: string, cases: [string, boolean, number][]): BenchResult =>
  ({ model, executor: 'harness', at: '', passRate: 0, minutes: 0, cases: cases.map(([id, pass, minutes]) => ({ id, pass, minutes })) });

test('report groups by executor name, not kind', () => {
  const r = (executor: string, pass: boolean): BenchResult => ({ ...result('m', [['1', pass, 1]]), executor, executorKind: 'command' });
  const rows = report([r('bot-a', true), r('bot-b', false), r('bot-a', true)]);
  assert.deepEqual(rows.map((x) => [x.executor, x.executorKind, x.n, x.passRate]), [['bot-a', 'command', 2, 1], ['bot-b', 'command', 1, 0]]);
});

test('compare: Wilson lower bound over shared trials; too few cases or trials regress; cli reads the binding minimums', async () => {
  assert.equal(wilsonLower(0, 0), 0);
  assert.ok(Math.abs(wilsonLower(9, 10) - 0.5958) < 1e-3);
  // 3 shared cases x 2 trials; a passes all, b fails one trial.
  const rows = (fail: string[]): [string, boolean, number][] => ['1', '2', '3'].flatMap((id) => [[id, !fail.includes(`${id}a`), 1], [id, !fail.includes(`${id}b`), 1]] as [string, boolean, number][]);
  const a = result('a', [...rows([]), ['9', false, 5]]);
  const b = result('b', rows(['2a']));
  const o = { minCases: 3, trials: 2 };
  const c = compare(a, b, o);
  assert.equal(c.cases, 3);
  assert.equal(c.a.trials, 2);
  assert.ok(c.b.lower < c.a.lower);
  assert.equal(c.regressed, true);
  assert.equal(compare(b, a, o).regressed, false);
  assert.deepEqual(compare(b, a, { minCases: 4, trials: 2 }).insufficient, ['3 shared cases, need 4']);
  assert.deepEqual(compare(b, a, { minCases: 3, trials: 3 }).insufficient, ['2 trials on a shared case, need 3']);
  assert.equal(compare(b, a).regressed, true); // defaults: 20 cases, 3 trials

  const dir = mkdtempSync(join(tmpdir(), 'cmp-'));
  writeFileSync(join(dir, 'a.json'), JSON.stringify(a));
  writeFileSync(join(dir, 'b.json'), JSON.stringify(b));
  const log = console.log;
  console.log = () => {};
  try {
    const ctx = { root: dir, binding: { ...binding, learning: { ...binding.learning, bench_min_cases: 3, bench_trials: 2 } }, env: {}, exec: () => '', http: async () => ({}) };
    assert.equal(await cli(['compare', 'a.json', 'b.json'], ctx), 1);
    assert.equal(await cli(['compare', 'b.json', 'a.json'], ctx), 0);
    assert.equal(await cli(['compare', 'b.json', 'a.json'], { ...ctx, binding }), 1); // template defaults
  } finally {
    console.log = log;
  }
});

test('buildCases --paths keeps CRs touching the glob; --per-size stratifies oldest to newest', async () => {
  const sized = (id: string, size: string, at: string) => ({ id, title: id, updatedAt: at, fields: { size } }) as unknown as Item;
  const items = [sized('1', 'S', '2026-01'), sized('2', 'S', '2026-02'), sized('3', 'S', '2026-03'), sized('4', 'L', '2026-04'), sized('5', 'S', '2026-05')];
  const board = { list: async () => items, comments: async () => [], get: async (id: string) => items.find((i) => i.id === id)! } as unknown as Board;
  const d = (dir: string) => `diff --git a/${dir}/x.ts b/${dir}/x.ts\ndiff --git a/test/x.test.ts b/test/x.test.ts\n--- /dev/null\n+++ b/test/x.test.ts\n`;
  const forge = {
    list: async () => items.map((i) => ({ n: `c${i.id}`, closes: [i.id], state: 'merged', baseSha: 'b', headSha: 'h' })),
    diff: async (n: string) => d(n === 'c2' ? 'docs' : 'src/pay'),
  } as unknown as Forge;
  const b = { ...binding, sizes: ['S', 'M', 'L'] };
  assert.deepEqual((await buildCases(board, forge, b, 9, { paths: ['src/**'] })).map((c) => c.id), ['5', '4', '3', '1']);
  const strat = await buildCases(board, forge, b, 9, { perSize: 2 });
  assert.deepEqual(strat.map((c) => [c.id, c.size, c.area]), [['1', 'S', 'src/pay'], ['5', 'S', 'src/pay'], ['4', 'L', 'src/pay']]);
  assert.deepEqual(stratify(strat, 1, b.sizes).map((c) => c.id), ['1', '4']);
});

test('diverse takes one case per size and area in turn', () => {
  const c = (id: string, size: string, area: string) => ({ ...kase, id, size, area });
  assert.deepEqual(diverse([c('1', 'S', 'a'), c('2', 'S', 'a'), c('3', 'L', 'a'), c('4', 'S', 'b')], 3).map((x) => x.id), ['1', '3', '4']);
});

test('report groups per model, marks the Pareto front; cli report reads only the suite results', async () => {
  const res = (model: string, suite: string, cases: [string, boolean, number][]) => ({ ...result(model, cases), suite });
  const rs = [
    res('cheap', 's', [['1', true, 1], ['2', false, 1]]),
    res('best', 's', [['1', true, 5], ['2', true, 5]]),
    res('worse', 's', [['1', false, 6], ['2', true, 6]]),
    res('other', 'x', [['1', true, 0.1]]),
  ];
  const rows = report(rs.slice(0, 3));
  assert.deepEqual(rows.map((r) => [r.model, r.passRate, r.medianMinutes, r.n, r.pareto]), [['best', 1, 5, 2, true], ['cheap', 0.5, 1, 2, true], ['worse', 0.5, 6, 2, false]]);
  const root = mkdtempSync(join(tmpdir(), 'rep-'));
  mkdirSync(join(root, '.agents/bench/results'), { recursive: true });
  rs.forEach((r, i) => writeFileSync(join(root, `.agents/bench/results/${i}.json`), JSON.stringify(r)));
  const out: string[] = [];
  const log = console.log;
  console.log = (s: string) => out.push(s);
  try {
    assert.equal(await cli(['report', '--suite', 's'], { root, binding, env: {}, exec: () => '', http: async () => ({}) }), 0);
  } finally {
    console.log = log;
  }
  assert.equal(JSON.parse(out[0]).results, 3);
});

test('runBench --trials: one row per trial, each in fresh trees', async () => {
  const { vcs, made } = fakeVcs({ base: { 'src/a.ts': 'old' }, head: { 'src/a.ts': 'new', 'test/a.test.ts': 'oracle' } });
  let verifies = 0;
  const exec = (_c: string, args: string[], o?: { env?: NodeJS.ProcessEnv }) => {
    if (lineOf(args, o) === 'npm test' && ++verifies === 2) throw new Error('flaky');
    return '';
  };
  const r = await runBench([kase], { model: 'm', root: mkdtempSync(join(tmpdir(), 'root-')), binding, trials: 3 }, { exec, vcs });
  assert.ok('cases' in r);
  assert.deepEqual(r.cases.map((c) => [c.id, c.trial, c.pass]), [['1', 1, true], ['1', 2, false], ['1', 3, true]]);
  assert.equal(made.length, 9); // agent, verify and oracle trees per trial
});

test('compare: no common cases or fewer cases in b is a regression', () => {
  const r = (ids: string[]) => ({ model: 'm', executor: 'harness', at: '', passRate: 1, minutes: 0, cases: ids.map((id) => ({ id, pass: true, minutes: 1 })) }) as any;
  const o = { minCases: 1, trials: 1 };
  assert.equal(compare(r(['1']), r(['2']), o).regressed, true);
  assert.equal(compare(r(['1', '2']), r(['1']), o).regressed, true);
  assert.equal(compare(r(['1']), r(['1', '2']), o).regressed, false);
});

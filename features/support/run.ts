// Runs every features/**/*.feature on node:test: a Feature is a describe, a Rule a nested describe, a Scenario
// (or one Examples row) an it. Run: `node --test features/support/run.ts` (npm test does, after the build).
//   FEATURE=<text>   only feature files whose path contains <text>      e.g. FEATURE=gates/approval
//   SCENARIO=<regex> only scenarios whose title matches                  e.g. SCENARIO='Fast-lane'
//   TAGS=@a,@b       only scenarios carrying one of the tags (own, Rule or Feature tags)
//   node's own `--test-name-pattern` also works, placed before the file: node --test --test-name-pattern X features/support/run.ts
// A scenario tagged @only runs alone (all others are left out); @skip skips it, the comment above the tags is the reason.
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, GherkinError, type Feature, type Scenario, type Step } from './gherkin.ts';
import { defs, match, snippet, type StepDef } from './steps.ts';
import { World } from './world.ts';

const root = fileURLToPath(new URL('../', import.meta.url)); // features/
const repo = fileURLToPath(new URL('../../', import.meta.url));
const rel = (f: string) => relative(repo, f);

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

// Step definitions: common first, then the rest.
const stepFiles = readdirSync(join(root, 'steps')).filter((f) => f.endsWith('.ts')).sort((a, b) => (a === 'common.ts' ? -1 : b === 'common.ts' ? 1 : a.localeCompare(b)));
for (const f of stepFiles) await import(pathToFileURL(join(root, 'steps', f)).href);

const only = process.env.FEATURE;
const wantTags = (process.env.TAGS ?? '').split(',').map((t) => t.trim()).filter(Boolean);
const nameRe = process.env.SCENARIO ? new RegExp(process.env.SCENARIO, 'i') : undefined;
const filtered = !!only || wantTags.length > 0 || !!nameRe;

type Parsed = { file: string; feature?: Feature; error?: Error };
const parsed: Parsed[] = walk(root)
  .filter((f) => f.endsWith('.feature'))
  .sort()
  .filter((f) => !only || rel(f).includes(only))
  .map((file) => {
    try { return { file, feature: parse(readFileSync(file, 'utf8'), rel(file)) }; } catch (error) { return { file, error: error as Error }; }
  });

const resolveStep = (text: string): { def?: StepDef; args?: unknown[]; ambiguous?: StepDef[] } => {
  const hits = defs.map((def) => ({ def, args: match(def, text) })).filter((h) => h.args);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return { ambiguous: hits.map((h) => h.def) };
  return {};
};

const allScenarios = (f: Feature) => [...f.scenarios, ...f.rules.flatMap((r) => r.scenarios)];
const hasOnly = parsed.some((p) => p.feature && allScenarios(p.feature).some((s) => s.tags.includes('@only')));

// Static pass: which definitions do the features use? (skipped scenarios count: their steps are still the vocabulary.)
for (const p of parsed) {
  if (!p.feature) continue;
  const stepsOf = (f: Feature) => [...(f.background?.steps ?? []), ...f.rules.flatMap((r) => r.background?.steps ?? []), ...allScenarios(f).flatMap((s) => s.steps)];
  for (const s of stepsOf(p.feature)) { const r = resolveStep(s.text); if (r.def) r.def.used = true; }
}

function decorate(e: unknown, file: string, step: Step, keyword: string): Error {
  const where = `${file}:${step.line}: ${keyword} ${step.text}`;
  if (e instanceof Error) { e.message = `${where}\n${e.message}`; return e; }
  return new Error(`${where}\n${String(e)}`);
}

async function runSteps(world: World, steps: Step[], file: string, state: { keyword: string }) {
  for (const step of steps) {
    const keyword = ['And', 'But', '*'].includes(step.keyword) ? state.keyword : step.keyword;
    state.keyword = keyword;
    const r = resolveStep(step.text);
    if (r.ambiguous) {
      throw decorate(new Error(`ambiguous step; it matches:\n${r.ambiguous.map((d) => `  ${d.where}  ${String(d.source)}`).join('\n')}`), file, step, keyword);
    }
    if (!r.def) {
      throw decorate(new Error(`undefined step. Add to features/steps/<area>.ts:\n\n${snippet(keyword, step.text, step.table ? 'table' : step.docString !== undefined ? 'docString' : undefined)}\n`), file, step, keyword);
    }
    const extra = step.table ? [step.table] : step.docString !== undefined ? [step.docString] : [];
    try { await r.def.fn(world, ...(r.args ?? []), ...extra); } catch (e) { throw decorate(e, file, step, keyword); }
  }
}

function registerScenario(f: Feature, s: Scenario, inherited: string[], backgrounds: { steps: Step[] }[]) {
  const tags = [...inherited, ...s.tags];
  if (wantTags.length && !wantTags.some((t) => tags.includes(t))) return;
  if (nameRe && !nameRe.test(s.name)) return;
  if (hasOnly && !s.tags.includes('@only')) return;
  const skip = tags.includes('@skip') ? (s.comment.trim() || 'tagged @skip') : false;
  it(s.name, { skip }, async () => {
    const world = new World();
    const state = { keyword: 'Given' };
    try {
      for (const b of backgrounds) await runSteps(world, b.steps, f.file, state);
      await runSteps(world, s.steps, f.file, state);
    } finally {
      world.cleanup();
    }
  });
}

for (const p of parsed) {
  if (p.error) {
    describe(`${rel(p.file)}`, () => { it('parses', () => { throw p.error; }); });
    continue;
  }
  const f = p.feature!;
  describe(`${f.name} (${f.file})`, () => {
    const fb = f.background ? [f.background] : [];
    for (const s of f.scenarios) registerScenario(f, s, f.tags, fb);
    for (const r of f.rules) {
      describe(`Rule: ${r.name}`, () => {
        for (const s of r.scenarios) registerScenario(f, s, [...f.tags, ...r.tags], [...fb, ...(r.background ? [r.background] : [])]);
      });
    }
  });
}

if (!filtered && !hasOnly) {
  describe('step library', () => {
    it('every step definition is used by a feature', () => {
      const unused = defs.filter((d) => !d.used);
      if (unused.length) throw new Error(`step definitions no feature uses (delete them):\n${unused.map((d) => `  ${d.where}  ${String(d.source)}`).join('\n')}`);
    });
  });
}

export { GherkinError };

// The lint of the SHIPPED skill pack (./skills), with the same check functions the `skill-regression` gate runs on an install.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliCalls, cliFlags, cliVerbs, skillPackCheck } from '../src/gates.ts';
import { forbiddenHits, frontmatter, readSkills } from '../src/skills.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(ROOT, 'skills');
const md = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? md(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));

test('shipped skills: the loader finds seven skills and their steps, with no problem', () => {
  const pack = readSkills(SKILLS);
  assert.deepEqual(pack.errors, []);
  assert.deepEqual(pack.warnings, []);
  assert.deepEqual(pack.skills.map((s) => s.skill), ['build', 'escalate', 'learn', 'plan', 'review', 'sdlc', 'ship']);
  assert.deepEqual(pack.steps.map((s) => s.id), ['build', 'escalate', 'learn/judge', 'learn/improve', 'plan/triage', 'plan/groom', 'plan/shape', 'review/review', 'review/verify', 'sdlc', 'ship']);
});

test('shipped skills: no forbidden word, every relative link resolves, every CLI call names a verb, a step and flags that exist', () => {
  const r = skillPackCheck(SKILLS, ROOT);
  assert.deepEqual(r.errors, [], `\n${r.errors.join('\n')}`);
  assert.deepEqual(r.warnings, []);
});

test('shipped skills: the lint sees what a skill file says (it is not vacuous)', () => {
  const all = md(SKILLS).flatMap((f) => cliCalls(readFileSync(f, 'utf8')));
  assert.ok(all.length > 80, `${all.length} CLI calls found`);
  const verbs = cliVerbs();
  for (const c of all) if (c.group !== 'dispatch') assert.ok(verbs[c.group].has(c.verb), `${c.group} ${c.verb}`);
  for (const g of ['board', 'forge', 'vcs', 'gate', 'ledger', 'bench', 'dispatch']) assert.ok(all.some((c) => c.group === g), `a skill calls ${g}`);
  assert.deepEqual(cliCalls('Run `agentic-sdlc forge verdict <n> --pass|--fail\n  --body-file <f>` and `dispatch plan/shape --ticket <id>`; not `forge.provenance`, `board`'),
    [{ group: 'forge', verb: 'verdict', rest: ' <n> --pass|--fail\n  --body-file <f>', line: 1 }, { group: 'dispatch', verb: 'plan/shape', rest: ' --ticket <id>', line: 2 }]);
  assert.ok(cliFlags('forge', 'verdict')!.has('body-file') && !cliFlags('forge', 'verdict')!.has('body'));
  assert.ok(cliFlags('dispatch', '')!.has('run-model'));
  assert.equal(cliFlags('gate', 'evidence'), undefined);
});

test('shipped skills: a wrong verb, flag or step in a skill is reported', () => {
  const calls = cliCalls('`forge land <n> --force`, `board nope 1`, `dispatch plan/nope --ticket 1`, `vcs push --all`');
  const bad = calls.filter((c) => (c.group === 'dispatch' ? false : !cliVerbs()[c.group].has(c.verb)) || [...c.rest.matchAll(/--([a-z-]+)/g)].some((m) => !(cliFlags(c.group, c.verb) ?? new Set([m[1]])).has(m[1])));
  assert.deepEqual(bad.map((c) => `${c.group} ${c.verb}`), ['forge land', 'board nope', 'vcs push']);
});

test('shipped skills: the frontmatter flags and tiers', () => {
  const rows = readdirSync(SKILLS).sort().map((d) => {
    const fm = frontmatter(readFileSync(join(SKILLS, d, 'SKILL.md'), 'utf8'))!.fm;
    return { skill: d, model: fm['disable-model-invocation'] !== true, user: fm['user-invocable'] !== false };
  });
  assert.deepEqual(rows, [
    { skill: 'build', model: true, user: false },
    { skill: 'escalate', model: true, user: false },
    { skill: 'learn', model: false, user: true },
    { skill: 'plan', model: true, user: false },
    { skill: 'review', model: true, user: false },
    { skill: 'sdlc', model: true, user: true },
    { skill: 'ship', model: false, user: true },
  ]);
});

test('shipped skills: forbiddenHits fires on a setup word (the check itself works)', () => {
  assert.equal(forbiddenHits('Post it as the review identity.').length, 1);
  assert.deepEqual(forbiddenHits('Run `agentic-sdlc gate evidence --sha x`.'), []);
});

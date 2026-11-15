// The executable lint of a skill pack. The shipped pack (skills/ of this repo) and small fixture packs go through the same
// functions an install runs: the loader (readSkills) and the gate's check (skillPackCheck). The forbidden words, the verb
// tables and the old step ids come from src/, never copied here.
// State on w.state: skillsDir (the pack folder), rel (the folder file names are relative to), pack (the last read), check (the last check), calls.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cliCalls, cliFlags, skillPackCheck } from '../../src/gates.ts';
import { frontmatter, readSkills, stepIdOf } from '../../src/skills.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { REPO, type World } from '../support/world.ts';
import { packFiles, writePack } from '../support/skillfix.ts';

const mdFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mdFiles(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));
const dir = (w: World) => { assert.ok(w.state.skillsDir, 'add a Given that sets the pack'); return w.state.skillsDir as string; };
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const joined = (xs: string[]) => xs.join('\n');

// ---- the pack under test ----
Given('the shipped skill pack', (w) => { w.state.skillsDir = join(REPO, 'skills'); w.state.rel = REPO; });
Given('a skills folder holding the standard fixture pack', (w) => { w.state.skillsDir = w.path('skills'); w.state.rel = w.root; writePack(w.path('skills'), packFiles()); });
Given('an installed skills folder holding the standard fixture pack, every skill but sdlc in a folder named sdlc-<skill>', (w) => {
  w.state.skillsDir = w.path('skills'); w.state.rel = w.root; writePack(w.path('skills'), packFiles('sdlc-'));
});
Given('the pack file {string} is:', (w, file: string, text: string) => w.write(`skills/${file}`, text.endsWith('\n') ? text : text + '\n'));
Given('the pack file {string} is removed', (w, file: string) => rmSync(w.path('skills', file), { force: true }));

// ---- run the loader or the gate's check ----
When('the pack is read', (w) => { w.state.pack = readSkills(dir(w)); });
When('the pack is checked', (w) => { w.state.check = skillPackCheck(dir(w), w.state.rel); w.state.pack = w.state.check.pack; });

// ---- what they found ----
const found = (w: World) => (w.state.check ?? w.state.pack) as { errors: string[]; warnings: string[] };
Then('the pack has no error and no warning', (w) => { assert.deepEqual(found(w).errors, [], `\n${joined(found(w).errors)}`); assert.deepEqual(found(w).warnings, []); });
Then('the pack has an error mentioning {string}', (w, text: string) => assert.ok(found(w).errors.some((e) => e.includes(text)), `no error mentions "${text}":\n${joined(found(w).errors)}`));
Then('the pack has a warning mentioning {string}', (w, text: string) => assert.ok(found(w).warnings.some((e) => e.includes(text)), `no warning mentions "${text}":\n${joined(found(w).warnings)}`));
Then('the pack has no error', (w) => assert.deepEqual(found(w).errors, [], `\n${joined(found(w).errors)}`));
Then('the pack has no warning', (w) => assert.deepEqual(found(w).warnings, []));
Then('the skills are {string}', (w, names: string) => assert.deepEqual(w.state.pack.skills.map((s: { skill: string }) => s.skill), list(names)));
Then('the steps are {string}', (w, ids: string) => assert.deepEqual(w.state.pack.steps.map((s: { id: string }) => s.id), list(ids)));
Then('the steps and their tiers are:', (w, t: DataTable) => assert.deepEqual(w.state.pack.steps.map((s: { id: string; tier: string }) => ({ id: s.id, tier: s.tier })), t.hashes().map((r) => ({ id: r.id, tier: r.tier }))));
Then('the step {string} follows the file {string}', (w, id: string, file: string) => {
  const s = w.state.pack.steps.find((x: { id: string }) => x.id === id);
  assert.ok(s, `no step ${id}`);
  assert.equal(relative(dir(w), s.file).replaceAll('\\', '/').replace(/^sdlc-/, ''), file);
});

// ---- old step ids ----
Then('the old name {string} is the step {string}', (_w, old: string, id: string) => assert.equal(stepIdOf(old), id));

// ---- the shipped pack only ----
Then('the frontmatter of each skill says:', (w, t: DataTable) => {
  const rows = readdirSync(dir(w)).sort().map((d) => {
    const fm = frontmatter(readFileSync(join(dir(w), d, 'SKILL.md'), 'utf8'))!.fm;
    return { skill: d, model: String(fm['disable-model-invocation'] !== true), user: String(fm['user-invocable'] !== false) };
  });
  assert.deepEqual(rows, t.hashes().map((r) => ({ skill: r.skill, model: r.model, user: r.user })));
});

Then('no skill file spells a comment marker', (w) => {
  // Every marker is an HTML comment on the first line of a comment (src/comments.ts); a skill never writes one.
  const problems: string[] = [];
  for (const f of mdFiles(dir(w))) readFileSync(f, 'utf8').split(/\r?\n/).forEach((text, i) => { if (text.includes('<!--')) problems.push(`${relative(REPO, f)}:${i + 1}: an HTML comment: markers are stamped by '--kind'`); });
  assert.deepEqual(problems, [], `\n${joined(problems)}`);
});

Then('every binding key a skill names is a key of templates/binding.yml', (w) => {
  const tpl = readFileSync(join(REPO, 'templates', 'binding.yml'), 'utf8');
  const bad: string[] = [];
  for (const f of mdFiles(dir(w))) readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/`((?:board|forge|vcs|paths|commands|owners|product|learning|cycle|heartbeat|executors|models)\.[a-z_]+(?:\.[a-z_]+)*)`/g)) {
      const last = m[1].split('.').pop()!;
      if (/^learning\.(judge|due|lastProposal|benchBaseline)$/.test(m[1])) continue; // fields of `ledger summary` and the heartbeat, not binding keys
      if (!new RegExp(`(^|[^\\w])${last}:`, 'm').test(tpl)) bad.push(`${relative(REPO, f)}:${i + 1}: ${m[1]}`);
    }
  });
  assert.deepEqual(bad, [], `\n${joined(bad)}`);
});

// ---- the lint is not vacuous: what it sees in the skill files, and how it reads a call ----
When('the CLI calls in the skill files are counted', (w) => { w.state.calls = mdFiles(dir(w)).flatMap((f) => cliCalls(readFileSync(f, 'utf8'))); });
Then('there are more than {int} CLI calls', (w, n: number) => assert.ok(w.state.calls.length > n, `${w.state.calls.length} CLI calls found`));
Then('the skill files call a verb of each group {string}', (w, groups: string) => {
  for (const g of list(groups)) assert.ok(w.state.calls.some((c: { group: string }) => c.group === g), `no skill calls ${g}`);
});
When('the CLI calls are read from the text:', (w, text: string) => { w.state.calls = cliCalls(text); });
Then('the calls are:', (w, t: DataTable) =>
  assert.deepEqual(w.state.calls.map((c: { group: string; verb: string; line: number }) => ({ group: c.group, verb: c.verb, line: String(c.line) })), t.hashes().map((r) => ({ group: r.group, verb: r.verb, line: r.line }))));
Then('the verb {string} takes the flag {string}', (_w, verb: string, flag: string) => { const [g, v] = verb.split(' '); assert.ok(cliFlags(g, v ?? '')!.has(flag)); });
Then('the verb {string} takes no flag {string}', (_w, verb: string, flag: string) => { const [g, v] = verb.split(' '); assert.ok(!cliFlags(g, v ?? '')!.has(flag)); });
Then('the group {string} has no flag table', (_w, group: string) => assert.equal(cliFlags(group, 'evidence'), undefined));

// The executable lint of a skill pack. The shipped pack (skills/ of this repo) and small fixture packs go through the same
// functions an install runs: the loader (readSkills) and the gate's check (skillPackCheck). The forbidden words, the verb
// tables and the old step ids come from src/, never copied here.
// State on w.state: skillsDir (the pack folder), rel (the folder file names are relative to), pack (the last read), check (the last check), calls.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { skillPackCheck } from '../../src/gates.ts';
import { readSkills } from '../../src/skills.ts';
import { Given, When, Then } from '../support/steps.ts';
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
Given('the pack file {string} is:', (w, file: string, text: string) => w.write(`skills/${file}`, text.endsWith('\n') ? text : text + '\n'));
Given('the pack file {string} is removed', (w, file: string) => rmSync(w.path('skills', file), { force: true }));

// ---- run the loader or the gate's check ----
When('the pack is read', (w) => { w.state.pack = readSkills(dir(w)); });
When('the pack is checked', (w) => { w.state.check = skillPackCheck(dir(w), w.state.rel); w.state.pack = w.state.check.pack; });

// ---- what they found ----
const found = (w: World) => (w.state.check ?? w.state.pack) as { errors: string[]; warnings: string[] };
Then('the pack has no error and no warning', (w) => { assert.deepEqual(found(w).errors, [], `\n${joined(found(w).errors)}`); assert.deepEqual(found(w).warnings, []); });
Then('the pack has an error mentioning {string}', (w, text: string) => assert.ok(found(w).errors.some((e) => e.includes(text)), `no error mentions "${text}":\n${joined(found(w).errors)}`));
Then('the steps are {string}', (w, ids: string) => assert.deepEqual(w.state.pack.steps.map((s: { id: string }) => s.id), list(ids)));

// ---- old step ids ----

// ---- the shipped pack only ----


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

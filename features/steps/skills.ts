// The skill loader (readSkills) and the gate's pack check (skillPackCheck), run on small fixture packs.
// State on w.state: skillsDir (the pack folder), rel (the folder file names are relative to), pack (the last read), check (the last check), calls.
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { skillPackCheck } from '../../src/gates.ts';
import { readSkills } from '../../src/skills.ts';
import { Given, When, Then } from '../support/steps.ts';
import type { World } from '../support/world.ts';
import { packFiles, writePack } from '../support/skillfix.ts';

const dir = (w: World) => { assert.ok(w.state.skillsDir, 'add a Given that sets the pack'); return w.state.skillsDir as string; };
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const joined = (xs: string[]) => xs.join('\n');

// ---- the pack under test ----
Given('a skills folder holding the standard fixture pack', (w) => { w.state.skillsDir = w.path('skills'); w.state.rel = w.root; writePack(w.path('skills'), packFiles()); });
Given('the pack file {string} is:', (w, file: string, text: string) => w.write(`skills/${file}`, text.endsWith('\n') ? text : text + '\n'));
Given('the pack file {string} is removed', (w, file: string) => rmSync(w.path('skills', file), { force: true }));

// ---- run the loader or the gate's check ----
When('the pack is read', (w) => { w.state.pack = readSkills(dir(w)); });
When('the pack is checked', (w) => { w.state.check = skillPackCheck(dir(w), w.state.rel); w.state.pack = w.state.check.pack; });

// ---- what they found ----
const found = (w: World) => (w.state.check ?? w.state.pack) as { errors: string[]; warnings: string[] };
Then('the pack has an error mentioning {string}', (w, text: string) => assert.ok(found(w).errors.some((e) => e.includes(text)), `no error mentions "${text}":\n${joined(found(w).errors)}`));
Then('the steps are {string}', (w, ids: string) => assert.deepEqual(w.state.pack.steps.map((s: { id: string }) => s.id), list(ids)));


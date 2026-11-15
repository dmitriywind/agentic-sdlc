// Gates run in-process against in-memory board and forge fakes (features/support/fakes.ts).
// The one CR of a scenario is number "1" with head "h1". State kept on w.state: gate (the last gate result).
import assert from 'node:assert/strict';
import { approval } from '../../src/gates.ts';
import { diffOf, baseBinding } from '../support/fakes.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import type { World } from '../support/world.ts';

const CR = '1';

/** Adds a path to the diff of the scenario's CR. */
const changes = (w: World, path: string) => {
  const prev = (w.gate.diffs.get(CR) as string | undefined) ?? '';
  w.gate.diffs.set(CR, prev + diffOf(path));
};
const review = (w: World, user: string, state: string, sha: string, assoc?: string) => {
  const list = w.gate.reviews.get(CR) ?? [];
  list.push({ user, state, sha, ...(assoc ? { assoc } : {}) });
  w.gate.reviews.set(CR, list);
};

// ---- Given: the change request and its ticket ----
Given('a product CR whose ticket has the Lane {string}', (w, lane: string) => {
  w.gate.ticket('12', 'In review', { lane });
  w.gate.cr(CR, { closes: ['12'], source: '12/x' });
  changes(w, 'src/x.ts');
});
Given('a product CR whose ticket has no Lane', (w) => {
  w.gate.ticket('12', 'In review');
  w.gate.cr(CR, { closes: ['12'], source: '12/x' });
  changes(w, 'src/x.ts');
});
Given('a CR that changes {string}', (w, path: string) => { w.gate.cr(CR); changes(w, path); });
Given('the CR also changes {string}', (w, path: string) => changes(w, path));
Given('a CR whose diff the forge cannot return', (w) => {
  w.gate.cr(CR);
  w.gate.diffs.set(CR, new Error('HTTP 406: diff too large'));
});
Given('a CR whose diff has a header with a quoted path', (w) => {
  w.gate.cr(CR);
  w.gate.diffs.set(CR, 'diff --git "a/.agents/\\303\\251.md" "b/.agents/\\303\\251.md"\n');
});
Given('a CR that changes only the models in the binding', (w) => {
  w.gate.cr(CR);
  changes(w, '.agents/binding.yml');
  const b = baseBinding();
  w.gate.files.set('base:.agents/binding.yml', JSON.stringify(b));
  w.gate.files.set(`h${CR}:.agents/binding.yml`, JSON.stringify({ ...b, models: { ...b.models, fast: 'f2' } }));
});

// ---- Given: the reviews of the CR ----
Given('{string} with the association {string} approved the head', (w, user: string, assoc: string) => review(w, user, 'approved', `h${CR}`, assoc));
Given('{string} approved the head without an author association', (w, user: string) => review(w, user, 'approved', `h${CR}`));
Given('these reviews are on the CR:', (w, t: DataTable) => {
  for (const r of t.hashes()) review(w, r.user, r.state, r.commit === 'head' ? `h${CR}` : r.commit, r.association || undefined);
});

// ---- When ----
When('the approval gate runs', async (w) => { w.state.gate = await approval(w.gateDeps(), CR); });

// ---- Then ----
const posted = (w: World) => {
  const s = w.gate.statuses.at(-1);
  assert.ok(s, 'the gate posted no status');
  return s;
};
Then('the CR class is {string}', (w, klass: string) => assert.equal(w.state.gate.class, klass));
Then('the status {string} is {string}', (w, context: string, state: string) => {
  const s = posted(w);
  assert.equal(s.context, context);
  assert.equal(s.state, state, `status description: ${s.description}`);
});
Then('the status is posted on the head of the CR', (w) => assert.equal(posted(w).sha, `h${CR}`));
Then('the status description is {string}', (w, text: string) => assert.equal(posted(w).description, text));
Then('only the status {string} is posted', (w, context: string) => {
  assert.ok(w.gate.statuses.length > 0);
  assert.ok(w.gate.statuses.every((s) => s.context === context), JSON.stringify(w.gate.statuses));
});

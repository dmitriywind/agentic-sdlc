// The marker registry of src/comments.ts: the first line of each comment kind, called as functions on table input.
// State on w.state: cm (specMarker, kind, ref, line, body, verdict, error, matched, filter).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { When, Then } from '../support/steps.ts';
import type { World } from '../support/world.ts';
import { KINDS, isMarked, parseKind, stamp, stampBody, type Kind } from '../../src/comments.ts';
import { parse } from 'yaml';
import { REPO } from '../support/world.ts';
import { join } from 'node:path';

type Cm = { specMarker?: string; kind?: Kind; ref?: string; line?: string; body?: string; verdict?: string; error?: Error; filter?: string; marked?: boolean };
const cm = (w: World): Cm => (w.state.cm ??= {});
const unescape = (v: string) => v.replace(/\\n/g, '\n');
const refOf = (ref: string) => (ref === '' ? undefined : unescape(ref));
/** Runs a registry call: its error (any) is kept for the Then that expects a refusal. */
const attempt = (w: World, fn: () => void) => { cm(w).error = undefined; try { fn(); } catch (e) { cm(w).error = e as Error; } };


When('the marker of the kind {string} is stamped with the ref {string}', (w, kind: string, ref: string) => attempt(w, () => {
  const c = cm(w);
  c.kind = parseKind(kind); c.ref = refOf(ref);
  c.line = stamp(c.kind, c.ref, { specMarker: c.specMarker });
}));
When('the body {string} is stamped as the kind {string}', (w, body: string, kind: string) => attempt(w, () => { cm(w).body = stampBody(unescape(body), parseKind(kind)); }));

Then('the marker line is {string}', (w, line: string) => { assert.ok(!cm(w).error, String(cm(w).error)); assert.equal(cm(w).line, unescape(line)); });
Then('a comment opening with that line is of that kind, with the ref or without it', (w) => {
  const c = cm(w);
  assert.ok(isMarked(`${c.line}\nbody`, c.kind!, c.ref), 'not marked with the ref');
  assert.ok(isMarked(`${c.line}\nbody`, c.kind!), 'not marked without the ref');
});
Then('the registry holds exactly the kinds {string}', (w, list: string) => assert.deepEqual([...KINDS].sort(), list.split(',').map((k) => k.trim()).sort()));
Then('the stamped body is {string}', (w, body: string) => assert.equal(cm(w).body, unescape(body)));

// ---- the printed comments of a board or forge CLI run ----
Then('the printed comments open with {string}', (w, lines: string) =>
  assert.equal(w.last.json().map((c: { body: string }) => c.body.split('\n')[0]).join(', '), lines));

// ---- the template documents the default wait ----
Then('the shipped binding template sets {string} to {int}', (w, key: string, n: number) => {
  const tpl = parse(readFileSync(join(REPO, 'templates', 'binding.yml'), 'utf8'));
  assert.equal(key.split('.').reduce((o: any, k) => o?.[k], tpl), n); // eslint-disable-line @typescript-eslint/no-explicit-any
});

// ---- board hold with a kind a flag could not carry ----
When('the factory holds the ticket {string} with the kind {string} and the body file {string}', (w, id: string, kind: string, file: string) => {
  w.cli('board', 'hold', id, '--kind', unescape(kind), '--body-file', file);
});

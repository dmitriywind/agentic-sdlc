// The core vocabulary every area reuses. Keep it small, in domain words, and used.
import assert from 'node:assert/strict';
import { Given, Then } from '../support/steps.ts';
import type { World } from '../support/world.ts';

/** Sets a dotted key of the binding the scenario builds (CLI and gates read the same patch). */
const setKey = (w: World, key: string, value: unknown) => {
  const patch: Record<string, unknown> = {};
  let o = patch;
  const parts = key.split('.');
  parts.slice(0, -1).forEach((k) => { o = (o[k] = {}) as Record<string, unknown>; });
  o[parts.at(-1)!] = value;
  w.binding(patch);
};

// ---- Given: the binding ----
Given('the binding sets {string} to {string}', (w, key: string, value: string) => setKey(w, key, value));
Given('the binding sets {string} to the list {string}', (w, key: string, list: string) => setKey(w, key, list.split(',').map((x) => x.trim()).filter(Boolean)));
Given('the binding sets {string} to the account {string} on the board and {string} on the forge', (w, key: string, board: string, forge: string) => setKey(w, key, [{ board, forge }]));
Given('the binding has no {string}', (w, key: string) => setKey(w, key, undefined));

// ---- Then: the last process run (a CLI verb or a hook) ----
Then('the exit code is {int}', (w, code: number) => assert.equal(w.last.code, code, `exit code (stderr: ${w.last.stderr.trim()})`));
Then('the output says {string}', (w, text: string) => assert.ok(w.last.output.includes(text), `output lacks "${text}":\n${w.last.output}`));
Then('the output matches {string}', (w, re: string) => assert.match(w.last.output, new RegExp(re)));

// The binding as a value: a complete binding is built in memory, edited by dotted key, then validated or warned about.
// State on w.state: b (the binding), problems and warnings (from the last validation), selected (comment bodies).
import assert from 'node:assert/strict';
import { stringify } from 'yaml';
import { bindingWarnings, loadBinding, shippedOptions, validateBinding } from '../../src/binding.ts';
import { selectComments } from '../../src/comments.ts';
import { ownersFor, type Binding } from '../../src/ports.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import type { World } from '../support/world.ts';

const good = {
  version: 2, profile: 'individual', owners: { product: 'a', factory: 'b', bots: ['bot'] },
  board: { adapter: 'local', options: {}, statuses: ['Ideas', 'Signals', 'Backlog', 'Ready', 'In progress', 'In review', 'Done', 'Cancelled'] },
  forge: { adapter: 'github' }, vcs: { adapter: 'git', change_pattern: 'ticket/<ticket>', trunk: 'main', release_prefix: 'release/', factory_change_pattern: 'factory/<name>', tag_prefix: 'v' },
  models: { fast: 'f', balanced: 'b', deep: 'd' }, commands: {}, paths: { factory: ['.agents/**'] }, sizes: ['S', 'M'], ready_size_limit: 'M', fast_lane_max_size: 'S',
  priorities: [], p0_setters: [], max_subissue_depth: 1, spec_marker: 'spec.md', stall_minutes: 60, parallel_agents: 1,
  cycle: {}, heartbeat: { ticket: '1' }, learning: {}, product: { environments: ['staging', 'production'], proofs: ['test'] },
  executors: { default: { kind: 'harness' } },
};

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const binding = (w: World): Obj => (w.state.b ??= structuredClone(good));
const parent = (b: Obj, key: string) => {
  const parts = key.split('.');
  let o = b;
  for (const p of parts.slice(0, -1)) o = (o[p] ??= {});
  return { o, last: parts.at(-1)! };
};
const parse = (v: string) => { try { return JSON.parse(v); } catch { return v; } };
const joined = (xs: string[]) => xs.join('\n');

Given('a complete binding', (w) => { w.state.b = structuredClone(good); });
Given('the binding value {string} is {string}', (w, key: string, json: string) => { const { o, last } = parent(binding(w), key); o[last] = parse(json); });
Given('the binding has no value {string}', (w, key: string) => { const { o, last } = parent(binding(w), key); delete o[last]; });

When('the binding is validated', (w) => {
  const b = binding(w) as Binding;
  w.state.problems = validateBinding(b);
  w.state.warnings = bindingWarnings(b);
});
When('the project binding file is loaded and validated', (w) => {
  w.write('.agents/binding.yml', stringify(binding(w)));
  w.state.problems = validateBinding(loadBinding(w.root));
});

Then('validation finds no problems', (w) => assert.deepEqual(w.state.problems, []));
Then('the problems mention {string}', (w, text: string) => assert.ok(joined(w.state.problems).includes(text), `no problem mentions "${text}":\n${joined(w.state.problems)}`));
Then('the problems do not mention {string}', (w, text: string) => assert.ok(!joined(w.state.problems).includes(text), `a problem mentions "${text}":\n${joined(w.state.problems)}`));
Then('the warnings mention {string}', (w, text: string) => assert.ok(joined(w.state.warnings).includes(text), `no warning mentions "${text}":\n${joined(w.state.warnings)}`));
Then('the warnings do not mention {string}', (w, text: string) => assert.ok(!joined(w.state.warnings).includes(text), `a warning mentions "${text}":\n${joined(w.state.warnings)}`));
Then('there are no warnings', (w) => assert.deepEqual(w.state.warnings, []));
Then('the warnings are exactly:', (w, t: DataTable) => assert.deepEqual(w.state.warnings, t.raw().map((r) => r[0])));
Then('there is exactly one warning', (w) => assert.equal(w.state.warnings.length, 1, joined(w.state.warnings)));

// ---- the Shipped options ----
Then('the shipped options for the environments {string} are {string}', (w, envs: string, options: string) =>
  assert.deepEqual(shippedOptions(envs.split(',').map((e) => e.trim())), options.split(',').map((e) => e.trim())));

// ---- owners ----
Then('the owners read for the {word} as:', (w, side: 'board' | 'forge', t: DataTable) => {
  const got = ownersFor(binding(w).owners, side) as unknown as Record<string, string[]>;
  for (const r of t.hashes()) assert.deepEqual(got[r.role], r.names.split(',').map((s) => s.trim()).filter(Boolean), r.role);
});
When('comments by {string} are selected with --trusted', (w, authors: string) => {
  const comments = authors.split(',').map((a) => a.trim()).map((author) => ({ author, body: author }) as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  w.state.selected = selectComments(comments, { owners: ownersFor(binding(w).owners, 'forge'), trusted: true }).map((c) => c.body);
});
Then('the selected comments are by {string}', (w, authors: string) => assert.deepEqual(w.state.selected, authors.split(',').map((a) => a.trim())));

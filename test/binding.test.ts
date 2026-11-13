import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { bindingWarnings, loadBinding, shippedOptions, validateBinding } from '../src/binding.ts';
import type { Binding } from '../src/ports.ts';

const good = {
  version: 2, profile: 'individual', owners: { product: 'a', factory: 'b', bots: ['bot'] },
  board: { adapter: 'local', options: {}, statuses: ['Ideas', 'Signals', 'Backlog', 'Ready', 'In progress', 'In review', 'Done', 'Cancelled'] },
  forge: { adapter: 'github' }, vcs: { adapter: 'git', change_pattern: 'ticket/<ticket>', trunk: 'main', release_prefix: 'release/', factory_change_pattern: 'factory/<name>', tag_prefix: 'v' },
  models: { fast: 'f', balanced: 'b', deep: 'd' }, commands: {}, paths: { factory: ['.agents/**'] }, sizes: ['S', 'M'], ready_size_limit: 'M', fast_lane_max_size: 'S',
  priorities: [], p0_setters: [], max_subissue_depth: 1, spec_marker: 'spec.md', stall_minutes: 60, parallel_agents: 1,
  cycle: {}, heartbeat: {}, learning: {}, product: { environments: ['staging', 'production'], proofs: ['test'] },
  executors: { default: { kind: 'harness' } },
};

test('loadBinding reads yaml and a good binding has no problems', () => {
  const root = mkdtempSync(join(tmpdir(), 'b-'));
  mkdirSync(join(root, '.agents'));
  writeFileSync(join(root, '.agents', 'binding.yml'), stringify(good));
  assert.deepEqual(validateBinding(loadBinding(root)), []);
});

test('validateBinding reports each broken rule', () => {
  const bad = structuredClone(good) as any;
  bad.version = 1; bad.board.adapter = 'x'; bad.board.statuses = ['Ideas']; bad.ready_size_limit = 'XL';
  bad.models.deep = ''; bad.vcs.change_pattern = 'nope'; bad.product.environments = []; bad.product.proofs = ['vibes']; bad.executors.default.kind = 'magic';
  const p = validateBinding(bad as Binding).join('\n');
  for (const s of ['version must be 2', "board.adapter 'x'", "lacks 'Ready'", 'not in sizes', 'models.deep', '<ticket>', 'environments', 'vibes', 'magic']) assert.match(p, new RegExp(s));
});

test('validateBinding requires the factory owner and factory path globs', () => {
  const a = structuredClone(good) as any;
  a.paths.factory = [];
  assert.match(validateBinding(a as Binding).join('\n'), /paths\.factory must list/);
  const b = structuredClone(good) as any;
  delete b.owners.factory;
  assert.match(validateBinding(b as Binding).join('\n'), /owners\.factory must name/);
});

test('validateBinding rejects unknown option keys and missing required ones per adapter', () => {
  const b = structuredClone(good) as any;
  b.board = { ...b.board, adapter: 'jira', options: { base_url: 'u', project: 'P', email_env: 'E', token_env: 'T' } };
  b.forge = { adapter: 'gitlab', options: { project: 'g/p', host: 'h', token_env: 'T' } };
  b.vcs.options = { remote: 'origin' };
  const p = validateBinding(b as Binding).join('\n');
  for (const s of ['board.options.project_key is required', 'board.options.project is not read', 'forge.options.base_url is required', 'forge.options.host is not read', 'vcs.options.remote is not read']) assert.match(p, new RegExp(s));
  b.board.options = { base_url: 'u', project_key: 'P', email_env: 'E', token_env: 'T' };
  b.forge.options = { project: 'g/p', base_url: 'https://gl', token_env: 'T', review_token_env: 'R' };
  delete b.vcs.options;
  assert.deepEqual(validateBinding(b as Binding), []);
});

test('shippedOptions derives from environments', () => {
  assert.deepEqual(shippedOptions(good.product.environments), ['Not shipped', 'On staging', 'In release', 'On production']);
});

test('validateBinding checks executor stage fields, traces and computer-use', () => {
  const ok = structuredClone(good) as any;
  ok.mcps = { docs: { url: 'https://d' } }; ok.traces = { uri: 's3://b/{run_id}.jsonl' }; ok.product.proofs = ['computer-use'];
  ok.executors.review = { kind: 'harness', mcps: ['docs'], secrets: ['NPM_TOKEN'], sandbox: 'cloud', model: { tier: 'deep' } };
  ok.executors.shape = { kind: 'harness', model: { id: 'x' } };
  assert.deepEqual(validateBinding(ok), []);
  const bad = structuredClone(ok) as any;
  bad.traces.uri = 's3://b/x.jsonl';
  bad.executors.review = { kind: 'harness', mcps: ['nope'], secrets: ['lower', '1A'], sandbox: 'vm', model: { tier: 'deep', id: 'x' } };
  bad.executors.shape = { kind: 'harness', model: {} };
  const p = validateBinding(bad).join(' ');
  for (const s of ["mcps 'nope'", "secrets 'lower'", "secrets '1A'", "sandbox 'vm'", 'executors.review.model needs', 'executors.shape.model needs', 'traces.uri']) assert.ok(p.includes(s), s);
});

test('validateBinding requires each executor kind its keys; review_runtime only warns as unused', () => {
  const b = structuredClone(good) as any;
  b.executors = {
    default: { kind: 'harness' }, a: { kind: 'command' }, c: { kind: 'webhook' }, d: { kind: 'managed', api: 'openai' }, e: { kind: 'assign' },
  };
  const p = validateBinding(b).join('\n');
  for (const s of ['executors.a.run is required', 'executors.c.url_env is required', 'executors.d.token_env is required', "executors.d.api 'openai'", 'executors.e.user is required']) assert.ok(p.includes(s), s);
  b.executors = { default: { kind: 'harness' }, a: { kind: 'command', run: 'x' }, c: { kind: 'webhook', url_env: 'U' }, d: { kind: 'managed', api: 'cursor', token_env: 'T' }, e: { kind: 'assign', user: 'u' } };
  b.forge.review_runtime = 'same';
  assert.deepEqual(validateBinding(b), []);
  assert.match(bindingWarnings(b)[0], /^forge\.review_runtime is unused/);
});

test('bindingWarnings: bench_size below bench_min_cases can never pass bench compare', () => {
  assert.match(bindingWarnings({ ...good, learning: { bench_size: 10 } } as any).join('\n'), /bench_size 10 is below bench_min_cases 20/);
  assert.deepEqual(bindingWarnings({ ...good, learning: { bench_size: 5, bench_min_cases: 5 } } as any), []);
});

test('bindingWarnings accepts Windows trace paths with either slash', () => {
  for (const uri of ['C:\\traces\\{run_id}.jsonl', 'C:/traces/{run_id}.jsonl']) assert.deepEqual(bindingWarnings({ ...good, traces: { uri } } as any), []);
  assert.equal(bindingWarnings({ ...good, traces: { uri: 's3://b/{run_id}' } } as any).length, 1);
});

test('profile is required and must be known', () => {
  const b = structuredClone(good) as any;
  delete b.profile;
  assert.match(validateBinding(b).join(' '), /profile 'undefined'/);
  b.profile = 'team';
  assert.match(validateBinding(b).join(' '), /profile 'team'/);
});

test('bindingWarnings flags profile mismatches without failing validation', () => {
  const ind = structuredClone(good) as any;
  ind.executors.triage = { kind: 'managed', token_env: 'T' }; ind.traces = { uri: 's3://b/{run_id}.jsonl' }; ind.learning = { budget_usd_per_week: 5 };
  const w = bindingWarnings(ind).join('\n');
  for (const s of ['executors.triage', 'traces.uri', 'agent_command']) assert.match(w, new RegExp(s));
  assert.deepEqual(validateBinding(ind), []);
  const ent = structuredClone(good) as any;
  ent.profile = 'enterprise'; ent.forge.options = { token_env: 'T', review_token_env: 'T' };
  const e = bindingWarnings(ent).join('\n');
  for (const s of ['review_token_env', 'sandbox', 'traces is unset']) assert.match(e, new RegExp(s));
  ent.forge.options = { token_env: 'T', review_token_env: 'R' }; ent.executors.default.sandbox = 'container'; ent.traces = { uri: 'x/{run_id}' };
  assert.deepEqual(bindingWarnings(ent), []);
});

test('new keys validate; product.kind and board.milestone only warn as unused', () => {
  const b = structuredClone(good) as any;
  b.forge.human_approval = 'sometimes'; b.learning.bench_min_cases = 0; b.learning.bench_trials = 2.5; b.commands.proofs_on_base = 3;
  const p = validateBinding(b).join('\n');
  for (const s of ["forge.human_approval 'sometimes'", 'bench_min_cases must be', 'bench_trials must be', 'commands.proofs_on_base must be']) assert.match(p, new RegExp(s));
  const ok = structuredClone(good) as any;
  Object.assign(ok.forge, { human_approval: 'full-lane' });
  Object.assign(ok.learning, { bench_min_cases: 20, bench_trials: 3 });
  Object.assign(ok.commands, { preview: 'deploy {cr}', proofs_on_base: 'npx vitest run {files}' });
  ok.product.kind = 'web'; ok.board.milestone = 'required';
  assert.deepEqual(validateBinding(ok), []);
  assert.deepEqual(bindingWarnings(ok).filter((w) => w.includes('unused')), ['product.kind is unused; remove it', 'board.milestone is unused; remove it']);
});

test('v2 is Git only: hg, p4 and swarm adapters are rejected', () => {
  const b = structuredClone(good) as any;
  b.vcs.adapter = 'hg'; b.forge.adapter = 'swarm';
  const p = validateBinding(b).join('\n');
  assert.match(p, /vcs.adapter 'hg' is not one of git/);
  assert.match(p, /forge.adapter 'swarm' is not one of github\|gitlab\|azure\|bitbucket/);
});

test('validateBinding requires the vcs keys the gates and hook dereference', () => {
  const v = { trunk: 'main', release_prefix: 'release/', factory_change_pattern: 'factory/<name>', tag_prefix: 'v' };
  const run = (o: any) => validateBinding({ ...structuredClone(good), vcs: { ...good.vcs, ...v, ...o } } as any as Binding).join('|');
  assert.equal(run({}), '');
  assert.equal(run({ tag_prefix: '' }), '');
  assert.match(run({ trunk: undefined }), /vcs.trunk must name the trunk branch/);
  assert.match(run({ release_prefix: undefined }), /vcs.release_prefix/);
  assert.match(run({ factory_change_pattern: undefined }), /vcs.factory_change_pattern/);
  assert.match(run({ tag_prefix: undefined }), /vcs.tag_prefix/);
  assert.match(run({ release_prefix: 'release' }), /must end in/);
});

test('product.delivery: continuous needs no release prefix; release-line needs two environments', () => {
  const c = structuredClone(good) as any;
  c.product = { ...c.product, environments: ['production'], delivery: 'continuous' }; delete c.vcs.release_prefix;
  assert.deepEqual(validateBinding(c), []);
  const r = structuredClone(good) as any;
  r.product = { ...r.product, environments: ['production'], delivery: 'release-line' };
  assert.match(validateBinding(r).join('\n'), /release-line needs two or more environments/);
  r.product.delivery = 'weekly';
  assert.match(validateBinding(r).join('\n'), /product.delivery 'weekly'/);
});

test('product.evidence: known kinds only; evidence without commands.evidence_check warns', () => {
  const b = structuredClone(good) as any;
  b.product.evidence = ['sbom', 'vibes'];
  assert.match(validateBinding(b).join('\n'), /product.evidence has unknown kinds: vibes/);
  b.product.evidence = ['sbom', 'provenance'];
  assert.deepEqual(validateBinding(b), []);
  assert.match(bindingWarnings(b).join('\n'), /commands.evidence_check is unset/);
  b.commands.evidence_check = 'verify {sha}';
  assert.deepEqual(bindingWarnings(b).filter((w) => w.includes('evidence')), []);
});

test('bindingWarnings: a GitHub heartbeat ticket must be a number; env labels must name an environment; an empty release prefix fails', () => {
  const b = structuredClone(good) as any;
  b.board.adapter = 'github'; b.board.options = { owner: 'o', project_number: 1, repo: 'o/r' };
  b.heartbeat = { ticket: 'HEARTBEAT-1' }; b.board.env_labels = ['env:staging', 'env:qa'];
  const w = bindingWarnings(b).join('\n');
  assert.match(w, /heartbeat.ticket 'HEARTBEAT-1' is not an issue number/);
  assert.match(w, /env_labels 'env:qa' names no product.environments entry/);
  assert.doesNotMatch(w, /env:staging/);
  b.vcs.release_prefix = '';
  assert.match(validateBinding(b).join('\n'), /release_prefix must not be empty/);
});

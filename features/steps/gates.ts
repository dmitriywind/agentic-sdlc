// Gates run in-process against in-memory board, forge and VCS fakes (features/support/fakes.ts).
// A scenario's CRs are named by number; CR "n" has the head "h<n>" and the base "base". The approval scenarios use the one CR "1".
// State kept on w.state: gate (the last gate result), error (what the last gate threw), skill (the skill files of a classify scenario).
import assert from 'node:assert/strict';
import { approval, approvalWho, branchNames, linkage, merged, proofsOnBase, provenance, proofRunner, review as reviewGate, shipped, signal, signalOnRed, type Deps } from '../../src/gates.ts';
import { diffOf, baseBinding } from '../support/fakes.ts';
import { packFiles, writePack } from '../support/skillfix.ts';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import type { World } from '../support/world.ts';

const CR = '1';
const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

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
Given('a CR whose diff is:', (w, diff: string) => { w.gate.cr(CR); w.gate.diffs.set(CR, diff + '\n'); });
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

// ======== the other gates ========

/** Runs a gate against the scenario's fakes; keeps its result in `gate`, or what it threw in `error`. */
const run = async (w: World, fn: (d: Deps) => unknown) => {
  w.state.error = undefined;
  w.state.gate = undefined;
  try { w.state.gate = await fn(w.gateDeps()); } catch (e) { w.state.error = e as Error; }
};
const result = (w: World) => {
  assert.ok(!w.state.error, `the gate failed: ${w.state.error?.message}`);
  return w.state.gate;
};
const show = (v: unknown) => (v === undefined ? '<absent>' : Array.isArray(v) ? v.join(', ') : String(v));
const item = (w: World, id: string) => {
  const i = w.gate.items.find((x) => x.id === id);
  assert.ok(i, `no ticket ${id}`);
  return i;
};

// ---- Given: the board and the forge ----
Given('these tickets are on the board:', (w, t: DataTable) => {
  for (const r of t.hashes()) {
    const { id, status, labels, title, ...fields } = r;
    w.gate.ticket(id, status, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '')), list(labels ?? ''));
    if (title) w.gate.items.at(-1)!.title = title;
  }
});
Given('these CRs are on the forge:', (w, t: DataTable) => {
  for (const r of t.hashes()) {
    const c: Record<string, unknown> = {};
    if (r.source) c.source = r.source;
    if (r.closes !== undefined) c.closes = list(r.closes);
    if (r.author) c.author = r.author;
    if (r.merge) c.mergeSha = r.merge;
    if (r.target) c.target = r.target;
    if (r.state) c.state = r.state;
    if (r.head) c.headSha = r.head;
    w.gate.cr(r.cr, c);
    if (r.changes) w.gate.diffs.set(r.cr, diffOf(...list(r.changes)));
  }
});
Given('the CR {string} has the diff:', (w, n: string, diff: string) => { w.gate.diffs.set(n, diff + '\n'); });
Given('these runs are on the forge:', (w, t: DataTable) => {
  for (const r of t.hashes()) w.gate.runs.push({ id: r.id, name: r.name, ref: r.ref, sha: 's', state: r.state as 'failure', url: r.url ?? '', at: '' });
});

// ---- Given: the VCS ----
Given('every merge is an ancestor of the deployed revision', (w) => { w.gate.ancestry = { known: new Map(), others: true }; });
Given('the ancestry of the merges in the deployed revision is:', (w, t: DataTable) => {
  w.gate.ancestry = { known: new Map(t.hashes().map((r) => [r.merge, r.ancestor === 'yes' ? true : r.ancestor === 'no' ? false : undefined])), others: false };
});
Given('no merge is an ancestor of the deployed revision', (w) => { w.gate.ancestry = { known: new Map(), others: false }; });
Given('the tag {string} already exists', (w, name: string) => { w.gate.tags.push(name); });
Given('the push of the release tag is rejected', (w) => { w.gate.tagError = new Error('push rejected'); });
Given('the forge can search merged CRs by the ticket they close', (w) => { w.gate.searchByTicket = true; });
Given('the forge search index does not show the merge yet', (w) => { w.gate.indexTrails = true; });
Given('a deploy of a later environment sets Shipped of the ticket {string} to {string} while the gate runs', (w, id: string, value: string) => { w.gate.meanwhile.set(id, value); });

// ---- When ----
When('the branch-names gate checks {string}', (w, name: string) => { w.state.refused = branchNames(w.gateDeps().binding, [name]); });
When('the linkage gate runs for the CR {string}', (w, n: string) => run(w, (d) => linkage(d, n)));
When('the approval gate asks who may approve the CR {string}', (w, n: string) => run(w, async (d) => approvalWho(d, await d.forge.view(n))));
When('the proofs-on-base gate runs for the CR {string}', (w, n: string) => run(w, (d) => proofsOnBase(d, n)));
When('the review gate runs for the CR {string}', (w, n: string) => run(w, (d) => reviewGate(d, n)));
When('the provenance gate runs for the CR {string}', (w, n: string) => run(w, (d) => provenance(d, n)));
When('the merged gate runs for the sha {string}', (w, sha: string) => run(w, (d) => merged(d, sha)));
When('the shipped gate runs for {string} with the result {string} at the revision {string}', (w, env: string, res: string, sha: string) => run(w, (d) => shipped(d, env, sha, res)));
When('the shipped gate runs for {string} with the result {string} at the revision {string} and the version {string}', (w, env: string, res: string, sha: string, v: string) => run(w, (d) => shipped(d, env, sha, res, v)));
When('the signal-on-red gate runs for the run {string}', (w, id: string) => run(w, (d) => signalOnRed(d, id)));
When('the signal gate runs for the source {string} with the title {string} and the body {string}', (w, source: string, title: string, body: string) => run(w, (d) => signal(d, source, title, body)));
When('the proof runner runs a command that {string}', (w, how: string) => {
  const failure: Record<string, unknown> = {
    'exits 0': undefined,
    'exits 1': Object.assign(new Error('x'), { status: 1 }),
    'overflows the output buffer': Object.assign(new Error('big'), { code: 'ENOBUFS' }),
    'is killed by a signal': Object.assign(new Error('kill'), { status: null }),
  };
  assert.ok(how in failure, `unknown command: ${how}`);
  w.state.error = undefined;
  try { w.state.proof = proofRunner(() => { if (failure[how]) throw failure[how]; })('cmd') ? 'passing' : 'failing'; } catch (e) { w.state.error = e as Error; }
});

// ---- Then: the result of the last gate ----
Then('the gate passes', (w) => {
  const r = result(w);
  assert.ok(r.ok !== false, JSON.stringify(r));
});
Then('the gate fails with {string}', (w, text: string) => {
  const said = [w.state.error?.message, ...(w.state.gate?.errors ?? [])].filter(Boolean).join('\n');
  assert.ok(said.includes(text), `the gate said: ${said || '(nothing)'}`);
  if (w.state.gate) assert.equal(w.state.gate.ok, false);
});
Then('the gate result {string} is {string}', (w, key: string, value: string) => assert.equal(show(result(w)[key]), value, key));
Then('the gate result {string} lists {string}', (w, key: string, value: string) => assert.equal(show(result(w)[key]), value === 'nothing' ? '' : value, key));
Then('the gate result {string} mentions {string}', (w, key: string, text: string) => assert.ok(show(result(w)[key]).includes(text), `${key}: ${show(result(w)[key])}`));

// ---- Then: statuses ----
Then('these statuses were posted:', (w, t: DataTable) =>
  assert.deepEqual(w.gate.statuses.map((s) => ({ sha: s.sha, context: s.context, state: s.state })), t.hashes().map((r) => ({ sha: r.sha, context: r.context, state: r.state }))));
Then('the status is posted on the commit {string}', (w, sha: string) => assert.equal(w.gate.statuses.at(-1)?.sha, sha));
Then('the status is posted as {string}', (w, as: string) => assert.equal(w.gate.statuses.at(-1)?.as, as));

// ---- Then: the board ----
Then('the ticket {string} is at {string}', (w, id: string, status: string) => assert.equal(item(w, id).status, status));
Then('the ticket {string} has the labels {string}', (w, id: string, labels: string) => assert.deepEqual(item(w, id).labels, list(labels)));
Then('the ticket {string} has Shipped {string}', (w, id: string, v: string) => assert.equal(item(w, id).fields.shipped, v));
Then('the ticket {string} has Release Version {string}', (w, id: string, v: string) => assert.equal(item(w, id).fields.release_version, v));
Then('the ticket {string} has no Release Version', (w, id: string) => assert.equal(item(w, id).fields.release_version, undefined));
Then('the release tags are {string}', (w, tags: string) => assert.deepEqual(w.gate.tags, tags === 'none' ? [] : list(tags)));
Then('no Signal is opened', (w) => assert.deepEqual(w.gate.created, []));
Then('one Signal is opened with the labels {string}', (w, labels: string) => {
  assert.equal(w.gate.created.length, 1, JSON.stringify(w.gate.created));
  assert.deepEqual(w.gate.created[0].labels, list(labels));
});
Then('the Signal {string} is commented with {string}', (w, id: string, text: string) => { const c = w.gate.commented.filter((x) => x.id === id); assert.equal(c.length, 1, JSON.stringify(w.gate.commented)); assert.ok(c[0].body.includes(text), c[0].body); });
Then('the Signal body mentions {string}', (w, text: string) => assert.ok(w.gate.created.at(-1)?.body.includes(text), String(w.gate.created.at(-1)?.body)));
Then('the Signal body does not mention {string}', (w, text: string) => { assert.ok(w.gate.created.length, 'no Signal was opened'); assert.ok(!w.gate.created.at(-1)!.body.includes(text), w.gate.created.at(-1)!.body); });
Then('the forge was asked about the tickets {string} only', (w, ids: string) => { assert.deepEqual(w.gate.asked, list(ids)); assert.equal(w.gate.listed, 0); });

// ---- Then: branch-names and proofs ----
Then('the change line is allowed', (w) => assert.deepEqual(w.state.refused, []));
Then('the proof runner answers {string}', (w, answer: string) => {
  if (answer === 'not a test result') { assert.match(w.state.error?.message ?? '', /proof runner failed/); return; }
  assert.ok(!w.state.error, w.state.error?.message);
  assert.equal(w.state.proof, answer);
});
Given('the proofs {string} pass on the merge base', (w, files: string) => { for (const f of list(files)) w.gate.passingProofs.add(f); });

// ---- Given and Then: comments and commits ----
Given('{string} commented on the CR {string}:', (w, author: string, n: string, body: string) => {
  const list = w.gate.comments.get(n) ?? [];
  list.push({ id: String(list.length), author, createdAt: '', body, url: `u${list.length}` });
  w.gate.comments.set(n, list);
});
Given('these commits are on the CR {string}:', (w, n: string, t: DataTable) => {
  w.gate.commits.set(n, t.hashes().map((r) => ({
    sha: r.sha.repeat(40), message: r.message.replace(/\\n/g, '\n'), author: r.author, committer: r.committer || r.author,
    authorName: r.author, committerName: r.committer || r.author, parents: Number(r.parents || 1),
  })));
});
Then('the commits are classed as {string}', (w, by: string) => assert.equal(result(w).commits.map((c: { by: string }) => c.by).join(', '), by));
Then('the commit {string} names the run {string} and the model {string}', (w, sha: string, run: string, model: string) => {
  const c = result(w).commits.find((x: { sha: string }) => x.sha === sha.repeat(12));
  assert.deepEqual([c?.run, c?.model], [run, model]);
});
Then('the report names {int} problems', (w, n: number) => assert.equal(result(w).missing.length, n, result(w).missing.join('\n')));
Then('the report names no problem', (w) => assert.deepEqual(result(w).missing, []));

// ---- Given: the classify scenarios ----
Given('the skill {string} has a bench suite', (w, skill: string) => w.write('.agents/bench/suites/s.json', JSON.stringify({ name: 's', skill, cases: [{ id: '1' }] })));
Given('a CR that changes the binding file so that its head sets {string} to {string}', (w, key: string, value: string) => {
  w.gate.cr(CR);
  changes(w, '.agents/binding.yml');
  const b = baseBinding();
  w.gate.files.set(`base:.agents/binding.yml`, JSON.stringify(b));
  const [k, sub] = key.split('.');
  w.gate.files.set(`h${CR}:.agents/binding.yml`, JSON.stringify({ ...b, [k]: { ...(b[k] as object), [sub]: value } }));
});

type Skill = { base: string; head: string; text: boolean; extra: boolean; steps?: [string, string] };
const SKILL = '.agents/skills/a/SKILL.md';
const skillMd = (tier: string, body: string, extra: string) => `---\nname: a\ndescription: d\nmetadata:\n  tier: ${tier}\n${extra}---\n${body}`;
const stepsMd = (two: string) => `---\nname: a\ndescription: d\nmetadata:\n  steps:\n    one: { tier: fast }\n    two: { tier: ${two} }\n---\nrules\n`;
/** The skill "a" at the base and at the head of the CR, from what the scenario said about it so far. */
const writeSkill = (w: World, s: Skill) => {
  w.state.skill = s;
  if (s.steps) { w.gate.files.set(`base:${SKILL}`, stepsMd(s.steps[0])); w.gate.files.set(`h${CR}:${SKILL}`, stepsMd(s.steps[1])); return; }
  w.gate.files.set(`base:${SKILL}`, skillMd(s.base, 'rules\n', ''));
  w.gate.files.set(`h${CR}:${SKILL}`, skillMd(s.head, s.text ? 'other rules\n' : 'rules\n', s.extra ? 'license: x\n' : ''));
};
const skill = (w: World): Skill => w.state.skill ?? { base: 'fast', head: 'fast', text: false, extra: false };
Given('a CR that changes the skill {string}', (w, name: string) => { assert.equal(name, 'a'); w.gate.cr(CR); changes(w, SKILL); writeSkill(w, skill(w)); });
Given('the skill {string} has the tier {string} at the base and {string} at the head', (w, _n: string, base: string, head: string) => writeSkill(w, { ...skill(w), base, head }));
Given('the step {string} of the skill {string} has the tier {string} at the base and {string} at the head', (w, _step: string, _n: string, base: string, head: string) => writeSkill(w, { ...skill(w), steps: [base, head] }));
Given('the text of the skill {string} differs at the head', (w, _n: string) => writeSkill(w, { ...skill(w), text: true }));
Given('the frontmatter of the skill {string} has one more key at the head', (w, _n: string) => writeSkill(w, { ...skill(w), extra: true }));
Given('the CR deletes the skill {string}', (w, _n: string) => { w.gate.diffs.set(CR, (w.gate.diffs.get(CR) as string) + 'deleted file mode 100644\n'); });

// ---- Given: the installed skill pack (skill-regression) ----
Given('the project has the installed fixture skill pack', (w) => writePack(w.path('.agents', 'skills'), packFiles('sdlc-')));
Given('the installed skill file {string} is:', (w, file: string, text: string) => w.write(`.agents/skills/${file}`, text + '\n'));
Given('the scorer file {string} is:', (w, file: string, text: string) => w.write(`.agents/scorers/${file}`, text + '\n'));

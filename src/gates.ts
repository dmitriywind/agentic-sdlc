// Repo gates, run by CI. Mechanism only: every process value comes from the binding.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import type { AdapterContext, Binding, Board, CR, Forge, PortCli, Review, Vcs } from './ports.ts';
import { BINDING_PATH, shippedOptions } from './binding.ts';
import { PROOF_FILE, fill, rule, shell } from './bench.ts';
import { UsageError, guard, parseArgs } from './forge/util.ts';
import { createBoard } from './board/index.ts';
import { createForge } from './forge/index.ts';
import { createVcs } from './vcs/index.ts';

export interface Deps {
  binding: Binding;
  root: string;
  board: Board;
  forge: Forge;
  vcs: Vcs;
  /** File content at a commit; undefined when unavailable (factory CRs then class as guardrail). */
  fileAt?: (path: string, sha: string) => string | undefined;
  /** Runs a command line in the root; true when it exits 0. Only proofs-on-base runs commands. */
  run?: (cmd: string) => boolean;
  /** Is commit a an ancestor of b? undefined when the VCS cannot tell (shipped then includes nothing). */
  isAncestor?: (a: string, b: string) => boolean | undefined;
}

/** Glob to RegExp: `**` any depth, `*` within a segment, `?` one char. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
export const matchesAny = (path: string, globs: string[]) => globs.some((g) => globToRegExp(g).test(path));

const factoryGlobs = (b: Binding) => (b.paths.factory ?? []) as string[];
/** Old and new path of every file in a git diff; null when any header does not parse (quoted or ambiguous). */
export function diffPaths(diff: string): string[] | null {
  const out: string[] = [];
  for (const raw of diff.split('\n')) {
    if (!raw.startsWith('diff --git ')) continue;
    const rest = raw.slice('diff --git '.length).replace(/\r$/, '');
    // ponytail: git's C-quoted form ("a/...") is not decoded; such a CR fails closed to guardrail.
    if (rest.includes('"') || !rest.startsWith('a/')) return null;
    const cuts = [...rest.matchAll(/ b\//g)].map((m) => m.index!);
    const cut = cuts.length === 1 ? cuts[0] : cuts.find((i) => rest.slice(2, i) === rest.slice(i + 3));
    if (cut === undefined) return null;
    out.push(rest.slice(2, cut), rest.slice(cut + 3));
  }
  return out;
}

const TUNING_KEYS = ['models']; // cycle.*, stall_minutes, parallel_agents are guardrail: the bench cannot measure them
const SKILL_MD = /^\.agents\/skills\/([^/]+)\/SKILL\.md$/;
const TIERS = ['fast', 'balanced', 'deep'];

/** Frontmatter (parsed) and body of a markdown file; undefined when either is missing or not YAML. */
export function frontmatter(text: string): { fm: Record<string, any>; body: string } | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) return undefined;
  try {
    const fm = parse(m[1]);
    return fm && typeof fm === 'object' && !Array.isArray(fm) ? { fm, body: m[2].replace(/\r\n/g, '\n') } : undefined;
  } catch { return undefined; }
}

/**
 * Skills with a bench suite: `.agents/bench/suites/*.json` holding at least one case. A suite's
 * `skill` names its skill; absent, implement-spec (the skill the bench replays). Read from the root:
 * a CR that touches a suite is guardrail anyway, so the root's suites are the base's.
 */
export function benchedSkills(root: string): Set<string> {
  const dir = join(root, '.agents', 'bench', 'suites');
  const out = new Set<string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    try {
      const suite = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (Array.isArray(suite?.cases) && suite.cases.length) out.add(typeof suite.skill === 'string' ? suite.skill : 'implement-spec');
    } catch { /* an unreadable suite benches nothing */ }
  }
  return out;
}

const tierOf = (fm: Record<string, any>) => fm.metadata?.tier;
const withoutTier = (fm: Record<string, any>) => ({ ...fm, metadata: { ...fm.metadata, tier: undefined } });

/** product | tuning | guardrail. Anything not provably tuning under paths.factory is guardrail. */
export async function classify(d: Deps, cr: CR, diff: string | undefined): Promise<'product' | 'tuning' | 'guardrail'> {
  if (diff === undefined) return 'guardrail'; // an unreadable diff, e.g. too large for the forge, fails closed to owner approval
  const paths = diffPaths(diff);
  if (!paths) return 'guardrail'; // an unparsed header may hide a factory path
  const inFactory = paths.filter((p) => matchesAny(p, factoryGlobs(d.binding)));
  if (!inFactory.length) return 'product';
  if (inFactory.length < paths.length) return 'guardrail'; // a product CR that also changes the factory
  if (/^deleted file mode/m.test(diff)) return 'guardrail'; // deleting a skill deletes rules
  const at = (p: string, sha: string) => d.fileAt?.(p, sha);
  let benched: Set<string> | undefined;
  for (const p of new Set(paths)) {
    const skill = SKILL_MD.exec(p)?.[1];
    if (skill) {
      // Tuning only when the one change is metadata.tier and the skill has a bench suite to measure it.
      const [b, h] = [at(p, cr.baseSha), at(p, cr.headSha)].map((t) => (t === undefined ? undefined : frontmatter(t)));
      if (!b || !h || b.body !== h.body || !TIERS.includes(tierOf(h.fm)) || tierOf(b.fm) === tierOf(h.fm)) return 'guardrail';
      if (!isDeepStrictEqual(withoutTier(b.fm), withoutTier(h.fm))) return 'guardrail';
      if (!(benched ??= benchedSkills(d.root)).has(skill)) return 'guardrail';
      continue;
    }
    if (p !== BINDING_PATH) return 'guardrail';
    let base: Record<string, unknown>, head: Record<string, unknown>;
    try {
      base = parse(at(p, cr.baseSha) ?? '') as Record<string, unknown>;
      head = parse(at(p, cr.headSha) ?? '') as Record<string, unknown>;
    } catch { return 'guardrail'; }
    if (!base || typeof base !== 'object' || !head || typeof head !== 'object') return 'guardrail';
    const keys = new Set([...Object.keys(base), ...Object.keys(head)]);
    if ([...keys].some((k) => !TUNING_KEYS.includes(k) && !isDeepStrictEqual(base[k], head[k]))) return 'guardrail';
  }
  return 'tuning';
}
const nameHas = (s: string, id: string) => new RegExp(`(^|[^A-Za-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(s);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRe = (p: string) =>
  new RegExp('^' + p.split(/(<ticket>|<name>)/).map((x) => x === '<ticket>' ? '[A-Za-z0-9_-]+' : x === '<name>' ? '[a-z0-9]+(?:-[a-z0-9]+)*' : esc(x)).join('') + '$');

export function branchNames(b: Binding, names: string[]): string[] {
  const v = b.vcs;
  const ok = (n: string) =>
    n === v.trunk || n.startsWith(v.release_prefix) || n.startsWith('dependabot/') || n.startsWith('renovate/') ||
    patternRe(v.change_pattern).test(n) || patternRe(v.factory_change_pattern).test(n);
  return names.filter((n) => !ok(n));
}

const readDiff = (d: Deps, n: string) => d.forge.diff(n).catch(() => undefined);

/** Wraps a command runner: a real non-zero exit is false; a spawn error, overflow or signal kill is not a test result and throws. */
export function proofRunner(run: (cmd: string) => unknown): (cmd: string) => boolean {
  return (cmd) => {
    try { run(cmd); return true; } catch (e) {
      if (typeof (e as { status?: unknown }).status === 'number') return false;
      throw new Error(`proof runner failed (not a test result): ${(e as Error).message}`);
    }
  };
}

/** Posts status ticket-linkage with the CI job's own token; a forge that refuses leaves the job result as the check. */
async function post(d: Deps, sha: string, description: string, ok: boolean) {
  try { await d.forge.status(sha, { context: 'ticket-linkage', state: ok ? 'success' : 'failure', description: description.slice(0, 140) }, { as: 'ci' }); }
  catch (e) { if (d.binding.forge.adapter === 'github') throw e; /* elsewhere the job result is the check */ }
}

/** Change lines of dependency bots: product changes with no ticket, reviewed like any CR. */
const DEPENDENCY_LINES = /^(dependabot|renovate)\//;
const DEPENDENCY_BOTS = /^(app\/)?(dependabot|renovate)(\[bot\])?$/i;

export async function linkage(d: Deps, n: string) {
  const cr = await d.forge.view(n);
  const diff = await readDiff(d, n);
  const cls = await classify(d, cr, diff);
  // Only an all-factory CR skips linkage; a mixed or unparsed one still closes a ticket.
  const paths = diff === undefined ? null : diffPaths(diff);
  if (cls !== 'product' && paths?.every((p) => matchesAny(p, factoryGlobs(d.binding)))) { await post(d, cr.headSha, 'factory change: no ticket', true); return { ok: true, factory: true, class: cls, errors: [] as string[] }; }
  if (DEPENDENCY_LINES.test(cr.source) && DEPENDENCY_BOTS.test(cr.author ?? '') && !cr.closes.length) { await post(d, cr.headSha, 'dependency update: no ticket', true); return { ok: true, factory: false, dependency: true, class: cls, errors: [] as string[] }; }
  const errors: string[] = [];
  if (cr.closes.length !== 1) errors.push(`CR ${n} must close exactly one ticket, found ${cr.closes.length}`);
  else {
    const id = cr.closes[0];
    const item = await d.board.get(id).catch(() => undefined);
    if (!item) errors.push(`ticket ${id} is not on the board`);
    else if (d.binding.board.done_statuses.includes(item.status)) errors.push(`ticket ${id} is not open (${item.status})`);
    if (!nameHas(cr.source, id)) errors.push(`source change line "${cr.source}" does not name ${id}`);
  }
  await post(d, cr.headSha, errors.length ? errors[0] : 'closes one open ticket', !errors.length);
  return { ok: !errors.length, factory: false, class: cls, errors };
}

export type ApprovalClass = 'product-fast' | 'product-full' | 'tuning' | 'guardrail';

/** Users (lower case) whose latest decisive review (approved, changes requested, dismissed) approves `sha`. */
export function approvers(reviews: Review[], sha: string): string[] {
  const last = new Map<string, Review>();
  for (const r of reviews) if (r.state !== 'commented' && r.state !== 'pending') last.set(r.user.toLowerCase(), r);
  return [...last].filter(([, r]) => r.state === 'approved' && r.sha === sha).map(([u]) => u);
}

/**
 * Status `human-approval`. product-fast passes; product-full needs a human approval on the head
 * (forge.human_approval full-lane or always; always holds product-fast too; never passes both);
 * tuning passes when auto-mergeable, else waits for owners.factory like guardrail. A human is
 * anyone outside owners.bots and forge.review_identity. The lane is the closing ticket's Lane
 * field; anything but Fast (unset, unreadable, several tickets) counts as Full.
 */
export async function approval(d: Deps, n: string) {
  const b = d.binding;
  const cr = await d.forge.view(n);
  const diff = await readDiff(d, n);
  const cls = await classify(d, cr, diff);
  let klass: ApprovalClass;
  if (cls !== 'product') klass = cls;
  else {
    const item = cr.closes.length === 1 ? await d.board.get(cr.closes[0]).catch(() => undefined) : undefined;
    // The Lane field is agent-written: a path in paths.lane_areas forces Full whatever it says.
    const areas = [b.paths.lane_areas ?? []].flat();
    const inArea = areas.length > 0 && (diff === undefined ? [] : diffPaths(diff) ?? []).some((p) => matchesAny(p, areas));
    klass = !inArea && String(item?.fields?.lane ?? '').toLowerCase() === 'fast' ? 'product-fast' : 'product-full';
  }
  const mode = b.forge.human_approval ?? 'full-lane';
  const bots = [...(b.owners?.bots ?? []), b.forge.review_identity].filter(Boolean).map((u) => u.toLowerCase());
  const owner = String(b.owners?.factory ?? '').toLowerCase();
  let need: 'none' | 'human' | 'owner';
  if (klass === 'guardrail') need = 'owner';
  else if (klass === 'tuning') need = (b.learning?.auto_merge_classes ?? []).includes('tuning') ? 'none' : 'owner';
  else need = mode === 'always' || (mode === 'full-lane' && klass === 'product-full') ? 'human' : 'none';
  let by: string | undefined;
  if (need !== 'none') {
    const ok = approvers(await d.forge.approvals(n), cr.headSha);
    by = need === 'owner' ? ok.find((u) => !!owner && u === owner) : ok.find((u) => !bots.includes(u));
  }
  const pass = need === 'none' || !!by;
  const description = need === 'none' ? `${klass}: no human approval needed`
    : pass ? `${klass}: approved by ${by}`
    : `${klass}: waits for an approval of the head by ${need === 'owner' ? 'owners.factory' : 'a human'}`;
  await d.forge.status(cr.headSha, { context: 'human-approval', state: pass ? 'success' : 'pending', description });
  return { cr: cr.n, class: klass, need, state: pass ? 'success' : 'pending', ...(by ? { by } : {}) };
}

/** True when every changed path matches paths.no_proof (docs, config): such a product CR needs no proof file. */
function onlyNoProof(b: Binding, diff: string | undefined): boolean {
  const globs = [b.paths?.no_proof ?? []].flat();
  const paths = diff === undefined ? undefined : diffPaths(diff);
  return globs.length > 0 && !!paths?.length && paths.every((p) => matchesAny(p, globs));
}

/** New or changed (not deleted) paths of a git diff that match the proof rule. */
export function proofFiles(diff: string, isProof: RegExp): string[] {
  const out: string[] = [];
  for (const block of diff.split(/^(?=diff --git )/m)) {
    if (!block.startsWith('diff --git ') || /^deleted file mode/m.test(block)) continue;
    const path = diffPaths(block.split('\n')[0])?.[1];
    if (path && isProof.test(path) && !out.includes(path)) out.push(path);
  }
  return out;
}

/**
 * Status `proofs-on-base`: product code at the merge base with the CR's new or changed proof files
 * kept, each file run alone with `commands.proofs_on_base` ({files}); success when every one fails.
 * Meant for the no-secrets CI job, after install. The tree is reset to HEAD afterwards.
 */
export async function proofsOnBase(d: Deps, n: string) {
  const cr = await d.forge.view(n);
  const diff = await readDiff(d, n);
  const cls = await classify(d, cr, diff);
  const tpl = d.binding.commands?.proofs_on_base;
  const files = cls === 'product' && diff !== undefined ? proofFiles(diff, rule(d.binding, 'proof_pattern', PROOF_FILE)) : [];
  const passedOnBase: string[] = [];
  let error: string | undefined;
  const noProof = cls === 'product' && !files.length && onlyNoProof(d.binding, diff);
  if (cls !== 'product' || noProof) error = undefined;
  else if (!tpl) error = 'commands.proofs_on_base is not set';
  else if (!files.length) error = 'no new or changed proof file';
  else if (!d.run) error = 'no command runner';
  else {
    const head = await d.vcs.head();
    const base = (await d.vcs.base()).sha;
    try {
      await d.vcs.checkoutTests(base, files);
      for (const f of files) if (d.run(fill(tpl, { files: f }))) passedOnBase.push(f);
    } finally {
      await d.vcs.checkoutTests(head.sha, []);
    }
    if (passedOnBase.length) error = `passes on the merge base: ${passedOnBase.join(', ')}`;
  }
  const description = cls !== 'product' ? `${cls}: no product proof` : noProof ? 'only paths.no_proof changed: no proof needed' : error ?? `${files.length} proof file(s) fail on the merge base`;
  let posted = true;
  // The job holds no secrets by design; when it cannot post, its own check (exit code) carries the result.
  try { await d.forge.status(cr.headSha, { context: 'proofs-on-base', state: error ? 'failure' : 'success', description: description.slice(0, 140) }, { as: 'ci' }); }
  catch { posted = false; }
  return { ok: !error, cr: cr.n, class: cls, files, passedOnBase, posted, errors: error ? [error] : [] };
}

/**
 * A push to the trunk: the CR merged at that sha moves its one ticket to Done (Shipped Not shipped when
 * empty). Done records a fact, so a held ticket moves too and keeps its label; a Cancelled ticket stays.
 * A push with no CR (a direct push) changes nothing.
 */
export async function merged(d: Deps, sha: string): Promise<{ cr?: string; sha: string; moved: string[]; reason?: string }> {
  const b = d.binding.board;
  const opts = shippedOptions(d.binding.product.environments, d.binding.product.delivery);
  const cr = await d.forge.viewBySha(sha).catch((e: Error) => { if (/no change request for/.test(e.message)) return undefined; throw e; });
  const none = (reason: string) => ({ cr: cr?.n, sha, moved: [] as string[], reason });
  if (!cr?.n) return none('no CR merged at this sha');
  if (cr.target !== d.binding.vcs.trunk) return none(`target ${cr.target} is not trunk ${d.binding.vcs.trunk}`);
  if (cr.closes.length !== 1) return none(`CR closes ${cr.closes.length} tickets, not exactly one`);
  const id = cr.closes[0];
  const it = await d.board.get(id);
  if (it.status === 'Cancelled') return none(`${id} is Cancelled`);
  if (!b.done_statuses.includes(it.status)) {
    try { await d.board.move(id, 'Done', it.status); }
    catch (e) { if (!b.done_statuses.includes((await d.board.get(id)).status)) throw e; } // shipped moved it first
  }
  if (!(await d.board.get(id)).fields?.shipped) await d.board.set(id, 'shipped', opts[0]);
  return { cr: cr.n, sha, moved: [id] };
}

/**
 * A deploy result for one environment. success: tickets whose merges are in `sha` get On <env>; with
 * `version`, tickets without a Release Version get it (continuous delivery, a store build, a package,
 * a model). rolled-back: tickets On <env> or later whose merges are not in `sha` (the revision now
 * running) step back one environment and keep their version. failure: a Signal, and in the last
 * environment the version in flight is reset.
 */
/** Merge shas of the merged CRs that close each ticket; per ticket when the forge can search, else one list. */
async function mergeShas(d: Deps, ids: string[]): Promise<Map<string, (string | undefined)[]>> {
  const out = new Map<string, (string | undefined)[]>();
  if (d.forge.closing) { for (const id of ids) out.set(id, (await d.forge.closing(id)).map((c) => c.mergeSha)); return out; }
  const merged = ids.length ? await d.forge.list({ state: 'merged' }) : [];
  for (const id of ids) out.set(id, merged.filter((c) => c.closes.includes(id)).map((c) => c.mergeSha));
  return out;
}

export async function shipped(d: Deps, env: string, sha: string, result: string, version?: string) {
  const envs = d.binding.product.environments;
  const i = envs.indexOf(env);
  if (i < 0) throw new UsageError(`unknown environment ${env}; one of ${envs.join(', ')}`);
  if (!['success', 'failure', 'rolled-back'].includes(result)) throw new UsageError('--result must be success|failure|rolled-back');
  const opts = shippedOptions(envs, d.binding.product.delivery);
  const rank = (s?: string) => opts.indexOf(s || opts[0]);
  const target = `On ${env}`;
  const last = i === envs.length - 1;
  // A merged ticket the merge gate has not reached yet is still In review; it ships and moves to Done here.
  const done = (await d.board.list({ status: ['Done', 'In review'] })).filter((x) => x.status === 'Done' || x.status === 'In review');
  const changed: string[] = [];
  const signal = async (held: boolean) => {
    const title = `Deploy to ${env} failed at ${sha.slice(0, 12)}`;
    // A re-run of the same failed deploy opens no second Signal.
    if ((await d.board.list({ label: 'signal:deploy' })).some((x) => x.title === title && !d.binding.board.done_statuses.includes(x.status))) return false;
    const envLabel = (d.binding.board.env_labels ?? []).find((l) => l === `env:${env}`);
    await d.board.create({
      title,
      body: `Deploy to ${env} failed.\nsha: ${sha}\nenvironment: ${env}`,
      status: 'Signals',
      labels: ['signal:deploy', ...(envLabel ? [envLabel] : []), ...(held ? [d.binding.board.labels.human] : [])],
    });
    return true;
  };
  if (result === 'success') {
    // A ticket shipped here only when every merged CR closing it is an ancestor of the deployed sha.
    const isAnc = d.isAncestor;
    if (!isAnc) return { env, result, changed, tags: [], unknown: true };
    const unmatched: string[] = [];
    const unknown: string[] = [];
    const rel = d.binding.board.labels?.release;
    const items = [];
    const todo = done.filter((x) => rank(x.fields.shipped) < rank(target));
    const byId = await mergeShas(d, todo.map((x) => x.id));
    for (const x of todo) {
      const shas = byId.get(x.id) ?? [];
      if (!shas.length) { if (x.status === 'Done' && !(rel && x.labels.includes(rel))) unmatched.push(x.id); continue; }
      const anc = shas.map((s) => (s ? isAnc(s, sha) : undefined));
      if (anc.includes(undefined)) { unknown.push(x.id); continue; } // that ticket waits; the others ship
      if (anc.every(Boolean)) items.push(x);
    }
    // --version is the artifact now running: it replaces an older version (a rolled-back one, a resubmitted build).
    if (version) for (const x of items) if (x.fields.release_version !== version) { await d.board.set(x.id, 'release_version', version); x.fields.release_version = version; }
    // Tags first: a tag failure throws before the board changes, so a re-run retries; an existing tag is kept.
    const tags: string[] = [];
    if (last) {
      const prefix = d.binding.vcs.tag_prefix;
      const have = new Set((await d.vcs.tags(prefix)).map((t) => t.name));
      for (const v of new Set(items.map((x) => x.fields.release_version).filter((v): v is string => !!v))) {
        if (!have.has(`${prefix}${v}`)) await d.vcs.tag(`${prefix}${v}`, sha);
        tags.push(`${prefix}${v}`);
      }
    }
    for (const x of items) {
      // Read again: a later environment's deploy may have written a newer value meanwhile; never lower it.
      const now = await d.board.get(x.id);
      if (rank(now.fields.shipped) >= rank(target)) continue;
      if (!d.binding.board.done_statuses.includes(now.status)) await d.board.move(x.id, 'Done', now.status);
      await d.board.set(x.id, 'shipped', target);
      changed.push(x.id);
    }
    return { env, result, changed, tags, unmatched, ...(unknown.length ? { unknown } : {}) };
  }
  if (result === 'rolled-back') {
    const back = i > 0 ? `On ${envs[i - 1]}` : opts[0];
    const isAnc = d.isAncestor;
    if (!isAnc) return { env, result, changed, unknown: true };
    // Only tickets on this environment (or In release, before the last); a ticket further on is not here any more.
    const next = i + 1 < envs.length ? rank(`On ${envs[i + 1]}`) : Infinity;
    const back_ = done.filter((x) => x.status === 'Done' && rank(x.fields.shipped) >= rank(target) && rank(x.fields.shipped) < next);
    const byId = await mergeShas(d, back_.map((x) => x.id));
    for (const x of back_) {
      const shas = byId.get(x.id) ?? [];
      const anc = shas.map((s) => (s ? isAnc(s, sha) : undefined));
      if (!shas.length || anc.includes(undefined) || anc.every(Boolean)) continue;
      await d.board.set(x.id, 'shipped', back);
      changed.push(x.id);
    }
    return { env, result, changed };
  }
  if (last) {
    const back = i > 0 ? `On ${envs[i - 1]}` : opts[0];
    // Reset only tickets whose every merged CR is in the failed deploy; a newer release line stays.
    const isAnc = d.isAncestor;
    if (isAnc) {
      // The release skill sets In release at the cut; key on the version so a deploy that fails first still resets.
      const cut = done.filter((x) => x.status === 'Done' && x.fields.release_version && rank(x.fields.shipped) < rank(target));
      const byId = await mergeShas(d, cut.map((x) => x.id));
      for (const x of cut) {
        const shas = byId.get(x.id) ?? [];
        if (!shas.length || shas.some((s) => !s || isAnc(s, sha) !== true)) continue;
        await d.board.set(x.id, 'shipped', back);
        await d.board.set(x.id, 'release_version', null);
        changed.push(x.id);
      }
    }
  }
  const opened = await signal(last);
  return { env, result, changed, signal: opened };
}

const redact = (s: string, max = 120) =>
  String(s ?? '').replace(/[\x00-\x1f]/g, ' ').replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, '[redacted]').slice(0, max);
const cleanUrl = (u: string) => redact(String(u ?? '').replace(/^(\w+:\/\/)[^/@]*@/, '$1').replace(/[?#].*$/, ''), 200);

export async function signalOnRed(d: Deps, id: string) {
  const runs = [...(await d.forge.runs({ failed: true })), ...(await d.forge.runs({}))];
  const run = runs.find((r) => String(r.id) === id);
  if (!run) return { created: false, reason: `run ${redact(id, 40)} not in the recent runs` };
  const v = d.binding.vcs;
  if (run.ref !== v.trunk && !run.ref.startsWith(v.release_prefix)) return { created: false, reason: `ref ${redact(run.ref, 100)} is not trunk or a release line` };
  const title = redact(`CI red: ${run.name} @ ${run.ref} (run ${run.id})`, 1000).replace(/[^A-Za-z0-9 ._/:@()-]/g, '').slice(0, 100);
  const existing = await d.board.list({ label: 'signal:ci' });
  if (existing.some((x) => x.title === title)) return { created: false };
  const item = await d.board.create({
    title,
    body: `run: ${redact(run.name)}\nref: ${redact(run.ref)}\nsha: ${redact(run.sha, 40)}\nurl: ${cleanUrl(run.url)}`,
    status: 'Signals',
    labels: ['signal:ci'],
  });
  return { created: true, id: item.id };
}

/** Skill frontmatter (name, description, metadata.tier), relative links, scorer frontmatter. A top-level tier still passes, with a warning. */
export function skillRegression(root: string): { errors: string[]; warnings: string[] } {
  const dir = join(root, '.agents', 'skills');
  if (!existsSync(dir)) return { errors: [`${dir} does not exist`], warnings: [] };
  const errors: string[] = [], warnings: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = join(dir, e.name, 'SKILL.md');
    if (!existsSync(file)) { errors.push(`${e.name}: SKILL.md missing`); continue; }
    const text = readFileSync(file, 'utf8');
    const fm = frontmatter(text)?.fm;
    if (!fm) { errors.push(`${e.name}: no frontmatter`); continue; }
    for (const k of ['name', 'description']) if (typeof fm[k] !== 'string' || !fm[k].trim()) errors.push(`${e.name}: frontmatter ${k} missing`);
    let tier = fm.metadata?.tier;
    if (tier === undefined && fm.tier !== undefined) { tier = fm.tier; warnings.push(`${e.name}: top-level tier is deprecated; move it to metadata.tier`); }
    if (tier === undefined) errors.push(`${e.name}: frontmatter metadata.tier missing`);
    else if (!TIERS.includes(tier)) errors.push(`${e.name}: tier ${tier} invalid`);
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = m[1].split('#')[0];
      if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
      if (!existsSync(resolve(dirname(file), link))) errors.push(`${e.name}: broken link ${m[1]}`);
    }
  }
  const sdir = join(root, '.agents', 'scorers');
  if (existsSync(sdir)) for (const f of readdirSync(sdir).filter((n) => n.endsWith('.md'))) errors.push(...scorerErrors(f, readFileSync(join(sdir, f), 'utf8')));
  return { errors, warnings };
}

/** A scorer file's frontmatter: name, applies_to (list or "*"), scale. */
function scorerErrors(f: string, text: string): string[] {
  let fm: any;
  try { fm = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''); } catch { return [`scorers/${f}: frontmatter is not YAML`]; }
  if (!fm || typeof fm !== 'object') return [`scorers/${f}: no frontmatter`];
  const errors: string[] = [];
  if (typeof fm.name !== 'string' || !fm.name) errors.push(`scorers/${f}: frontmatter name missing`);
  const at = fm.applies_to;
  if (at !== '*' && !(Array.isArray(at) && at.length && at.every((s: unknown) => typeof s === 'string' && s))) errors.push(`scorers/${f}: applies_to must be "*" or a list of skills`);
  if (!['pass-fail', '0-4'].includes(fm.scale)) errors.push(`scorers/${f}: scale ${fm.scale} invalid`);
  return errors;
}

export const cli: PortCli = (argv, base) =>
  guard(async () => {
    const [gate, ...rest] = argv;
    const a = parseArgs(rest, ['stdin-prepush']);
    const ctxOf = (options: Record<string, unknown>): AdapterContext => ({ ...base, options });
    const deps = (): Deps => {
      const b = base.binding;
      const d: Deps = {
        binding: b, root: base.root,
        board: createBoard(ctxOf(b.board.options)), forge: createForge(ctxOf(b.forge.options)), vcs: createVcs(ctxOf(b.vcs.options ?? {})),
      };
      const git = (args: string[]) => base.exec('git', args, { cwd: base.root });
      d.run = proofRunner((cmd) => shell(base.exec, cmd, base.root));
      d.fileAt = (path, sha) => { try { return git(['show', `${sha}:${path}`]); } catch { return undefined; } };
      d.isAncestor = (x, y) => {
        try { git(['merge-base', '--is-ancestor', x, y]); return true; } catch (e) { return (e as { status?: number }).status === 1 ? false : undefined; }
      };
      return d;
    };
    const fail = (r: { ok?: boolean; errors?: string[] }) => {
      if (r.errors?.length) throw new Error(r.errors.join('\n'));
      return r;
    };
    switch (gate) {
      case 'branch-names': {
        let names: string[];
        if (a.has('stdin-prepush')) {
          names = readFileSync(0, 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 4 && !/^0+$/.test(p[1]) && p[2].startsWith('refs/heads/')).map((p) => p[2].slice('refs/heads/'.length));
        } else names = [a.get('ref') ?? (await deps().vcs.head()).ref];
        const bad = branchNames(base.binding, names);
        if (bad.length) throw new Error(`branch name not allowed: ${bad.join(', ')}`);
        return { ok: true, names };
      }
      case 'linkage': return fail(await linkage(deps(), a.need('cr')));
      case 'merged': return merged(deps(), a.need('sha'));
      case 'shipped': {
        if (!a.pos[0]) throw new UsageError('shipped <env> is required');
        return shipped(deps(), a.pos[0], a.need('sha'), a.need('result'), a.get('version'));
      }
      case 'approval': {
        const r = await approval(deps(), a.need('cr'));
        if (a.has('fail-pending') && r.state === 'pending') throw new Error(`human-approval pending: ${r.class} needs ${r.need}`);
        return r;
      }
      case 'proofs-on-base': return fail(await proofsOnBase(deps(), a.need('cr')));
      case 'evidence': {
        const sha = a.need('sha');
        const kinds = base.binding.product.evidence ?? [];
        if (!kinds.length) return { ok: true, kinds, reason: 'product.evidence is empty' };
        const cmd = base.binding.commands?.evidence_check;
        if (!cmd) throw new Error('product.evidence is set but commands.evidence_check is unset');
        shell(base.exec, cmd.replaceAll('{sha}', sha), base.root);
        return { ok: true, kinds, sha };
      }
      case 'signal-on-red': return signalOnRed(deps(), a.need('run'));
      case 'skill-regression': {
        const { errors, warnings } = skillRegression(base.root);
        for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
        if (errors.length) throw new Error(errors.join('\n'));
        return { ok: true, warnings };
      }
      default: throw new UsageError(`unknown gate: ${gate ?? ''}`);
    }
  });

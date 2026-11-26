// Repo gates, run by CI. Mechanism only: every process value comes from the binding.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import type { AdapterContext, Binding, Board, CR, CrCommit, Forge, PortCli, Review, Vcs } from './ports.ts';
import { isChangeLine, ownersFor } from './ports.ts';
import { BINDING_PATH, shippedOptions } from './binding.ts';
import { PROOF_FILE, fill, rule, shell } from './bench.ts';
import { UsageError, guard, parseArgs } from './forge/util.ts';
import { createBoard, VERBS as BOARD_VERBS } from './board/index.ts';
import { createForge, VERBS as FORGE_VERBS } from './forge/index.ts';
import { createVcs, VERBS as VCS_VERBS } from './vcs/index.ts';
import { GROUPS } from './cli.ts';
import { matches, selectComments, verdictOf } from './comments.ts';
import { forbiddenHits, frontmatter, logicalName, readSkills, scorerTargets, skillOf, TIER_NAMES } from './skills.ts';
import { BENCH_STEP, OPTIONS as BENCH_OPTIONS } from './bench.ts';
import { OPTIONS as LEDGER_OPTIONS } from './ledger.ts';
import { FLAGS as DISPATCH_FLAGS } from './dispatch.ts';

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
const TIERS = TIER_NAMES;

export { frontmatter };

/**
 * Skills with a bench suite: `.agents/bench/suites/*.json` holding at least one case. A suite's
 * `skill` names a step id or a skill; absent, the step the bench replays. Read from the root:
 * a CR that touches a suite is guardrail anyway, so the root's suites are the base's.
 */
export function benchedSkills(root: string): Set<string> {
  const dir = join(root, '.agents', 'bench', 'suites');
  const out = new Set<string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    try {
      const suite = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (Array.isArray(suite?.cases) && suite.cases.length) out.add(skillOf(typeof suite.skill === 'string' ? suite.skill : BENCH_STEP));
    } catch { /* an unreadable suite benches nothing */ }
  }
  return out;
}

/** Every tier a skill's frontmatter sets: metadata.tier, and metadata.steps.<step>.tier. */
const tiersOf = (fm: Record<string, any>) => ({ tier: fm.metadata?.tier, steps: Object.fromEntries(Object.entries<any>(fm.metadata?.steps ?? {}).map(([k, v]) => [k, v?.tier])) });
const withoutTier = (fm: Record<string, any>) => ({
  ...fm,
  metadata: { ...fm.metadata, tier: undefined, ...(fm.metadata?.steps && typeof fm.metadata.steps === 'object' ? { steps: Object.fromEntries(Object.entries<any>(fm.metadata.steps).map(([k, v]) => [k, { ...v, tier: undefined }])) } : {}) },
});
const tiersValid = (fm: Record<string, any>) => { const t = tiersOf(fm); return [t.tier, ...Object.values(t.steps)].every((x) => x === undefined || TIERS.includes(x as string)) && (t.tier !== undefined || Object.keys(t.steps).length > 0); };

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
      if (!b || !h || b.body !== h.body || !tiersValid(h.fm) || isDeepStrictEqual(tiersOf(b.fm), tiersOf(h.fm))) return 'guardrail';
      if (!isDeepStrictEqual(withoutTier(b.fm), withoutTier(h.fm))) return 'guardrail';
      if (!(benched ??= benchedSkills(d.root)).has(logicalName(skill))) return 'guardrail';
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
export function branchNames(b: Binding, names: string[]): string[] {
  const v = b.vcs;
  const ok = (n: string) =>
    n === v.trunk || (!!v.release_prefix && n.startsWith(v.release_prefix)) || n.startsWith('dependabot/') || n.startsWith('renovate/') ||
    isChangeLine(b, n);
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

/** Posts status ticket-linkage with the CI job's own token; the ruleset requires it, so a failed post fails the job. */
async function post(d: Deps, sha: string, description: string, ok: boolean) {
  await d.forge.status(sha, { context: 'ticket-linkage', state: ok ? 'success' : 'failure', description: description.slice(0, 140) }, { as: 'ci' });
}

/** Change lines of dependency bots: product changes with no ticket, reviewed like any CR. */
const DEPENDENCY_LINES = /^(dependabot|renovate)\//;
const DEPENDENCY_BOTS = /^((app\/)?(dependabot|renovate)(\[bot\])?|renovate-bot)$/i;

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
    let why = '';
    const item = await d.board.get(id).catch((e) => { why = String((e as Error).message ?? e).split('\n').slice(-1)[0]; return undefined; });
    if (!item) errors.push(`ticket ${id} is not on the board${why ? ` (${why})` : ''}`);
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

/** The approval class of a CR: the one classification the approval gate, `forge land` and `forge queue` share. */
export async function approvalClass(d: Deps, cr: CR, diff: string | undefined): Promise<ApprovalClass> {
  const b = d.binding;
  const cls = await classify(d, cr, diff);
  if (!factoryGlobs(b).length) return 'guardrail'; // no paths.factory: every CR waits for the owner
  if (cls !== 'product') return cls;
  const item = cr.closes.length === 1 ? await d.board.get(cr.closes[0]).catch(() => undefined) : undefined;
  // The Lane field is agent-written: a path in paths.lane_areas forces Full whatever it says.
  const areas = [b.paths.lane_areas ?? []].flat();
  const inArea = areas.length > 0 && (diff === undefined ? [] : diffPaths(diff) ?? []).some((p) => matchesAny(p, areas));
  return !inArea && String(item?.fields?.lane ?? '').toLowerCase() === 'fast' ? 'product-fast' : 'product-full';
}

/** Who must approve a class: none, any human outside the bots, or an owners.factory entry. */
export function approvalNeed(b: Binding, klass: ApprovalClass): 'none' | 'human' | 'owner' {
  const mode = b.forge.human_approval ?? 'full-lane';
  if (klass === 'guardrail') return 'owner';
  if (klass === 'tuning') return (b.learning?.auto_merge_classes ?? []).includes('tuning') ? 'none' : 'owner';
  return mode === 'always' || (mode === 'full-lane' && klass === 'product-full') ? 'human' : 'none';
}

/** The class of a CR and the forge accounts that may approve it (owners.factory for an owner wait, owners.product for a human wait). */
export async function approvalWho(d: Deps, cr: CR): Promise<{ class: ApprovalClass; who: string[] }> {
  const klass = await approvalClass(d, cr, await readDiff(d, cr.n));
  const need = approvalNeed(d.binding, klass);
  const o = ownersFor(d.binding.owners, 'forge');
  return { class: klass, who: need === 'owner' ? o.factory : need === 'human' ? o.product : [] };
}

/**
 * Status `human-approval`. product-fast passes; product-full needs a human approval on the head
 * (forge.human_approval full-lane or always; always holds product-fast too; never passes both);
 * tuning passes when auto-mergeable, else waits for any owners.factory like guardrail. A human is
 * an owner, member or collaborator of the repo outside owners.bots and forge.review_identity. The lane is the closing ticket's Lane
 * field; anything but Fast (unset, unreadable, several tickets) counts as Full.
 */
export async function approval(d: Deps, n: string) {
  const b = d.binding;
  const cr = await d.forge.view(n);
  const klass = await approvalClass(d, cr, await readDiff(d, n));
  const o = ownersFor(b.owners, 'forge');
  const bots = [...o.bots, b.forge.review_identity].filter(Boolean).map((u) => u!.toLowerCase());
  const owner = o.factory.map((u) => u.toLowerCase());
  const need = approvalNeed(b, klass);
  let by: string | undefined;
  if (need !== 'none') {
    const reviews = await d.forge.approvals(n);
    // On a public repo anyone can submit a review: only an owner, member or collaborator counts as a human approval.
    const member = new Set(reviews.filter((r) => !!r.assoc && ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(r.assoc)).map((r) => r.user.toLowerCase()));
    const ok = approvers(reviews, cr.headSha).filter((u) => member.has(u));
    by = need === 'owner' ? ok.find((u) => owner.includes(u)) : ok.find((u) => !bots.includes(u));
  }
  const pass = need === 'none' || !!by;
  const description = need === 'none' ? `${klass}: no human approval needed`
    : pass ? `${klass}: approved by ${by}`
    : `${klass}: waits for an approval of the head by ${need === 'owner' ? 'owners.factory' : 'a human'}`;
  await d.forge.status(cr.headSha, { context: 'human-approval', state: pass ? 'success' : 'pending', description });
  return { cr: cr.n, class: klass, need, state: pass ? 'success' : 'pending', ...(by ? { by } : {}) };
}

/**
 * Status `review` with one identity (no forge.review_identity): a cloud session cannot write commit
 * statuses, so `forge verdict` posts only its report and CI turns the newest trusted report for the head
 * into the status. With two identities `forge verdict` posts the status itself and this gate does nothing.
 */
export async function review(d: Deps, n: string) {
  const b = d.binding;
  if (b.forge.review_identity) return { cr: n, skipped: 'two identities: forge verdict posts the review status' };
  const cr = await d.forge.view(n);
  const [report] = selectComments((await d.forge.comments(n)).reverse(), { owners: ownersFor(b.owners, 'forge'), trusted: true, marker: matches('verdict', cr.headSha) });
  // The report's one verdict line; quoted CR text may carry another, so disagreeing verdicts fail.
  const verdict = verdictOf(report?.body ?? '');
  const state = verdict === 'PASS' ? 'success' : verdict ? 'failure' : 'pending';
  const description = verdict === 'CONFLICT' ? 'review: the report holds conflicting verdicts' : verdict ? `review: ${verdict}` : 'waits for a trusted verdict report on this head';
  await d.forge.status(cr.headSha, { context: b.forge.review_check_name ?? 'review', state, description, ...(report?.url ? { url: report.url } : {}) }, { as: 'ci' });
  return { cr: cr.n, state, ...(verdict ? { verdict } : {}) };
}

const TRAILER_LINE = /^([A-Za-z][A-Za-z0-9-]*):[ \t]+(\S.*?)[ \t]*$/;
const TRAILER_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:/@+#[\]-]{0,127}$/;

/** Git trailers: the `Key: value` lines of the message's last paragraph (keys lower case). The subject alone holds none. */
export function trailers(message: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const paras = message.replace(/\r/g, '').trimEnd().split(/\n[ \t]*\n/);
  if (paras.length < 2) return out;
  for (const line of paras[paras.length - 1].split('\n')) {
    const m = TRAILER_LINE.exec(line);
    if (m) (out[m[1].toLowerCase()] ??= []).push(m[2]);
  }
  return out;
}

/** The one well-formed value of a trailer; undefined when absent, repeated with different values, or malformed. */
const trailerValue = (t: Record<string, string[]>, key: string): string | undefined => {
  const v = [...new Set(t[key] ?? [])];
  return v.length === 1 && TRAILER_VALUE.test(v[0]) ? v[0] : undefined;
};

/** The forge's own web identity: it commits the merge a branch update makes (GitHub's `web-flow`). Only the login the forge verified counts: a committer email is the committer's own claim. */
const FORGE_WEB = new Set(['web-flow']);

/**
 * Status `agent-provenance` (forge.provenance: off | warn | require, default off). Every commit of the CR
 * whose author or committer is in owners.bots needs well-formed `Agent-Run` and `Agent-Model` trailers; other
 * authors' commits are listed as human, a merge commit made by the forge's own web identity (its branch update) as merge.
 * Any other merge commit is checked like a commit of its author. warn reports and
 * succeeds; require fails on any agent commit without them, and on commits it cannot read. No CR code runs.
 */
export async function provenance(d: Deps, n: string) {
  const mode = d.binding.forge.provenance ?? 'off';
  if (mode === 'off') return { cr: n, mode, skipped: 'forge.provenance is off' };
  const bots = new Set(ownersFor(d.binding.owners, 'forge').bots.map((u) => u.toLowerCase()));
  const cr = await d.forge.view(n);
  let list: CrCommit[] | undefined;
  let why = '';
  try { list = await d.forge.commits(n); } catch (e) { why = String((e as Error).message ?? e).split('\n')[0]; }
  const missing: string[] = [];
  const commits = (list ?? []).map((c) => {
    const sha = c.sha.slice(0, 12);
    // A commit the forge links to no account is matched by the name git recorded.
    const names = [c.author || c.authorName, c.committer || c.committerName].map((u) => u.toLowerCase());
    if (c.parents > 1 && FORGE_WEB.has(c.committer.toLowerCase())) return { sha, by: 'merge' as const, ok: true };
    if (!names.some((u) => bots.has(u))) return { sha, by: 'human' as const, ok: true };
    const t = trailers(c.message);
    const run = trailerValue(t, 'agent-run'), model = trailerValue(t, 'agent-model');
    if (!run) missing.push(`${sha}: Agent-Run trailer ${t['agent-run'] ? 'is malformed' : 'is missing'}`);
    if (!model) missing.push(`${sha}: Agent-Model trailer ${t['agent-model'] ? 'is malformed' : 'is missing'}`);
    return { sha, by: 'agent' as const, ...(run ? { run } : {}), ...(model ? { model } : {}), ok: !!run && !!model };
  });
  if (!list) missing.push(`commits unreadable: ${why || 'unknown'}`);
  const agentCommits = commits.filter((c) => c.by === 'agent').length;
  const humanCommits = commits.filter((c) => c.by === 'human').length;
  const ok = !missing.length;
  const state = mode === 'require' && !ok ? 'failure' : 'success';
  const description = !list ? `commits unreadable (${mode})` : `${agentCommits} agent, ${humanCommits} human commits; ${missing.length ? `${missing.length} trailer problems` : 'all agent commits carry trailers'} (${mode})`;
  await d.forge.status(cr.headSha, { context: 'agent-provenance', state, description: description.slice(0, 140) }, { as: 'ci' });
  return { cr: cr.n, mode, state, ok, commits, agentCommits, humanCommits, missing, ...(state === 'failure' ? { errors: missing } : {}) };
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
 * empty). A held ticket moves too, and Done drops its human label: nothing is left to ask; a Cancelled ticket stays.
 * A push with no CR (a direct push) changes nothing.
 */
export async function merged(d: Deps, sha: string): Promise<{ cr?: string; sha: string; moved: string[]; reason?: string }> {
  const b = d.binding.board;
  const opts = shippedOptions(d.binding.product.environments, d.binding.product.delivery);
  const cr = await d.forge.viewBySha(sha).catch((e: Error) => { if (/no change request for/.test(e.message)) return undefined; throw e; });
  const none = (reason: string) => ({ cr: cr?.n, sha, moved: [] as string[], reason });
  if (!cr?.n) return none('no CR merged at this sha');
  if (cr.state !== 'merged') return none(`CR ${cr.n} is not merged`);
  if (cr.target !== d.binding.vcs.trunk) return none(`target ${cr.target} is not trunk ${d.binding.vcs.trunk}`);
  if (cr.closes.length !== 1) return none(`CR closes ${cr.closes.length} tickets, not exactly one`);
  const id = cr.closes[0];
  const it = await d.board.get(id);
  if (it.status === 'Cancelled') return none(`${id} is Cancelled`);
  if (!b.done_statuses.includes(it.status)) {
    try { await d.board.move(id, 'Done', it.status); }
    catch (e) { if (!b.done_statuses.includes((await d.board.get(id)).status)) throw e; } // shipped moved it first
  }
  if ((await d.board.get(id)).labels.includes(b.labels.human)) await d.board.label(id, 'remove', b.labels.human);
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
/** Merge shas of the merged CRs that close each ticket; per ticket when the forge can search, else one list.
 * The search index trails a merge by seconds to minutes, so a ticket search finds nothing for also reads the list. */
async function mergeShas(d: Deps, ids: string[]): Promise<Map<string, (string | undefined)[]>> {
  const out = new Map<string, (string | undefined)[]>();
  if (d.forge.closing) for (const id of ids) { const s = (await d.forge.closing(id)).map((c) => c.mergeSha); if (s.length) out.set(id, s); }
  const rest = ids.filter((id) => !out.has(id));
  const merged = rest.length ? await d.forge.list({ state: 'merged' }) : [];
  for (const id of rest) out.set(id, merged.filter((c) => c.closes.includes(id)).map((c) => c.mergeSha));
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
  const done = (await d.board.list({ status: ['Done', 'In review'], state: 'all' })).filter((x) => x.status === 'Done' || x.status === 'In review');
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
      const now = rank((await d.board.get(x.id)).fields.shipped);
      if (now < rank(target) || now >= next) continue; // another deploy moved it meanwhile
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
      // `ship` sets In release at the cut; key on the version so a deploy that fails first still resets.
      const cut = done.filter((x) => x.status === 'Done' && x.fields.release_version && rank(x.fields.shipped) < rank(target));
      const byId = await mergeShas(d, cut.map((x) => x.id));
      for (const x of cut) {
        const shas = byId.get(x.id) ?? [];
        if (!shas.length || shas.some((s) => !s || isAnc(s, sha) !== true)) continue;
        const now = (await d.board.get(x.id)).fields;
        if (rank(now.shipped) >= rank(target) || now.release_version !== x.fields.release_version) continue; // it moved meanwhile
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
  // One run by id: a run that does not exist is an error (forge.run throws), not a quiet no-op.
  const run = await d.forge.run(id);
  if (run.state !== 'failure') return { created: false, reason: `run ${redact(id, 40)} did not fail (${redact(run.state, 20)})` };
  const v = d.binding.vcs;
  if (run.ref !== v.trunk && !(v.release_prefix && run.ref.startsWith(v.release_prefix))) return { created: false, reason: `ref ${redact(run.ref, 100)} is not trunk or a release line` };
  // No run id in the title: the title is the dedupe key, so a red trunk stays one open Signal and each red run comments on it.
  const title = redact(`CI red: ${run.name} @ ${run.ref}`, 1000).replace(/[^A-Za-z0-9 ._/:@()-]/g, '').slice(0, 100);
  return signal(d, 'ci', title, `run: ${redact(run.id, 40)}\nsha: ${redact(run.sha, 40)}\nurl: ${cleanUrl(run.url)}`);
}

/**
 * Files a Signal once: an open issue labelled signal:<source> with the same title (case and spaces aside) gets the new
 * body as a comment; else a Signal is created at Signals. Source and title are the dedupe key. Text is redacted.
 */
export async function signal(d: Deps, source: string, title: string, body = '') {
  if (!/^[a-z][a-z0-9-]*$/.test(source)) throw new UsageError('signal: --source is a lower-case word (a-z, 0-9, -)');
  const t = redact(title, 200).trim();
  if (!t) throw new UsageError('signal: --title is empty');
  const text = String(body ?? '').split('\n').map((l) => redact(l, 500)).join('\n').slice(0, 4000);
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const label = `signal:${source}`;
  const open = (await d.board.list({ label })).find((x) => key(x.title) === key(t) && !d.binding.board.done_statuses.includes(x.status));
  if (open) {
    await d.board.comment(open.id, text || t);
    return { created: false, id: open.id, commented: true };
  }
  const item = await d.board.create({ title: t, body: text, status: 'Signals', labels: [label] });
  return { created: true, id: item.id };
}

/** Every markdown file under `dir`, as paths relative to `dir`. */
const mdFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mdFiles(join(dir, e.name)).map((f) => `${e.name}/${f}`) : e.name.endsWith('.md') ? [e.name] : []));

/** The verbs of each group that has them, from the CLI's own tables. A group with no verb (init, dispatch ...) is absent. */
export function cliVerbs(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = { board: new Set(Object.keys(BOARD_VERBS)), forge: new Set(Object.keys(FORGE_VERBS)), vcs: new Set(Object.keys(VCS_VERBS)) };
  for (const g of ['gate', 'ledger', 'bench']) out[g] = new Set(GROUPS[g][2].split(':')[0].split(/\s+/).filter((w) => /^[a-z][a-z-]*$/.test(w)));
  return out;
}

/** The flags a verb of a CLI group takes, when the group's tables say; undefined for a group the check does not know. */
export function cliFlags(group: string, verb: string): Set<string> | undefined {
  const table = { board: BOARD_VERBS, forge: FORGE_VERBS, vcs: VCS_VERBS }[group];
  if (table) { const v = table[verb]; return new Set([...(v?.value ?? []), ...(v?.bool ?? [])]); }
  if (group === 'ledger') return new Set(Object.keys(LEDGER_OPTIONS));
  if (group === 'bench') return new Set(Object.keys(BENCH_OPTIONS));
  if (group === 'dispatch') return new Set(DISPATCH_FLAGS);
  return undefined;
}

/**
 * Every call of the CLI a skill file names in a code span: `agentic-sdlc board move <id> ...` or the short `board move <id> ...`
 * (a span may wrap over lines). `verb` is the verb, or the step id for `dispatch`; `rest` the words after it; `line` the 1-based line.
 */
export function cliCalls(text: string): { group: string; verb: string; rest: string; line: number }[] {
  const out: { group: string; verb: string; rest: string; line: number }[] = [];
  const re = /`(?:agentic-sdlc\s+)?(board|forge|vcs|gate|ledger|bench|dispatch)\s+([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)([^`]*)`/g;
  for (const m of text.matchAll(re)) out.push({ group: m[1], verb: m[2], rest: m[3], line: text.slice(0, m.index).split('\n').length });
  return out;
}

/**
 * A skill pack in `dir`: the loader's problems (frontmatter, steps and their files), links between skill files, forbidden
 * content (FORBIDDEN in skills.ts), every CLI call a skill file names (the verb exists, each `--flag` is one of its verb's,
 * a `dispatch` names a step). `rel` is the folder file names in messages are relative to.
 */
export function skillPackCheck(dir: string, rel: string): { errors: string[]; warnings: string[]; pack: ReturnType<typeof readSkills> } {
  const pack = readSkills(dir);
  const errors = [...pack.errors], warnings = [...pack.warnings];
  const verbs = cliVerbs();
  const ids = new Set(pack.steps.map((x) => x.id));
  for (const sk of pack.skills) for (const f of mdFiles(sk.dir)) {
    const file = join(sk.dir, f), name = `${sk.name}/${f}`;
    const text = readFileSync(file, 'utf8');
    const at = (line: number) => `${relative(rel, file).replaceAll('\\', '/')}:${line}`;
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = m[1].split('#')[0];
      if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
      if (!existsSync(resolve(dirname(file), link))) errors.push(`${f === 'SKILL.md' ? sk.name : name}: broken link ${m[1]}`);
    }
    for (const h of forbiddenHits(text)) errors.push(`${at(h.line)}: forbidden '${h.match}' (${h.reason})`);
    for (const c of cliCalls(text)) {
      if (c.group === 'dispatch') {
        if (!ids.has(c.verb)) errors.push(`${at(c.line)}: 'dispatch ${c.verb}' is not a step id (${[...ids].join(' ')})`);
      } else if (!verbs[c.group].has(c.verb)) { errors.push(`${at(c.line)}: '${c.group} ${c.verb}' is not a verb (${c.group}: ${[...verbs[c.group]].join(' ')})`); continue; }
      const known = cliFlags(c.group, c.verb);
      if (known) for (const m of c.rest.matchAll(/(?<![\w-])--([a-z][a-z-]*)/g))
        if (!known.has(m[1])) errors.push(`${at(c.line)}: '--${m[1]}' is not a flag of '${c.group} ${c.verb}' (${[...known].map((k) => `--${k}`).join(' ') || 'none'})`);
    }
  }
  return { errors, warnings, pack };
}

/**
 * The installed skill pack (`.agents/skills`, checked by `skillPackCheck`) and the scorers' `applies_to`.
 * A top-level tier still passes, with a warning.
 */
export function skillRegression(root: string): { errors: string[]; warnings: string[] } {
  const dir = join(root, '.agents', 'skills');
  if (!existsSync(dir)) return { errors: [`${dir} does not exist`], warnings: [] };
  const { errors, warnings, pack } = skillPackCheck(dir, root);
  const sdir = join(root, '.agents', 'scorers');
  const targets = scorerTargets(pack);
  if (existsSync(sdir)) for (const f of readdirSync(sdir).filter((n) => n.endsWith('.md'))) errors.push(...scorerErrors(f, readFileSync(join(sdir, f), 'utf8'), targets));
  return { errors, warnings };
}

/** A scorer file's frontmatter: name, applies_to (list or "*"), scale. */
function scorerErrors(f: string, text: string, targets: Set<string>): string[] {
  let fm: any;
  try { fm = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''); } catch { return [`scorers/${f}: frontmatter is not YAML`]; }
  if (!fm || typeof fm !== 'object') return [`scorers/${f}: no frontmatter`];
  const errors: string[] = [];
  if (typeof fm.name !== 'string' || !fm.name) errors.push(`scorers/${f}: frontmatter name missing`);
  const at = fm.applies_to;
  if (at !== '*' && !(Array.isArray(at) && at.length && at.every((s: unknown) => typeof s === 'string' && s))) errors.push(`scorers/${f}: applies_to must be "*" or a list of step ids or skills`);
  else if (Array.isArray(at)) for (const t of at) if (!targets.has(t)) errors.push(`scorers/${f}: applies_to '${t}' names no step or skill (steps: ${[...targets].join(', ')})`);
  if (!['pass-fail', '0-4'].includes(fm.scale)) errors.push(`scorers/${f}: scale ${fm.scale} invalid`);
  return errors;
}

/** The gates' dependencies from the binding: the ports, a command runner and git reads. */
export function depsOf(base: Omit<AdapterContext, 'options'>): Deps {
  const ctxOf = (options: Record<string, unknown>): AdapterContext => ({ ...base, options });
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
}

export const cli: PortCli = (argv, base) =>
  guard(async () => {
    const [gate, ...rest] = argv;
    const a = parseArgs(rest, ['stdin-prepush']);
    const deps = () => depsOf(base);
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
      case 'merged': {
        const sha = a.need('sha');
        const r = await merged(deps(), sha);
        return r;
      }
      case 'shipped': {
        if (!a.pos[0]) throw new UsageError('shipped <env> is required');
        const sha = a.need('sha'), result = a.need('result'), version = a.get('version');
        const r = await shipped(deps(), a.pos[0], sha, result, version);
        return r;
      }
      case 'approval': {
        const r = await approval(deps(), a.need('cr'));
        return r;
      }
      case 'review': return review(deps(), a.need('cr'));
      case 'provenance': {
        const r = await provenance(deps(), a.need('cr'));
        if ('errors' in r && r.errors?.length) process.stdout.write(JSON.stringify(r) + '\n'); // the report, then the failure
        return fail(r as { errors?: string[] });
      }
      case 'proofs-on-base': return fail(await proofsOnBase(deps(), a.need('cr')));
      case 'evidence': {
        const sha = a.need('sha');
        const kinds = base.binding.product.evidence ?? [];
        if (!kinds.length) return { ok: true, kinds, reason: 'product.evidence is empty' };
        const cmd = base.binding.commands?.evidence_check;
        if (!cmd) throw new Error('product.evidence is set but commands.evidence_check is unset');
        shell(base.exec, fill(cmd, { sha }), base.root);
        return { ok: true, kinds, sha };
      }
      case 'signal-on-red': return signalOnRed(deps(), a.need('run'));
      case 'signal': return signal(deps(), a.need('source'), a.need('title'), a.get('body'));
      case 'skill-regression': {
        const { errors, warnings } = skillRegression(base.root);
        for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
        if (errors.length) throw new Error(errors.join('\n'));
        return { ok: true, warnings };
      }
      default: throw new UsageError(`unknown gate: ${gate ?? ''}`);
    }
  });

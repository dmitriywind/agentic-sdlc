// Repo gates, run by CI. Mechanism only: every process value comes from the binding.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import type { AdapterContext, Binding, Board, CR, Forge, PortCli, Vcs } from './ports.ts';
import { BINDING_PATH } from './binding.ts';
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
  headFile?: (path: string, sha: string) => string | undefined;
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
    // ponytail: git's C-quoted form ("a/...") is not decoded; such a CR fails closed to product.
    if (rest.includes('"') || !rest.startsWith('a/')) return null;
    const cuts = [...rest.matchAll(/ b\//g)].map((m) => m.index!);
    const cut = cuts.length === 1 ? cuts[0] : cuts.find((i) => rest.slice(2, i) === rest.slice(i + 3));
    if (cut === undefined) return null;
    out.push(rest.slice(2, cut), rest.slice(cut + 3));
  }
  return out;
}

const TUNING_KEYS = ['models']; // cycle.*, stall_minutes, parallel_agents are guardrail: the bench cannot measure them
const isSkillMd = (p: string) => p.startsWith('.agents/skills/') && p.endsWith('.md');

/** product | tuning | guardrail. Anything not provably tuning under paths.factory is guardrail. */
export async function classify(d: Deps, cr: CR, diff: string): Promise<'product' | 'tuning' | 'guardrail'> {
  const paths = diffPaths(diff);
  if (!paths?.length || !paths.every((p) => matchesAny(p, factoryGlobs(d.binding)))) return 'product';
  if (/^deleted file mode/m.test(diff)) return 'guardrail'; // deleting a skill deletes rules
  for (const p of new Set(paths)) {
    if (isSkillMd(p)) continue;
    if (p !== BINDING_PATH) return 'guardrail';
    let head: Record<string, unknown>;
    try { head = parse(d.headFile?.(p, cr.headSha) ?? '') as Record<string, unknown>; } catch { return 'guardrail'; }
    if (!head || typeof head !== 'object') return 'guardrail';
    const base = d.binding as unknown as Record<string, unknown>;
    const keys = new Set([...Object.keys(base), ...Object.keys(head)]);
    if ([...keys].some((k) => !TUNING_KEYS.includes(k) && !isDeepStrictEqual(base[k], head[k]))) return 'guardrail';
  }
  return 'tuning';
}
const nameHas = (s: string, id: string) => new RegExp(`(^|[^A-Za-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(s);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patternRe = (p: string) =>
  new RegExp('^' + p.split(/(<ticket>|<name>)/).map((x) => x === '<ticket>' ? '[A-Za-z0-9_-]+' : x === '<name>' ? '[a-z0-9]+(?:-[a-z0-9]+)*' : esc(x)).join('') + '$');

/** Shipped options derived from the product environments. */
export function shippedOptions(envs: string[]): string[] {
  return ['Not shipped', ...envs.slice(0, -1).map((e) => `On ${e}`), ...(envs.length > 1 ? ['In release'] : []), `On ${envs[envs.length - 1]}`];
}

export function branchNames(b: Binding, names: string[]): string[] {
  const v = b.vcs;
  const ok = (n: string) =>
    n === v.trunk || n.startsWith(v.release_prefix) || n.startsWith('dependabot/') || n.startsWith('renovate/') ||
    patternRe(v.change_pattern).test(n) || patternRe(v.factory_change_pattern).test(n);
  return names.filter((n) => !ok(n));
}

export async function linkage(d: Deps, n: string) {
  const cr = await d.forge.view(n);
  const cls = await classify(d, cr, await d.forge.diff(n));
  if (cls !== 'product') return { ok: true, factory: true, class: cls, errors: [] as string[] };
  const errors: string[] = [];
  if (cr.closes.length !== 1) errors.push(`CR ${n} must close exactly one ticket, found ${cr.closes.length}`);
  else {
    const id = cr.closes[0];
    const item = await d.board.get(id).catch(() => undefined);
    if (!item) errors.push(`ticket ${id} is not on the board`);
    else if (d.binding.board.done_statuses.includes(item.status)) errors.push(`ticket ${id} is not open (${item.status})`);
    if (!nameHas(cr.source, id)) errors.push(`source change line "${cr.source}" does not name ${id}`);
  }
  return { ok: !errors.length, factory: false, class: cls, errors };
}

/** Status context `factory-owner`: green for product CRs and auto-mergeable tuning, red otherwise (owner review decides). */
export async function factoryClass(d: Deps, n: string) {
  const cr = await d.forge.view(n);
  const cls = await classify(d, cr, await d.forge.diff(n));
  const auto = cls === 'product' || (cls === 'tuning' && (d.binding.learning?.auto_merge_classes ?? []).includes('tuning'));
  await d.forge.status(cr.headSha, {
    context: 'factory-owner',
    state: auto ? 'success' : 'failure',
    description: auto ? `${cls}: no factory owner needed` : `${cls} factory change waits for owners.factory`,
  });
  return { cr: cr.n, class: cls, state: auto ? 'success' : 'failure' };
}

const OPEN_EVENTS = ['opened', 'ready', 'draft'];

export async function boardSync(d: Deps, o: { cr?: string; sha?: string; event: string; release?: string }) {
  const b = d.binding.board;
  const opts = shippedOptions(d.binding.product.environments);
  if (o.event === 'in-release') {
    if (!o.release) throw new UsageError('--release is required for in-release');
    if (!opts.includes('In release')) return { event: o.event, moved: [], reason: 'one environment: no In release' };
    const moved: string[] = [];
    for (const x of await d.board.list()) {
      if (x.fields.release_version !== o.release || opts.indexOf(x.fields.shipped || opts[0]) >= opts.indexOf('In release')) continue;
      await d.board.set(x.id, 'shipped', 'In release');
      moved.push(x.id);
    }
    return { event: o.event, release: o.release, moved };
  }
  if (o.event !== 'merged' && !OPEN_EVENTS.includes(o.event)) throw new UsageError(`unknown event: ${o.event}`);
  const cr = o.sha ? await d.forge.viewBySha(o.sha).catch(() => undefined) : await d.forge.view(o.cr!);
  if (!cr?.n) throw new Error(`no CR merged at ${o.sha}`);
  const none = (reason: string) => ({ cr: cr.n, event: o.event, moved: [] as string[], reason });
  if (cr.closes.length !== 1) return none(`CR closes ${cr.closes.length} tickets, not exactly one`);
  const id = cr.closes[0];
  if (o.event === 'merged') {
    if (cr.target !== d.binding.vcs.trunk) return none(`target ${cr.target} is not trunk ${d.binding.vcs.trunk}`);
    const it = await d.board.move(id, 'Done');
    if (!it?.fields?.shipped) await d.board.set(id, 'shipped', opts[0]);
  } else {
    const it = await d.board.get(id);
    if (b.done_statuses.includes(it.status)) return none(`${id} is ${it.status}`);
    if (it.labels.includes(b.labels.human)) return none(`${id} is held (${b.labels.human})`);
    await d.board.move(id, 'In review');
  }
  return { cr: cr.n, event: o.event, moved: [id] };
}

export async function shipped(d: Deps, env: string, sha: string, result: string) {
  const envs = d.binding.product.environments;
  const i = envs.indexOf(env);
  if (i < 0) throw new UsageError(`unknown environment ${env}; one of ${envs.join(', ')}`);
  if (result !== 'success' && result !== 'failure') throw new UsageError('--result must be success|failure');
  const opts = shippedOptions(envs);
  const rank = (s?: string) => opts.indexOf(s || opts[0]);
  const target = `On ${env}`;
  const last = i === envs.length - 1;
  const done = (await d.board.list({ status: ['Done'] })).filter((x) => x.status === 'Done');
  const changed: string[] = [];
  const signal = async (held: boolean) => {
    await d.board.create({
      title: `Deploy to ${env} failed at ${sha.slice(0, 12)}`,
      body: `Deploy to ${env} failed.\nsha: ${sha}\nenvironment: ${env}`,
      status: 'Signals',
      labels: ['signal:deploy', ...(held ? [d.binding.board.labels.human] : [])],
    });
  };
  if (result === 'success') {
    // A ticket shipped here only when every merged CR closing it is an ancestor of the deployed sha.
    const isAnc = d.isAncestor;
    if (!isAnc) return { env, result, changed, tags: [], unknown: true };
    const merged = await d.forge.list({ state: 'merged' });
    const items = [];
    for (const x of done.filter((x) => rank(x.fields.shipped) < rank(target))) {
      const shas = merged.filter((c) => c.closes.includes(x.id)).map((c) => c.mergeSha);
      if (!shas.length) continue;
      const anc = shas.map((s) => (s ? isAnc(s, sha) : undefined));
      if (anc.includes(undefined)) return { env, result, changed: [], tags: [], unknown: true };
      if (anc.every(Boolean)) items.push(x);
    }
    for (const x of items) { await d.board.set(x.id, 'shipped', target); changed.push(x.id); }
    const tags: string[] = [];
    if (last) {
      for (const v of new Set(items.map((x) => x.fields.release_version).filter((v): v is string => !!v))) {
        await d.vcs.tag(`${d.binding.vcs.tag_prefix}${v}`, sha);
        tags.push(`${d.binding.vcs.tag_prefix}${v}`);
      }
    }
    return { env, result, changed, tags };
  }
  if (last) {
    const back = i > 0 ? `On ${envs[i - 1]}` : opts[0];
    for (const x of done.filter((x) => x.fields.release_version && x.fields.shipped === 'In release')) {
      await d.board.set(x.id, 'shipped', back);
      await d.board.set(x.id, 'release_version', null);
      changed.push(x.id);
    }
  }
  await signal(last);
  return { env, result, changed, signal: true };
}

const redact = (s: string, max = 120) =>
  String(s ?? '').replace(/[\x00-\x1f]/g, ' ').replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, '[redacted]').slice(0, max);
const cleanUrl = (u: string) => redact(String(u ?? '').replace(/^(\w+:\/\/)[^/@]*@/, '$1').replace(/[?#].*$/, ''), 200);

export async function signalOnRed(d: Deps, id: string) {
  const runs = [...(await d.forge.runs({ failed: true })), ...(await d.forge.runs({}))];
  const run = runs.find((r) => String(r.id) === id);
  if (!run) throw new Error(`run ${id} not found`);
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

export function skillRegression(root: string): string[] {
  const dir = join(root, '.agents', 'skills');
  if (!existsSync(dir)) return [`${dir} does not exist`];
  const errors: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = join(dir, e.name, 'SKILL.md');
    if (!existsSync(file)) { errors.push(`${e.name}: SKILL.md missing`); continue; }
    const text = readFileSync(file, 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
    if (fm === undefined) { errors.push(`${e.name}: no frontmatter`); continue; }
    for (const k of ['name', 'description', 'tier']) if (!new RegExp(`^${k}:\\s*\\S`, 'm').test(fm)) errors.push(`${e.name}: frontmatter ${k} missing`);
    const tier = /^tier:\s*(\S+)/m.exec(fm)?.[1];
    if (tier && !['fast', 'balanced', 'deep'].includes(tier)) errors.push(`${e.name}: tier ${tier} invalid`);
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = m[1].split('#')[0];
      if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
      if (!existsSync(resolve(dirname(file), link))) errors.push(`${e.name}: broken link ${m[1]}`);
    }
  }
  const sdir = join(root, '.agents', 'scorers');
  if (existsSync(sdir)) for (const f of readdirSync(sdir).filter((n) => n.endsWith('.md'))) errors.push(...scorerErrors(f, readFileSync(join(sdir, f), 'utf8')));
  return errors;
}

/** A scorer file's frontmatter: name, applies_to (list or "*"), tier, scale. */
function scorerErrors(f: string, text: string): string[] {
  let fm: any;
  try { fm = parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''); } catch { return [`scorers/${f}: frontmatter is not YAML`]; }
  if (!fm || typeof fm !== 'object') return [`scorers/${f}: no frontmatter`];
  const errors: string[] = [];
  if (typeof fm.name !== 'string' || !fm.name) errors.push(`scorers/${f}: frontmatter name missing`);
  const at = fm.applies_to;
  if (at !== '*' && !(Array.isArray(at) && at.length && at.every((s: unknown) => typeof s === 'string' && s))) errors.push(`scorers/${f}: applies_to must be "*" or a list of skills`);
  if (!['fast', 'balanced', 'deep'].includes(fm.tier)) errors.push(`scorers/${f}: tier ${fm.tier} invalid`);
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
      if (b.vcs.adapter !== 'git') return d; // hg/p4: no ancestry or head-file lookup; gates fail closed
      const git = (args: string[]) => base.exec('git', args, { cwd: base.root });
      d.headFile = (path, sha) => { try { return git(['show', `${sha}:${path}`]); } catch { return undefined; } };
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
      case 'board-sync': {
        const event = a.need('event');
        if (event !== 'in-release' && !a.has('cr') && !a.has('sha')) throw new UsageError('--cr or --sha is required');
        return boardSync(deps(), { cr: a.get('cr'), sha: a.get('sha'), event, release: a.get('release') });
      }
      case 'shipped': {
        if (!a.pos[0]) throw new UsageError('shipped <env> is required');
        return shipped(deps(), a.pos[0], a.need('sha'), a.need('result'));
      }
      case 'factory-class': return factoryClass(deps(), a.need('cr'));
      case 'signal-on-red': return signalOnRed(deps(), a.need('run'));
      case 'skill-regression': {
        const errors = skillRegression(base.root);
        if (errors.length) throw new Error(errors.join('\n'));
        return { ok: true };
      }
      default: throw new UsageError(`unknown gate: ${gate ?? ''}`);
    }
  });

// init / validate / doctor.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { ADAPTERS, BINDING_PATH, UNRESOLVED, bindingWarnings, loadBinding, unresolved, unresolvedValue, validateBinding } from './binding.ts';
import { HEARTBEAT, createBoard } from './board/index.ts';
import { createForge } from './forge/index.ts';
import { createVcs } from './vcs/index.ts';
import { createLocalBoard } from './board/local.ts';
import type { AdapterContext, Binding, PortCli } from './ports.ts';
import { DEFAULTS, COPY_PREFIX, bindWorkflow, knownHashes, oneIdentityRuleset, releasedHash, renameSkill, sha, skillNames, type Bound } from './pristine.ts';
import { readSkills, scorerTargets } from './skills.ts';

const START = '<!-- agentic-sdlc:start -->';
const END = '<!-- agentic-sdlc:end -->';
const POINTER = `${START}
Work lives on the board named in \`.agents/binding.yml\`. Before any work, invoke the sdlc skill (\`/agentic-sdlc:sdlc\` in Claude Code).
Never duplicate the process here: the skills own it, the binding owns the project values.
${END}`;
const INSTALL_LOCK = '.agents/install.lock.json';
const LEGACY_LOCK = '.agents/skills.lock.json'; // read once, so an install from before the one lock upgrades cleanly
const TIERS = ['fast', 'balanced', 'deep'];
const FORGES = ['github'];

/** The folder holding package.json, walking up from this file. AGENTIC_SDLC_PACKAGE overrides it (tests). */
export function packageRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.AGENTIC_SDLC_PACKAGE) return resolve(env.AGENTIC_SDLC_PACKAGE);
  let d = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(d, 'package.json'))) {
    const up = dirname(d);
    if (up === d) throw new Error('cannot find the agentic-sdlc package root');
    d = up;
  }
  return d;
}

const INIT_FLAGS = ['board', 'forge', 'vcs', 'harness', 'profile', 'ref', 'force', 'upgrade', 'no-plugin'];
const flagsOf = (argv: string[]) => {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument '${argv[i]}'`);
    const k = argv[i].slice(2);
    if (!INIT_FLAGS.includes(k)) throw new Error(`unknown flag --${k} (init takes ${INIT_FLAGS.map((n) => '--' + n).join(', ')})`);
    if (k === 'force' || k === 'upgrade' || k === 'no-plugin') f[k] = 'true';
    else if (i + 1 < argv.length) f[k] = argv[++i];
    else throw new Error(`--${k} needs a value`);
  }
  return f;
};

const need = (pkg: string, rel: string) => {
  const p = join(pkg, rel);
  if (!existsSync(p)) throw new Error(`package is missing ${rel} (looked in ${pkg})`);
  return p;
};

const parseJson = (text: string, p: string) => {
  try { return JSON.parse(text); } catch (e) { throw new Error(`${p} is not valid JSON (${(e as Error).message}); fix it and run init again`); }
};
const readJson = (p: string) => parseJson(readFileSync(p, 'utf8'), basename(p));

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => statSync(join(dir, n)).isDirectory() ? filesUnder(join(dir, n)).map((f) => join(n, f)) : [n]);

const posix = (p: string) => p.replaceAll('\\', '/');

/**
 * Every file init installs from the package, tracked in one lock: the hash of each file as written.
 * A file still at its recorded hash follows the package; one edited since is kept unless --force.
 * A file with no matching lock entry (an install from before the lock, or a stale entry) is unedited when it equals
 * the package's, or when its hash is one a released version had (templates/known-hashes.json).
 */
class Installer {
  lock: Record<string, string> = {};
  offered = new Set<string>();
  counts = { wrote: 0, updated: 0, kept: 0, stale: 0, removed: 0 };
  root: string; pkg: string; force: boolean; log: string[]; known: Set<string>;
  /** The binding's values for the `# set:` lines of the stock workflows. */
  bound: Bound = DEFAULTS;
  constructor(root: string, pkg: string, force: boolean, log: string[]) {
    this.root = root; this.pkg = pkg; this.force = force; this.log = log; this.known = knownHashes(pkg);
    for (const f of [LEGACY_LOCK, INSTALL_LOCK]) {
      const file = join(root, f);
      if (existsSync(file)) Object.assign(this.lock, readJson(file));
    }
  }
  /** Install `data` at `rel`. `src` is the package file it comes from (named when a differing file is kept). `quiet` hides wrote/updated lines. Returns false when a differing file is kept. */
  put(rel: string, data: string | Buffer, src?: string, quiet = false, legacy?: (text: string) => boolean): boolean {
    rel = posix(rel);
    this.offered.add(rel);
    const to = join(this.root, rel), want = sha(data);
    let how = 'wrote';
    if (existsSync(to)) {
      const bytes = readFileSync(to), have = sha(bytes);
      if (have === want) { this.lock[rel] = want; return true; }
      if (have === this.lock[rel] || this.known.has(releasedHash(basename(rel), bytes, rel)) || (!(rel in this.lock) && legacy?.(bytes.toString('utf8')))) how = 'updated';
      else if (this.force) how = 'overwrote';
      else {
        this.counts.kept++;
        this.log.push(`kept ${rel} (differs from every released version; ${src ? `--force overwrites, see ${join(this.pkg, src)}` : '--force regenerates it'})`);
        return false;
      }
    }
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, data);
    this.lock[rel] = want;
    if (how === 'wrote') this.counts.wrote++; else this.counts.updated++;
    if (!quiet) this.log.push(`${how} ${rel}`);
    return true;
  }
  /** Install the package file `src` (relative to the package) at `rel`. */
  copy(src: string, rel: string, quiet = false) {
    const data = readFileSync(join(this.pkg, src));
    return this.put(rel, posix(rel).startsWith('.github/workflows/') ? bindWorkflow(basename(rel), data.toString('utf8'), this.bound) : data, src, quiet);
  }
  /** Name a file this run does not install (by choice of binding or harness) so it is not reported as stale. */
  skip(rel: string) { this.offered.add(posix(rel)); }
  /**
   * Copy the skill pack into `dest`. `copied` writes the copied-install names: every skill folder but `sdlc` becomes
   * `sdlc-<name>` (folder, frontmatter name, links between skills; see renameSkill). The lock holds what was written;
   * pristine detection reads an installed file back to the package's source form.
   */
  skills(src: string, dest: string, copied = false) {
    const before = this.counts.wrote + this.counts.updated;
    const names = skillNames(join(this.pkg, src));
    for (const f of filesUnder(join(this.pkg, src))) {
      const from = join(src, f);
      if (!copied) { this.copy(from, join(dest, f), true); continue; }
      const seg = posix(f).split('/');
      const folder = names.has(seg[0]) && seg[0] !== 'sdlc' ? COPY_PREFIX + seg[0] : seg[0];
      const rel = join(dest, folder, ...seg.slice(1));
      const data = readFileSync(join(this.pkg, from));
      this.put(rel, f.endsWith('.md') ? renameSkill(posix(f), data.toString('utf8'), 'to', names) : data, from, true);
    }
    const n = this.counts.wrote + this.counts.updated - before;
    this.log.push(`wrote ${dest} (${n} file${n === 1 ? '' : 's'} updated)`);
  }
  /** A package skill file's path inside a copied install's skills folder. */
  installedName(f: string): string {
    const seg = posix(f).split('/');
    return join(seg[0] !== 'sdlc' ? COPY_PREFIX + seg[0] : seg[0], ...seg.slice(1));
  }
  /** Is the installed file `rel` an unedited copy of some released version (its lock hash, or a known hash)? */
  pristine(rel: string): boolean {
    const bytes = readFileSync(join(this.root, rel));
    return sha(bytes) === this.lock[rel] || this.known.has(releasedHash(basename(rel), bytes, rel));
  }
  /**
   * Files the package no longer ships: an unedited one (its lock hash, or a hash a released version had) is removed, so an
   * old skill folder does not linger and trigger; an edited one is reported stale and kept. Untracked files in the skill
   * folders are looked at too (an install from before the lock); one that is not an unedited copy is the project's own.
   * Then save the lock.
   */
  finish() {
    const skillFiles = ['.agents/skills', '.claude/skills'].flatMap((d) => (existsSync(join(this.root, d)) ? filesUnder(join(this.root, d)).map((f) => posix(join(d, f))) : []));
    for (const rel of [...new Set([...Object.keys(this.lock), ...skillFiles])].sort()) {
      if (this.offered.has(rel)) continue;
      if (!existsSync(join(this.root, rel))) { delete this.lock[rel]; continue; }
      if (this.pristine(rel)) {
        rmSync(join(this.root, rel));
        delete this.lock[rel];
        for (let d = dirname(join(this.root, rel)); /[\\/]\.(?:agents|claude)[\\/]skills[\\/]./.test(d.slice(this.root.length)); d = dirname(d)) {
          if (readdirSync(d).length) break;
          rmdirSync(d);
        }
        this.counts.removed++;
        this.log.push(`removed ${rel}: no longer part of the package`);
      } else if (rel in this.lock) {
        this.counts.stale++;
        this.log.push(`stale ${rel}: no longer part of the package`);
      }
    }
    const file = join(this.root, INSTALL_LOCK);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(this.lock).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2) + '\n');
    const legacy = join(this.root, LEGACY_LOCK);
    if (existsSync(legacy)) { rmSync(legacy); this.log.push(`removed ${LEGACY_LOCK}: merged into ${INSTALL_LOCK}`); }
  }
}

/** Binding keys (top level and second level) that the template sets and this binding does not. */
export function missingBindingKeys(template: string, binding: string): string[] {
  const t = parse(template), b = parse(binding);
  const isMap = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  if (!isMap(t) || !isMap(b)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(t)) {
    if (!(k in b)) out.push(k);
    else if (k === 'paths') continue; // init leaves out a paths file key whose file the project does not have
    else if (isMap(v) && isMap(b[k])) for (const k2 of Object.keys(v)) if (!(k2 in (b[k] as object))) out.push(`${k}.${k2}`);
  }
  return out;
}
/** The template's binding keys the project's binding does not set; none when the package has no template to compare with. */
export function missingKeys(root: string): string[] {
  try { return missingBindingKeys(readFileSync(join(packageRoot(), 'templates/binding.yml'), 'utf8'), readFileSync(join(root, BINDING_PATH), 'utf8')); } catch { return []; }
}
const missingKeysLine = (keys: string[]) => keys.length ? `info: binding keys in the template that this binding does not set: ${keys.join(', ')}` : undefined;

/** Register the agentic-sdlc stdio server (the launcher) in the project's .mcp.json, keeping other servers. */
function registerMcp(pkg: string, root: string, force: boolean, log: string[], upgrade: boolean) {
  const want = JSON.parse(readFileSync(need(pkg, 'templates/mcp/claude.json'), 'utf8'));
  const rel = '.mcp.json';
  const file = join(root, rel);
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const doc = cur.trim() ? parseJson(cur, rel) : {};
  // The project may have tuned its entry (args, env): keep it unless --force.
  const had = doc.mcpServers?.['agentic-sdlc'];
  const old = had?.command === 'npx' && Array.isArray(had.args) && had.args.includes('agentic-sdlc'); // written by an older release
  if (had && !force && !old) { log.push(`kept ${rel}`); return; }
  // An upgrade writes only under paths.factory, and .mcp.json is a root file: say the fix.
  if (upgrade && old) { log.push(`kept ${rel}: its agentic-sdlc entry runs npx; change it in a product change to {"command":"${LAUNCHER}","args":["mcp"]}`); return; }
  doc.mcpServers = { ...doc.mcpServers, ...want.mcpServers };
  const next = JSON.stringify(doc, null, 2) + '\n';
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next);
  log.push(`wrote ${rel}`);
}

const CLI_PIN = '.agents/cli.json';
const CLI_PACKAGE = 'github:dmitriywind/agentic-sdlc';
const LAUNCHER = '.agents/bin/agentic-sdlc';
const IGNORED = ['.cli/', 'work/']; // the launcher's cache, vcs start's workdirs
const isSha = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s);
const isTag = (s: unknown) => typeof s === 'string' && /^v\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.+-]+)?$/.test(s);

/**
 * Write the CLI pin, a factory file (git only: the npm name agentic-sdlc belongs to another package). The ref is the running
 * package's version tag, or --ref. An upgrade moves a tag; a commit sha (only --ref or the project writes one) stays until --ref or --force.
 */
function pinCli(inst: Installer, version: string, ref: string | undefined, force: boolean) {
  const file = join(inst.root, CLI_PIN);
  inst.offered.add(CLI_PIN);
  let pkgName = CLI_PACKAGE, want = ref ?? `v${version}`;
  if (existsSync(file)) {
    const raw = readFileSync(file);
    const cur = parseJson(raw.toString('utf8'), CLI_PIN);
    if (typeof cur.package === 'string' && cur.package) pkgName = cur.package;
    if (!ref && !force && isSha(cur.ref)) {
      inst.counts.kept++;
      inst.log.push(`kept ${CLI_PIN} (its ref is a commit sha you set; --ref <sha|vX.Y.Z> or --force moves it)`);
      return;
    }
  }
  const data = JSON.stringify({ package: pkgName, ref: want }, null, 2) + '\n';
  const had = existsSync(file);
  if (had && sha(readFileSync(file)) === sha(data)) { inst.lock[CLI_PIN] = sha(data); return; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  inst.lock[CLI_PIN] = sha(data);
  if (had) inst.counts.updated++; else inst.counts.wrote++;
  inst.log.push(`${had ? 'updated' : 'wrote'} ${CLI_PIN} (ref ${want})`);
}

/** Keep the launcher's cache and the change-line workdirs out of git: append each entry once to .agents/.gitignore (a factory file). */
function ignoreCliCache(root: string, log: string[]) {
  const file = join(root, '.agents', '.gitignore');
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const add = IGNORED.filter((e) => !new RegExp(`^/?${e.slice(0, -1).replace(/\./g, '\\.')}/?\\s*$`, 'm').test(text));
  if (!add.length) return;
  text += (text && !text.endsWith('\n') ? '\n' : '') + add.map((e) => e + '\n').join('');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  log.push(`added ${add.join(', ')} to .agents/.gitignore`);
}

/** The old pin lived in package.json: say how to drop it. Never edits the file. */
function oldPinHint(root: string, log: string[]) {
  try {
    const doc = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (doc?.devDependencies?.['agentic-sdlc'] !== undefined)
      log.push(`package.json pins agentic-sdlc as a devDependency: remove it with npm rm agentic-sdlc (the pin is ${CLI_PIN})`);
  } catch { /* no package.json, or not ours to judge */ }
}

/** Claude Code: tier subagents from binding.models, and CLAUDE.md importing AGENTS.md. Skills come from the plugin. */
function claudeSetup(root: string, inst: Installer, log: string[], noPlugin: boolean, upgrade: boolean) {
  let models: Record<string, string> = {};
  try { models = parse(readFileSync(join(root, BINDING_PATH), 'utf8'))?.models ?? {}; } catch { /* reported by validate */ }
  for (const tier of TIERS) {
    const rel = `.claude/agents/sdlc-${tier}.md`;
    const model = !models[tier] || /^your-/.test(models[tier]) || String(models[tier]).startsWith(UNRESOLVED) ? 'inherit' : models[tier]; // a placeholder: the session's model
    inst.put(rel, `---
name: sdlc-${tier}
description: Runs one agentic-sdlc step whose tier is ${tier}. The sdlc skill hands a step to this agent when the step is at the ${tier} tier.
model: ${model}
---

You run one step of the agentic-sdlc process at the ${tier} tier. Your task names the step file to follow
(\`.agents/skills/sdlc-<skill>/steps/<step>.md\`, or the skill's \`SKILL.md\` for a one-step skill). Read it, follow it to
its last Done when, and report the result and the evidence. Call the CLI as \`agentic-sdlc <group> <verb>\` (it is \`${LAUNCHER}\`).
Do not start subagents.
`, undefined, false, (t) => t.includes('npx --no agentic-sdlc')); // an older release wrote no hash we know: its text is the evidence
  }
  const file = join(root, 'CLAUDE.md');
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/^@AGENTS\.md\s*$/m.test(cur)) log.push('kept CLAUDE.md (imports @AGENTS.md)');
  else if (upgrade) log.push('kept CLAUDE.md: it does not import @AGENTS.md; add the line in a product change');
  else {
    writeFileSync(file, (cur ? cur.replace(/\n*$/, '\n\n') : '') + '@AGENTS.md\n');
    log.push(cur ? 'appended @AGENTS.md to CLAUDE.md' : 'wrote CLAUDE.md (@AGENTS.md)');
  }
  if (noPlugin) { reviewSandbox(root, inst, log); return; }
  log.push('install the Claude Code plugin (skills, guard hook, MCP server): /plugin marketplace add dmitriywind/agentic-sdlc, then /plugin install agentic-sdlc@agentic-sdlc');
  log.push('headless runs load it from the pinned package: claude -p ... --plugin-dir .agents/.cli/<ref>/node_modules/agentic-sdlc (the ref in .agents/cli.json)');
}

const GUARD = '.agents/hooks/guard.mjs';

/**
 * Without the plugin (a Claude cloud session), the plugin's review sandbox as project files: its `sdlc-reviewer` agent
 * in .claude/agents (tool and skill names as a project install has them) and its guard hook (hooks/hooks.json, the
 * script copied to .agents/hooks) merged into .claude/settings.json. The plugin's files are the one source.
 */
function reviewSandbox(root: string, inst: Installer, log: string[]) {
  const agent = readFileSync(need(inst.pkg, 'agents/sdlc-reviewer.md'), 'utf8')
    .replaceAll('mcp__plugin_agentic-sdlc_agentic-sdlc__', 'mcp__agentic-sdlc__')
    .replaceAll('agentic-sdlc:review', `${COPY_PREFIX}review`)
    .replace(/\b([Tt]he) plugin's /g, '$1 ');
  inst.put('.claude/agents/sdlc-reviewer.md', agent, 'agents/sdlc-reviewer.md');
  const hooksJson = readFileSync(need(inst.pkg, 'hooks/hooks.json'), 'utf8');
  // Every script hooks.json runs (the guard, the session-start orientation), copied to .agents/hooks.
  for (const n of new Set([...hooksJson.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([\w.-]+\.mjs)/g)].map((m) => m[1]))) inst.copy(`hooks/${n}`, `.agents/hooks/${n}`);
  const want = JSON.parse(hooksJson.replaceAll('${CLAUDE_PLUGIN_ROOT}/hooks/', '${CLAUDE_PROJECT_DIR}/.agents/hooks/'));
  const rel = '.claude/settings.json', file = join(root, rel);
  const had = existsSync(file);
  const doc = had ? parseJson(readFileSync(file, 'utf8') || '{}', rel) : {};
  let added = 0;
  for (const [event, entries] of Object.entries<any[]>(want.hooks)) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const cur: any[] = (doc.hooks ??= {})[event] ??= []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const has = (e: any) => cur.some((x) => x?.matcher === e.matcher && JSON.stringify(x.hooks) === JSON.stringify(e.hooks)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const add = entries.filter((e) => !has(e));
    cur.push(...add);
    added += add.length;
  }
  if (!added) { log.push(`kept ${rel} (the guard and session-start hooks are registered)`); return; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  log.push(`${had ? 'updated' : 'wrote'} ${rel}: the guard hook (${GUARD}) and the session-start hook`);
}

/** owner/name of a GitHub origin remote, or undefined. */
function originRepo(root: string): string | undefined {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url)?.[1];
  } catch { return undefined; }
}

/** The branch origin/HEAD names (the remote's default branch), or undefined. */
function originHead(root: string): string | undefined {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(/^origin\//, '') || undefined;
  } catch { return undefined; }
}

async function init(root: string, argv: string[], log: string[]) {
  const f = flagsOf(argv);
  const board = f.board ?? 'github-issues', forge = f.forge ?? 'github', vcs = f.vcs ?? 'git';
  const harness = f.harness ?? 'claude';
  const force = f.force === 'true';
  const profile = f.profile ?? 'individual';
  if (!ADAPTERS.board.includes(board)) throw new Error(`--board must be one of ${ADAPTERS.board.join('|')}, got '${board}'`);
  if (!['individual', 'organization'].includes(profile)) throw new Error(`--profile must be individual or organization, got '${profile}'`);
  const org = profile === 'organization';
  if (vcs !== 'git') throw new Error(`--vcs must be git (v2 supports git only), got '${vcs}'`);
  if (!FORGES.includes(forge)) throw new Error(`--forge must be one of ${FORGES.join('|')}, got '${forge}'`);
  if (harness !== 'claude') throw new Error(`--harness must be claude, got '${harness}'`);
  const pkg = packageRoot();
  const pkgJson = join(pkg, 'package.json');
  const version: string = existsSync(pkgJson) ? readJson(pkgJson).version : 'next';

  if (f.ref !== undefined && !isSha(f.ref) && !isTag(f.ref)) throw new Error(`--ref must be a 40-hex commit sha or a version tag like v${version}, got '${f.ref}'`);
  const skills = need(pkg, 'skills');
  const inst = new Installer(root, pkg, force, log);
  inst.skills('skills', '.agents/skills', true);
  // Claude Code gets skills and the MCP server from the plugin, unless --no-plugin
  // (a Claude cloud session loads no repo plugin, only .claude/skills).
  const noPlugin = (f['no-plugin'] === 'true' || (f.upgrade === 'true' && existsSync(join(root, '.claude/skills'))));
  if (noPlugin) inst.skills('skills', '.claude/skills', true);
  else for (const n of filesUnder(skills)) inst.skip(join('.claude/skills', inst.installedName(n)));
  pinCli(inst, version, f.ref, force);
  // A kept launcher keeps its mode too.
  if (inst.copy('templates/bin/agentic-sdlc', LAUNCHER)) chmodSync(join(root, LAUNCHER), 0o755);
  ignoreCliCache(root, log);
  const upgrade = existsSync(join(root, BINDING_PATH)); // a binding means paths.factory: an upgrade writes only there
  oldPinHint(root, log);
  if (noPlugin) registerMcp(pkg, root, force, log, upgrade);
  else log.push('MCP server: provided by the agentic-sdlc Claude Code plugin (use --no-plugin to write .mcp.json instead)');
  const scorers = join(pkg, 'scorers');
  if (existsSync(scorers)) {
    // Scorers are factory definition the project may tune: a locally edited file is kept unless --force.
    for (const n of filesUnder(scorers)) inst.copy(join('scorers', n), join('.agents', 'scorers', n));
  }

  const bindingFile = join(root, BINDING_PATH);
  // The binding is the project's: no flag overwrites it. To regenerate it, delete the file.
  const hadBinding = existsSync(bindingFile);
  if (hadBinding) log.push(`kept ${BINDING_PATH}`);
  else {
    const doc = parseDocument(readFileSync(need(pkg, 'templates/binding.yml'), 'utf8'));
    doc.setIn(['board', 'adapter'], board);
    doc.setIn(['forge', 'adapter'], forge);
    doc.setIn(['vcs', 'adapter'], vcs);
    doc.set('profile', profile);
    doc.setIn(['executors', 'default'], { kind: 'harness', sandbox: org ? 'container' : 'cloud' });
    if (org) {
      doc.set('traces', { uri: '.agents/runtime/traces/{run_id}.jsonl' }); // placeholder: point it at org storage
      // Two identities: the implementer's token and the review app's token.
      doc.setIn(['forge', 'options', 'token_env'], 'AGENTIC_FORGE_TOKEN');
      doc.setIn(['forge', 'options', 'review_token_env'], 'AGENTIC_REVIEW_TOKEN');
      doc.setIn(['forge', 'review_identity'], unresolvedValue('the review account or app login'));
    }
    const repo = forge === 'github' ? originRepo(root) : undefined;
    if (repo) {
      doc.setIn(['forge', 'options', 'repo'], repo);
      if (board === 'github-issues') doc.setIn(['board', 'options', 'repo'], repo);
      log.push(`set the repo ${repo} from git remote origin`);
    }
    if (board === 'local') {
      // The local board can hold the heartbeat ticket now; Cancelled keeps it out of every route.
      const hb = await createLocalBoard({ root } as AdapterContext).create({ ...HEARTBEAT, status: 'Cancelled' });
      doc.setIn(['heartbeat', 'ticket'], hb.id);
      log.push(`created heartbeat ticket ${hb.id} on the local board`);
    }
    const trunk = originHead(root);
    if (trunk) doc.setIn(['vcs', 'trunk'], trunk);
    // A paths file key whose file is not in the project is left out: the skills then read nothing there.
    const paths = doc.get('paths') as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const it of [...(paths?.items ?? [])]) {
      const k = String(it.key?.value ?? it.key), v = it.value?.toJSON?.() ?? it.value?.value;
      if (['factory', 'lane_areas', 'no_proof', 'importance_doc'].includes(k)) continue; // init writes AGENTS.md below
      const kept = [v].flat().filter((f: unknown) => typeof f === 'string' && existsSync(join(root, f)));
      if (!kept.length) paths.delete(k);
      else if (Array.isArray(v) && kept.length < v.length) paths.set(k, kept);
    }
    mkdirSync(dirname(bindingFile), { recursive: true });
    writeFileSync(bindingFile, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
    log.push(`wrote ${BINDING_PATH}`);
  }

  const gates = join(pkg, 'templates', 'gates');
  const dir = need(pkg, `templates/gates/${forge}`);
  // Continuous delivery has no release line: no release workflow, no release ruleset.
  const bound = parse(readFileSync(bindingFile, 'utf8'));
  const continuous = bound?.product?.delivery === 'continuous';
  const oneIdentity = !bound?.forge?.review_identity;
  const real = (v: unknown, d: string) => (typeof v === 'string' && v && !v.startsWith(UNRESOLVED) ? v : d); // a placeholder writes the default
  inst.bound = {
    trunk: real(bound?.vcs?.trunk, DEFAULTS.trunk), releasePrefix: real(bound?.vcs?.release_prefix, DEFAULTS.releasePrefix),
    delivery: real(bound?.product?.delivery, DEFAULTS.delivery), install: real(bound?.commands?.install, DEFAULTS.install), verify: real(bound?.commands?.verify, DEFAULTS.verify),
    ci: real(bound?.forge?.ci_workflow, DEFAULTS.ci), deployFirst: real(bound?.forge?.deploy_workflows?.[0], DEFAULTS.deployFirst), deployLast: real(bound?.forge?.deploy_workflows?.at?.(-1), DEFAULTS.deployLast),
  };
  {
    const tdir = `templates/gates/${forge}`;
    for (const n of readdirSync(dir).filter((n) => n.endsWith('.yml'))) {
      if (continuous && n === 'agentic-sdlc-release.yml') inst.skip(join('.github', 'workflows', n));
      else inst.copy(`${tdir}/${n}`, join('.github', 'workflows', n));
    }
    if (existsSync(join(dir, 'ISSUE_TEMPLATE', 'signal.yml'))) inst.copy(`${tdir}/ISSUE_TEMPLATE/signal.yml`, '.github/ISSUE_TEMPLATE/signal.yml');
    if (existsSync(join(dir, 'pull_request_template.md'))) inst.copy(`${tdir}/pull_request_template.md`, '.github/pull_request_template.md');
    if (existsSync(join(dir, 'ruleset.trunk.json'))) {
      let text = readFileSync(join(dir, 'ruleset.trunk.json'), 'utf8');
      if (oneIdentity) {
        // One identity: GitHub refuses an approving review from the CR's author, so the ruleset asks for none.
        parseJson(text, 'ruleset.trunk.json');
        text = oneIdentityRuleset(text);
      }
      inst.put('.github/rulesets/trunk.json', text, `${tdir}/ruleset.trunk.json`); // hashed as written, patch included
      log.push('import .github/rulesets/trunk.json in the repo settings (Rules > Rulesets) to protect the trunk');
      log.push(oneIdentity
        ? 'one identity: the ruleset needs no approving review and pins every required check to GitHub Actions (integration_id 15368); a Full-lane CR waits on human-approval until a collaborator approves its head or you apply forge.approval_label to it'
        : 'its CI checks are pinned to GitHub Actions (integration_id 15368); review and human-approval are posted with the review token: pin them to your review GitHub App\'s id if it is an App (a PAT cannot be pinned)');
    }
    if (continuous && existsSync(join(dir, 'ruleset.release.json'))) inst.skip('.github/rulesets/release.json');
    if (!continuous && existsSync(join(dir, 'ruleset.release.json'))) {
      inst.copy(`${tdir}/ruleset.release.json`, '.github/rulesets/release.json');
      log.push('import .github/rulesets/release.json (Rules > Rulesets) and add the release bot (app or role) as a bypass actor; set its include to your vcs.release_prefix');
    }
  }
  if (existsSync(join(gates, 'hooks', 'pre-push'))) {
    // A kept hook keeps its mode too.
    if (inst.copy('templates/gates/hooks/pre-push', '.agents/hooks/pre-push')) chmodSync(join(root, '.agents', 'hooks', 'pre-push'), 0o755);
    log.push('enable the hook with: git config core.hooksPath .agents/hooks');
  }
  const setup = join(pkg, 'templates', 'runner', 'setup.sh');
  if (existsSync(setup)) inst.copy('templates/runner/setup.sh', '.agents/runner-setup.sh');

  for (const n of ['cycle-prompt.md', 'review-prompt.md']) {
    const prompt = join(pkg, 'templates', 'runner', n);
    if (existsSync(prompt)) inst.copy(`templates/runner/${n}`, join('.agents', n));
  }

  const agents = join(root, 'AGENTS.md');
  const cur = existsSync(agents) ? readFileSync(agents, 'utf8') : '';
  const s = cur.indexOf(START), e = cur.indexOf(END);
  const next = s >= 0 && e > s ? cur.slice(0, s) + POINTER + cur.slice(e + END.length) : (cur ? cur.replace(/\n*$/, '\n\n') : '') + POINTER + '\n';
  const agentsChanged = next !== cur && !upgrade;
  if (agentsChanged) { writeFileSync(agents, next); log.push('updated AGENTS.md'); }
  else if (next !== cur) log.push('kept AGENTS.md: its agentic-sdlc block differs from this release; update it in a product change');
  claudeSetup(root, inst, log, noPlugin, upgrade);
  inst.finish();
  const missing = missingKeysLine(missingBindingKeys(readFileSync(need(pkg, 'templates/binding.yml'), 'utf8'), readFileSync(bindingFile, 'utf8')));
  if (missing) log.push(missing);
  const open = unresolved(parse(readFileSync(bindingFile, 'utf8')));
  if (open.length) log.push(`next: ${open.length} binding value${open.length === 1 ? ' is' : 's are'} unresolved (${open.map((u) => u.key).join(', ')}); run the setup skill, or read agentic-sdlc validate --json`);
  const c = inst.counts;
  log.push(`install: ${c.wrote} new, ${c.updated} updated, ${c.kept} kept (differ from every released version), ${c.stale} stale${c.removed ? `, ${c.removed} removed` : ''}`);
  const changed = c.wrote + c.updated + c.removed > 0 || agentsChanged;
  if (hadBinding && !changed) log.push(c.kept ? `install: nothing to update; ${c.kept} kept (differ from every released version)` : 'install: up to date');
  else if (hadBinding) log.push('upgrade: review the kept files, then run .agents/bin/agentic-sdlc validate and .agents/bin/agentic-sdlc doctor (the first call installs the pinned CLI)');
}

/** Binding problems plus skill problems (the loader's); skill warnings go into `warnings`. */
export function validate(root: string, warnings: string[] = []): string[] {
  const problems: string[] = [];
  let binding: any;
  try { binding = loadBinding(root); problems.push(...validateBinding(binding)); } catch (e) { problems.push((e as Error).message); }
  const dir = join(root, '.agents', 'skills');
  if (!existsSync(dir)) return [...problems, '.agents/skills is missing'];
  const pack = readSkills(dir);
  problems.push(...pack.errors.map((m) => `skill ${m}`));
  warnings.push(...pack.warnings.map((m) => `skill ${m}`));
  // An executors key names a step or a skill (or default); any other name only serves bench --executor.
  const targets = scorerTargets(pack);
  for (const k of Object.keys(binding?.executors ?? {})) {
    if (k === 'default' || targets.has(k)) continue;
    warnings.push(`executors.${k} names no step or skill, so no dispatch uses it (bench --executor ${k} still does)`);
  }
  return problems;
}

/** Env var names the binding gives under any `*_env` key: their values are secrets whatever the name says. */
const envNames = (x: unknown, out: string[] = []): string[] => {
  if (x && typeof x === 'object')
    for (const [k, v] of Object.entries(x)) { if (/_env$/.test(k) && typeof v === 'string') out.push(v); else envNames(v, out); }
  return out;
};
export const redact = (msg: string, env: NodeJS.ProcessEnv, named: string[] = []) => {
  for (const [k, v] of Object.entries(env)) if (v && v.length >= 8 && (named.includes(k) || /TOKEN|KEY|SECRET|PASS|AUTH|PAT$/i.test(k))) msg = msg.replaceAll(v, '***');
  return msg;
};
/** A failed command's message is "Command failed: <cmd>" then its stderr: keep the first stderr line, which says why. */
const firstLines = (msg: string) => {
  const [head, ...more] = msg.split('\n').map((l) => l.trim()).filter(Boolean);
  return more.length && /^Command failed/.test(head) ? `${head} (${more[0]})` : head ?? '';
};

/** One line for a failed doctor probe: why it failed, with no secret in it. */
export const probeFailure = (msg: string, env: NodeJS.ProcessEnv, binding: unknown) => firstLines(redact(msg, env, envNames(binding)));

/** Trunk rules: required checks exist and each is pinned to the app that posts it. */
export function trunkProtection(b: any, ctx: any): string[] {
  const repo = b.forge.options?.repo;
  const reminder = 'warn: pin each required check to the CI integration that posts it, so no other token can post it';
  if (!repo) return ['trunk protection: check manually', reminder];
  const open = `warn: trunk protection: ${b.vcs.trunk} has no enforced ruleset or branch protection, so no gate blocks a merge (a private repo on GitHub Free cannot enforce one)`;
  let rules: any[];
  try { rules = JSON.parse(ctx.exec('gh', ['api', `repos/${repo}/rules/branches/${b.vcs.trunk}`])); }
  catch (e) {
    if (/Upgrade to GitHub Pro/.test((e as Error).message)) return [open];
    return ['trunk protection: check manually (cannot read the trunk rules)', reminder];
  }
  if (!rules.length) {
    let classic = false;
    try { classic = ctx.exec('gh', ['api', `repos/${repo}/branches/${b.vcs.trunk}`, '--jq', '.protected']).trim() === 'true'; } catch { /* read as unprotected */ }
    return classic ? ['trunk protection: classic branch protection is on; check its required checks manually', reminder] : [open];
  }
  const checks = rules.filter((r) => r.type === 'required_status_checks').flatMap((r) => r.parameters?.required_status_checks ?? []);
  if (!checks.length) return ['fail trunk protection: no required status checks'];
  const loose = checks.filter((c: any) => !c.integration_id).map((c: any) => c.context);
  return ['ok   trunk protection: required checks block merge',
    ...(loose.length ? [`warn: required checks not pinned to an app (integration_id): ${loose.join(', ')}; any token with status access can post them`] : [])];
}

/** A classic implementer token with repo scope can post any commit status, so only pinned checks stop it. */
export function implementerToken(b: any, ctx: { env?: Record<string, string | undefined>; exec: (c: string, a: string[], o?: any) => string }): string | undefined {
  const name = b.forge.options?.token_env;
  const token = name ? ctx.env?.[name] : undefined;
  let head: string;
  try { head = ctx.exec('gh', ['api', '-i', 'user'], token ? { env: { ...ctx.env, GH_TOKEN: token } } : {}); }
  catch { return undefined; } // forge.list reports the failure
  const scopes = /^x-oauth-scopes:(.*)$/im.exec(head)?.[1].split(',').map((s) => s.trim()) ?? [];
  const wide = scopes.filter((s) => s === 'repo' || s === 'repo:status');
  return wide.length
    ? `warn: the implementer token (${name ?? 'gh login'}) has scope ${wide.join(', ')}, so code a cycle runs can post commit statuses; use a fine-grained token with Commit statuses: no access, and pin every required check to its app`
    : undefined;
}

/**
 * The runner variables the GitHub templates read: AGENTIC_RUNS_ON for jobs that run CR or agent code,
 * AGENTIC_RUNS_ON_TRUSTED for jobs that hold secrets. A self-hosted runner on a public repo runs a fork's
 * code on your machine; one runner for both kinds lets CR code read what the secret jobs leave behind.
 */
export function selfHostedRunner(b: any, ctx: { exec: (c: string, a: string[], o?: any) => string }): string | undefined {
  const repo = b.forge.options?.repo;
  if (!repo) return undefined;
  let vars: Record<string, string>;
  let visibility: string;
  try {
    vars = Object.fromEntries((JSON.parse(ctx.exec('gh', ['variable', 'list', '-R', repo, '--json', 'name,value'])) as { name: string; value: string }[]).map((v) => [v.name, v.value]));
    visibility = ctx.exec('gh', ['api', `repos/${repo}`, '--jq', '.visibility']).trim();
  } catch { return undefined; } // forge.list reports access problems
  const code = vars.AGENTIC_RUNS_ON ?? '', trusted = vars.AGENTIC_RUNS_ON_TRUSTED ?? code;
  if (![code, trusted].some((v) => v.includes('self-hosted'))) return undefined;
  if (visibility === 'public') return 'fail runner: a self-hosted runner on a public repo runs fork code on your machine; use GitHub-hosted runners';
  if (code.includes('self-hosted') && trusted === code) return 'warn: runner: CR code and the secret jobs share one self-hosted runner; set AGENTIC_RUNS_ON_TRUSTED to a separate runner (see docs/platform.md, Self-hosted runners)';
  return `ok   runner: self-hosted, code on ${code || 'ubuntu-latest'}, secrets on ${trusted || 'ubuntu-latest'}`;
}

/** A github-issues board with field_ids: every mapped id is an org issue field and the status field has every board status. */
export function issueFields(b: any, ctx: { exec: (c: string, a: string[], o?: any) => string; env: Record<string, string | undefined> }): string[] {
  const ids: Record<string, number> | undefined = b.board?.adapter === 'github-issues' ? b.board.options?.field_ids : undefined;
  if (!ids || typeof ids !== 'object') return [];
  if (ctx.env.CLAUDE_CODE_REMOTE === 'true') return ['info board field_ids: not checked in a Claude cloud session (orgs/* is not reachable); run doctor where gh reaches the org'];
  const org = String(b.board.options.repo).split('/')[0];
  let defs: { id: number; name: string; options?: { name: string }[] }[];
  try { defs = JSON.parse(ctx.exec('gh', ['api', '-H', 'X-GitHub-Api-Version: 2026-03-10', `orgs/${org}/issue-fields?per_page=100`])); }
  catch (e) { return [`fail board field_ids: cannot read orgs/${org}/issue-fields (${(e as Error).message.split('\n')[0]})`]; }
  const bad: string[] = [];
  for (const [k, id] of Object.entries(ids)) if (!defs.some((d) => d.id === id)) bad.push(`${k} ${id} is not an issue field of ${org}`);
  const st = defs.find((d) => d.id === ids.status);
  const lacks = st ? (b.board.statuses ?? []).filter((s: string) => !(st.options ?? []).some((o) => o.name === s)) : [];
  if (lacks.length) bad.push(`the status field '${st!.name}' lacks the options ${lacks.join(', ')}`);
  if (!bad.length) return [`ok   board field_ids: every id is an issue field of ${org}`];
  // The map the org's field names suggest: Status or Stage for the status, the board.fields name for each field.
  const want: Record<string, number> = {};
  const named: [string, string][] = [['status', ''], ...Object.entries<string>(b.board.fields ?? {})];
  for (const [k, name] of named) {
    const d = defs.find((x) => (k === 'status' ? /^(status|stage)$/i.test(x.name) : x.name.toLowerCase() === name.toLowerCase()));
    if (d) want[k] = d.id;
  }
  return [`fail board field_ids: ${bad.join('; ')}; by name the org has field_ids: { ${Object.entries(want).map(([k, v]) => `${k}: ${v}`).join(', ')} }`];
}

/** The stock delivery workflow's push branches must name this project's trunk and release lines. */
export function deliveryWorkflow(b: any, root: string): string | undefined {
  const f = join(root, '.github', 'workflows', 'agentic-sdlc-delivery.yml');
  if (!existsSync(f)) return undefined;
  const wf = parse(readFileSync(f, 'utf8'));
  const br: string[] = wf?.on?.push?.branches ?? [];
  if (!br.includes(b.vcs.trunk))
    return `fail delivery workflow: push branches ${br.join(', ')} do not name trunk ${b.vcs.trunk}; edit its 'set:' lines`;
  const delivery = b.product?.delivery ?? 'release-line';
  const want: [string, string, string][] = [['TRUNK', 'vcs.trunk', b.vcs.trunk], ['DELIVERY', 'product.delivery', delivery]];
  if (delivery === 'release-line') want.push(['RELEASE_PREFIX', 'vcs.release_prefix', b.vcs.release_prefix]);
  for (const [k, key, v] of want)
    if (wf?.env?.[k] !== v) return `fail delivery workflow: env.${k} is '${wf?.env?.[k] ?? ''}', not ${key} '${v}'; edit its 'set:' lines`;
  return `ok   delivery workflow: names trunk ${b.vcs.trunk}`;
}

/** An installed agentic-sdlc workflow whose `uses:` is not a 40-hex commit SHA (a tag can move). Local read only. */
export function unpinnedActions(root: string): string | undefined {
  const dir = join(root, '.github', 'workflows');
  if (!existsSync(dir)) return undefined;
  const bad = readdirSync(dir).filter((n) => /^agentic-sdlc-.*\.ya?ml$/.test(n)).flatMap((n) =>
    [...readFileSync(join(dir, n), 'utf8').matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)]
      .map((m) => m[1]!).filter((u) => !u.startsWith('./') && !/@[0-9a-f]{40}$/.test(u)).map((u) => `${n}: ${u}`));
  return bad.length ? `warn workflow actions: not pinned to a commit SHA (${[...new Set(bad)].join(', ')}); a tag can move, so let Dependabot's github-actions ecosystem pin them` : undefined;
}

/** The CLI pin: .agents/cli.json parses, its ref is a commit sha (immutable) or a version tag (can move), and the launcher is executable. */
export function cliPin(root: string): string[] {
  const out: string[] = [];
  const file = join(root, CLI_PIN);
  if (!existsSync(file)) out.push(`fail cli pin: ${CLI_PIN} is missing; run agentic-sdlc init`);
  else {
    let pin: any;
    try { pin = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { out.push(`fail cli pin: ${CLI_PIN} is not valid JSON (${(e as Error).message})`); }
    if (pin !== undefined && (!pin || typeof pin !== 'object' || Array.isArray(pin))) out.push(`fail cli pin: ${CLI_PIN} is not a JSON object`);
    else if (pin) {
      if (typeof pin.package !== 'string' || !pin.package) out.push(`fail cli pin: ${CLI_PIN} has no package`);
      if (isSha(pin.ref)) out.push(`ok   cli pin: ${pin.package} at commit ${String(pin.ref).slice(0, 12)}`);
      else if (isTag(pin.ref)) out.push(`warn: cli pin: ref ${pin.ref} is a tag, and a tag can move; pin a commit sha (agentic-sdlc init --ref <sha>)`);
      else out.push(`fail cli pin: ref '${pin.ref ?? ''}' in ${CLI_PIN} is neither a 40-hex commit sha nor a version tag like v1.2.3`);
    }
  }
  const launcher = join(root, LAUNCHER);
  if (!existsSync(launcher)) out.push(`fail cli pin: ${LAUNCHER} is missing; run agentic-sdlc init`);
  else if (process.platform !== 'win32' && !(statSync(launcher).mode & 0o111)) out.push(`fail cli pin: ${LAUNCHER} is not executable; chmod +x ${LAUNCHER}`);
  return out;
}

/** Each paths.* file key (not a glob key) whose file is missing from the project root: the skills read nothing there. */
export function pathWarnings(root: string, b: Binding): string[] {
  const paths = ((b as any)?.paths ?? {}) as Record<string, unknown>;
  return Object.entries(paths)
    .filter(([k, v]) => !['factory', 'lane_areas', 'no_proof'].includes(k) && typeof v === 'string' && v && !existsSync(join(root, v)))
    .map(([k, v]) => `paths.${k} names ${v}, which does not exist in the project; the skills will read nothing there`);
}

/** Called with the group name as the first element: init | validate | doctor. */
export const cli: PortCli = async (argv, ctx) => {
  const [verb, ...rest] = argv;
  const out = (s: string) => console.log(s);
  try {
    if (verb === 'init') {
      const log: string[] = [];
      await init(ctx.root, rest, log);
      log.forEach(out);
      return 0;
    }
    if (verb === 'validate' || verb === 'doctor') {
      const json = rest[0] === '--json' && verb === 'validate';
      if (rest.length && !json) { console.error(`usage: agentic-sdlc ${verb}${verb === 'validate' ? ' [--json]' : ''}`); return 2; }
      const warnings: string[] = [];
      const problems = validate(ctx.root, warnings);
      try { { const lb = loadBinding(ctx.root); warnings.push(...bindingWarnings(lb), ...pathWarnings(ctx.root, lb)); } } catch { /* reported as a problem */ }
      if (json) {
        // One machine-readable call for the setup skill: what is wrong, what is doubtful, what init could not know.
        let open: { key: string; hint: string }[] = [];
        try { open = unresolved(loadBinding(ctx.root)); } catch { /* no binding: a problem */ }
        out(JSON.stringify({ ok: !problems.length, problems: problems.filter((p) => !/ is unresolved: /.test(p)), warnings, unresolved: open, missing: missingKeys(ctx.root) }, null, 2));
        return problems.length ? 1 : 0;
      }
      problems.forEach((p) => console.error(`problem: ${p}`));
      warnings.forEach((m) => console.error(`warn: ${m}`));
      const info = missingKeysLine(missingKeys(ctx.root));
      if (info) out(info);
      if (problems.length) return 1;
      out('validate: ok');
      if (verb === 'validate') return 0;
      const binding = loadBinding(ctx.root);
      const c = { ...ctx, binding };
      const probes: [string, () => Promise<unknown>][] = [
        ['board.list', () => createBoard({ ...c, options: binding.board.options }).list()],
        ['forge.list', () => createForge({ ...c, options: binding.forge.options }).list({ checks: true, limit: 1 })],
        ['vcs.head', () => createVcs({ ...c, options: binding.vcs.options ?? {} }).head()],
      ];
      let bad = 0;
      for (const l of issueFields(binding, ctx)) { out(l); if (l.startsWith('fail')) bad++; }
      trunkProtection(binding, ctx).forEach(out);
      const it = implementerToken(binding, ctx);
      if (it) out(it);
      const rn = selfHostedRunner(binding, ctx);
      if (rn) { out(rn); if (rn.startsWith('fail')) bad++; }
      const dw = deliveryWorkflow(binding, ctx.root);
      if (dw) { out(dw); if (dw.startsWith('fail')) bad++; }
      const ua = unpinnedActions(ctx.root);
      if (ua) out(ua);
      for (const l of cliPin(ctx.root)) { out(l); if (l.startsWith('fail')) bad++; }
      for (const [name, run] of probes) {
        try { await run(); out(`ok   ${name}`); }
        catch (e) {
          bad++; out(`fail ${name}: ${probeFailure((e as Error).message, ctx.env, binding)}`);
        }
      }
      return bad ? 1 : 0;
    }
    console.error('usage: agentic-sdlc init [--board ...] [--forge github] [--vcs git] [--harness claude] [--profile individual|organization] [--no-plugin] [--upgrade] [--force] | validate [--json] | doctor');
    return 2;
  } catch (e) {
    console.error(redact((e as Error).message, ctx.env));
    return 1;
  }
};

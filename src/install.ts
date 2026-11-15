// init / validate / doctor.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { ADAPTERS, BINDING_PATH, bindingWarnings, loadBinding, validateBinding } from './binding.ts';
import { createBoard } from './board/index.ts';
import { createForge } from './forge/index.ts';
import { createVcs } from './vcs/index.ts';
import { createLocalBoard } from './board/local.ts';
import type { AdapterContext, PortCli } from './ports.ts';

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

const INIT_FLAGS = ['board', 'forge', 'vcs', 'harness', 'profile', 'force', 'upgrade', 'no-plugin'];
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

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const posix = (p: string) => p.replaceAll('\\', '/');

/**
 * Every file init installs from the package, tracked in one lock: the hash of each file as written.
 * A file still at its recorded hash follows the package; one edited since is kept unless --force.
 * A file that exists with no lock entry (an install from before the lock) counts as edited unless it equals the package's.
 */
class Installer {
  lock: Record<string, string> = {};
  offered = new Set<string>();
  counts = { wrote: 0, updated: 0, kept: 0, stale: 0 };
  root: string; pkg: string; force: boolean; log: string[];
  constructor(root: string, pkg: string, force: boolean, log: string[]) {
    this.root = root; this.pkg = pkg; this.force = force; this.log = log;
    for (const f of [LEGACY_LOCK, INSTALL_LOCK]) {
      const file = join(root, f);
      if (existsSync(file)) Object.assign(this.lock, readJson(file));
    }
  }
  /** Install `data` at `rel`. `src` is the package file it comes from (named when a local edit is kept). `quiet` hides wrote/updated lines. */
  put(rel: string, data: string | Buffer, src?: string, quiet = false) {
    rel = posix(rel);
    this.offered.add(rel);
    const to = join(this.root, rel), want = sha(data);
    let how = 'wrote';
    if (existsSync(to)) {
      const have = sha(readFileSync(to));
      if (have === want) { this.lock[rel] = want; return; }
      if (have === this.lock[rel]) how = 'updated';
      else if (this.force) how = 'overwrote';
      else {
        this.counts.kept++;
        this.log.push(`kept ${rel} (local edits; ${src ? `see ${join(this.pkg, src)} for the new version` : '--force regenerates it'})`);
        return;
      }
    }
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, data);
    this.lock[rel] = want;
    if (how === 'wrote') this.counts.wrote++; else this.counts.updated++;
    if (!quiet) this.log.push(`${how} ${rel}`);
  }
  /** Install the package file `src` (relative to the package) at `rel`. */
  copy(src: string, rel: string, quiet = false) { this.put(rel, readFileSync(join(this.pkg, src)), src, quiet); }
  /** Name a file this run does not install (by choice of binding or harness) so it is not reported as stale. */
  skip(rel: string) { this.offered.add(posix(rel)); }
  /** Copy the skill pack into `dest`. */
  skills(src: string, dest: string) {
    const before = this.counts.wrote + this.counts.updated;
    for (const f of filesUnder(join(this.pkg, src))) this.copy(join(src, f), join(dest, f), true);
    const n = this.counts.wrote + this.counts.updated - before;
    this.log.push(`wrote ${dest} (${n} file${n === 1 ? '' : 's'} updated)`);
  }
  /** Report files the package no longer ships, then save the lock. Nothing is deleted. */
  finish() {
    for (const rel of Object.keys(this.lock).sort()) {
      if (this.offered.has(rel)) continue;
      if (!existsSync(join(this.root, rel))) { delete this.lock[rel]; continue; }
      this.counts.stale++;
      this.log.push(`stale ${rel}: no longer part of the package`);
    }
    const file = join(this.root, INSTALL_LOCK);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(this.lock).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2) + '\n');
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
    else if (isMap(v) && isMap(b[k])) for (const k2 of Object.keys(v)) if (!(k2 in (b[k] as object))) out.push(`${k}.${k2}`);
  }
  return out;
}
const missingKeysLine = (keys: string[]) => keys.length ? `info: binding keys in the template that this binding does not set: ${keys.join(', ')}` : undefined;

const MCP_FILES = new Map<string, string | null>([
  ['claude', '.mcp.json'], ['cursor', '.cursor/mcp.json'], ['codex', '.codex/config.toml'], ['generic', null],
]);

/** Register the agentic-sdlc stdio server in the harness's project MCP file, keeping other servers. */
function registerMcp(pkg: string, root: string, harness: string, args: string[], force: boolean, log: string[]) {
  let snippet = readFileSync(need(pkg, `templates/mcp/${harness === 'codex' ? 'codex.toml' : harness + '.json'}`), 'utf8');
  if (harness === 'codex') snippet = snippet.replace(/^args = .*$/m, `args = ${JSON.stringify(args)}`);
  else { const j = JSON.parse(snippet); j.mcpServers['agentic-sdlc'].args = args; snippet = JSON.stringify(j, null, 2) + '\n'; }
  const rel = MCP_FILES.get(harness);
  if (!rel) { log.push(`add this MCP server to your harness config:\n${snippet.trim()}`); return; }
  const file = join(root, rel);
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  let next: string;
  if (harness === 'codex') {
    if (/^\[mcp_servers\.("?)agentic-sdlc\1\]/m.test(cur)) { log.push(`kept ${rel}`); return; }
    next = (cur ? cur.replace(/\n*$/, '\n\n') : '') + snippet;
  } else {
    const want = JSON.parse(snippet);
    const doc = cur.trim() ? parseJson(cur, rel) : {};
    // The project may have tuned its entry (args, env): keep it unless --force.
    if (doc.mcpServers?.['agentic-sdlc'] && !force) { log.push(`kept ${rel}`); return; }
    doc.mcpServers = { ...doc.mcpServers, ...want.mcpServers };
    next = JSON.stringify(doc, null, 2) + '\n';
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next);
  log.push(`wrote ${rel}`);
}

/** The CLI ships from Git only: the npm name agentic-sdlc belongs to another package. */
const gitSpec = (version: string) => `github:dmitriywind/agentic-sdlc#v${version}`;
/** npm 12 refuses git dependencies unless allow-git permits them; root allows this direct one, not transitive ones. */
const ALLOW_GIT = '--allow-git=root';

/** Write allow-git=root to the project's .npmrc, so npm install and npm ci fetch the pinned CLI. */
function allowGit(root: string, log: string[]) {
  const file = join(root, '.npmrc');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/^\s*allow-git\s*=/m.test(text)) return;
  writeFileSync(file, text + (text && !text.endsWith('\n') ? '\n' : '') + 'allow-git=root\n');
  log.push('set allow-git=root in .npmrc (npm 12 refuses git dependencies by default)');
}

/** Pin this CLI as the project's devDependency, so CI, hooks and MCP run one known version. True when pinned. */
function pinCli(root: string, version: string, force: boolean, log: string[]): boolean {
  const file = join(root, 'package.json');
  if (!existsSync(file)) {
    log.push(`pin the CLI so CI and MCP run one version: npm i -D ${ALLOW_GIT} ${gitSpec(version)}`);
    return false;
  }
  const text = readFileSync(file, 'utf8');
  const doc = parseJson(text, 'package.json');
  allowGit(root, log);
  const have: string | undefined = doc.devDependencies?.['agentic-sdlc'];
  // A pin this init wrote for another version follows the package; any other spec (a fork, a sha, a path) is the project's choice.
  const ours = have !== undefined && /^github:dmitriywind\/agentic-sdlc#v\d/.test(have);
  if (have === gitSpec(version) || (have && !ours && !force)) { log.push('kept devDependencies.agentic-sdlc in package.json'); return true; }
  doc.devDependencies = { ...doc.devDependencies, 'agentic-sdlc': gitSpec(version) };
  const indent = /^[ \t]+/m.exec(text)?.[0] ?? '  ';
  writeFileSync(file, JSON.stringify(doc, null, indent) + '\n');
  log.push(`set devDependencies.agentic-sdlc=${gitSpec(version)} in package.json: run npm install`);
  return true;
}

/** Claude Code: tier subagents from binding.models, and CLAUDE.md importing AGENTS.md. Skills come from the plugin. */
function claudeSetup(root: string, inst: Installer, log: string[], noPlugin: boolean) {
  let models: Record<string, string> = {};
  try { models = parse(readFileSync(join(root, BINDING_PATH), 'utf8'))?.models ?? {}; } catch { /* reported by validate */ }
  for (const tier of TIERS) {
    const rel = `.claude/agents/sdlc-${tier}.md`;
    const model = !models[tier] || /^your-/.test(models[tier]) ? 'inherit' : models[tier]; // template placeholder: the session's model
    inst.put(rel, `---
name: sdlc-${tier}
description: Runs one agentic-sdlc skill step whose metadata.tier is ${tier}. The sdlc skill hands a step to this agent when the step's skill is at the ${tier} tier.
model: ${model}
---

You run one step of the agentic-sdlc process at the ${tier} tier. Invoke the skill your task names
(\`/agentic-sdlc:<skill>\`; without the plugin, read \`.agents/skills/<skill>/SKILL.md\`), follow it to
its last Done when, and report the result and the evidence. Call the CLI as \`npx --no agentic-sdlc ...\`.
Do not start subagents.
`);
  }
  const file = join(root, 'CLAUDE.md');
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/^@AGENTS\.md\s*$/m.test(cur)) log.push('kept CLAUDE.md (imports @AGENTS.md)');
  else {
    writeFileSync(file, (cur ? cur.replace(/\n*$/, '\n\n') : '') + '@AGENTS.md\n');
    log.push(cur ? 'appended @AGENTS.md to CLAUDE.md' : 'wrote CLAUDE.md (@AGENTS.md)');
  }
  if (noPlugin) return;
  log.push('install the Claude Code plugin (skills, guard hook, MCP server): /plugin marketplace add dmitriywind/agentic-sdlc, then /plugin install agentic-sdlc@agentic-sdlc');
  log.push('headless runs load it from the pinned package: claude -p ... --plugin-dir node_modules/agentic-sdlc');
}

/** owner/name of a GitHub origin remote, or undefined. */
function originRepo(root: string): string | undefined {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url)?.[1];
  } catch { return undefined; }
}

async function init(root: string, argv: string[], log: string[]) {
  const f = flagsOf(argv);
  const board = f.board ?? 'github', forge = f.forge ?? 'github', vcs = f.vcs ?? 'git', harness = f.harness ?? 'generic';
  const force = f.force === 'true';
  const profile = f.profile ?? 'individual';
  if (!ADAPTERS.board.includes(board)) throw new Error(`--board must be one of ${ADAPTERS.board.join('|')}, got '${board}'`);
  if (!['individual', 'individual-api', 'organization'].includes(profile)) throw new Error(`--profile must be individual, individual-api or organization, got '${profile}'`);
  const org = profile === 'organization';
  if (vcs !== 'git') throw new Error(`--vcs must be git (v2 supports git only), got '${vcs}'`);
  if (!FORGES.includes(forge)) throw new Error(`--forge must be one of ${FORGES.join('|')}, got '${forge}'`);
  if (!MCP_FILES.has(harness)) throw new Error(`--harness must be one of ${[...MCP_FILES.keys()].join('|')}, got '${harness}'`);
  const pkg = packageRoot();
  const pkgJson = join(pkg, 'package.json');
  const version: string = existsSync(pkgJson) ? readJson(pkgJson).version : 'next';

  if (existsSync(join(root, 'package.json'))) readJson(join(root, 'package.json')); // fail before anything is written
  const skills = need(pkg, 'skills');
  const inst = new Installer(root, pkg, force, log);
  inst.skills('skills', '.agents/skills');
  // Claude Code gets skills and the MCP server from the plugin, unless --no-plugin
  // (a Claude cloud session loads no repo plugin, only .claude/skills).
  const noPlugin = harness === 'claude' && f['no-plugin'] === 'true';
  if (noPlugin) inst.skills('skills', '.claude/skills');
  else for (const n of filesUnder(skills)) inst.skip(join('.claude/skills', n));
  const pinned = pinCli(root, version, force, log);
  const pinMoved = log.some((l) => l.startsWith('set devDependencies.agentic-sdlc='));
  if (harness !== 'claude' || noPlugin) registerMcp(pkg, root, harness, pinned ? ['--no-install', 'agentic-sdlc', 'mcp'] : ['-y', ALLOW_GIT, gitSpec(version), 'mcp'], force, log);
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
      doc.setIn(['forge', 'review_identity'], 'your-review-app[bot]');
    }
    const repo = forge === 'github' ? originRepo(root) : undefined;
    if (repo) {
      doc.setIn(['forge', 'options', 'repo'], repo);
      if (board === 'github-issues') doc.setIn(['board', 'options', 'repo'], repo);
      log.push(`set the repo ${repo} from git remote origin`);
    }
    if (board === 'local') {
      // The local board can hold the heartbeat ticket now; Cancelled keeps it out of every route.
      const hb = await createLocalBoard({ root } as AdapterContext).create({ title: 'Heartbeat', body: 'agentic-sdlc heartbeat comments. Not a ticket.', status: 'Cancelled' });
      doc.setIn(['heartbeat', 'ticket'], hb.id);
      log.push(`created heartbeat ticket ${hb.id} on the local board`);
    } else log.push('create the heartbeat ticket on the board and put its id in heartbeat.ticket');
    mkdirSync(dirname(bindingFile), { recursive: true });
    writeFileSync(bindingFile, String(doc));
    log.push(`wrote ${BINDING_PATH}`);
  }

  const gates = join(pkg, 'templates', 'gates');
  const dir = need(pkg, `templates/gates/${forge}`);
  // Continuous delivery has no release line: no release workflow, no release ruleset.
  const bound = parse(readFileSync(bindingFile, 'utf8'));
  const continuous = bound?.product?.delivery === 'continuous';
  const oneIdentity = !bound?.forge?.review_identity;
  {
    const tdir = `templates/gates/${forge}`;
    for (const n of readdirSync(dir).filter((n) => n.endsWith('.yml'))) {
      if (continuous && n === 'agentic-sdlc-release.yml') inst.skip(join('.github', 'workflows', n));
      else inst.copy(`${tdir}/${n}`, join('.github', 'workflows', n));
    }
    if (existsSync(join(dir, 'pull_request_template.md'))) inst.copy(`${tdir}/pull_request_template.md`, '.github/pull_request_template.md');
    if (existsSync(join(dir, 'ruleset.trunk.json'))) {
      let text = readFileSync(join(dir, 'ruleset.trunk.json'), 'utf8');
      if (oneIdentity) {
        // One identity: GitHub refuses an approving review from the CR's author, so the ruleset asks for none.
        const rs = parseJson(text, 'ruleset.trunk.json');
        for (const r of rs.rules) if (r.type === 'pull_request') Object.assign(r.parameters, { required_approving_review_count: 0, require_last_push_approval: false });
        // CI posts review (gate review) and human-approval with the Actions token: pin them to Actions too.
        for (const r of rs.rules) if (r.type === 'required_status_checks')
          for (const c of r.parameters.required_status_checks) if (['review', 'human-approval'].includes(c.context)) c.integration_id = 15368;
        text = JSON.stringify(rs, null, 2) + '\n';
      }
      inst.put('.github/rulesets/trunk.json', text, `${tdir}/ruleset.trunk.json`); // hashed as written, patch included
      log.push('import .github/rulesets/trunk.json in the repo settings (Rules > Rulesets) to protect the trunk');
      log.push(oneIdentity
        ? 'one identity: the ruleset needs no approving review and pins every required check to GitHub Actions (integration_id 15368); a Full-lane CR waits on human-approval until a collaborator approves it or you merge it as admin'
        : 'its CI checks are pinned to GitHub Actions (integration_id 15368); review and human-approval are posted with the review token: pin them to your review GitHub App\'s id if it is an App (a PAT cannot be pinned)');
    }
    if (continuous && existsSync(join(dir, 'ruleset.release.json'))) inst.skip('.github/rulesets/release.json');
    if (!continuous && existsSync(join(dir, 'ruleset.release.json'))) {
      inst.copy(`${tdir}/ruleset.release.json`, '.github/rulesets/release.json');
      log.push('import .github/rulesets/release.json (Rules > Rulesets) and add the release bot (app or role) as a bypass actor; set its include to your vcs.release_prefix');
    }
  }
  if (existsSync(join(gates, 'hooks', 'pre-push'))) {
    inst.copy('templates/gates/hooks/pre-push', '.agents/hooks/pre-push');
    chmodSync(join(root, '.agents', 'hooks', 'pre-push'), 0o755);
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
  if (next !== cur) writeFileSync(agents, next);
  const agentsChanged = next !== cur;
  log.push('updated AGENTS.md');
  if (harness === 'claude') claudeSetup(root, inst, log, noPlugin);
  else for (const tier of TIERS) inst.skip(`.claude/agents/sdlc-${tier}.md`);
  inst.finish();
  const missing = missingKeysLine(missingBindingKeys(readFileSync(need(pkg, 'templates/binding.yml'), 'utf8'), readFileSync(bindingFile, 'utf8')));
  if (missing) log.push(missing);
  const c = inst.counts;
  log.push(`install: ${c.wrote} new, ${c.updated} updated, ${c.kept} kept with local edits, ${c.stale} stale`);
  const changed = c.wrote + c.updated > 0 || pinMoved || agentsChanged;
  if (hadBinding && !changed) log.push('install: up to date');
  else if (hadBinding) log.push('upgrade: run npm install to fetch the pinned CLI, review the kept files, then run agentic-sdlc validate and agentic-sdlc doctor');
}

/** Binding problems plus skill frontmatter problems; skill warnings go into `warnings`. */
export function validate(root: string, warnings: string[] = []): string[] {
  const problems: string[] = [];
  try { problems.push(...validateBinding(loadBinding(root))); } catch (e) { problems.push((e as Error).message); }
  const dir = join(root, '.agents', 'skills');
  if (!existsSync(dir)) return [...problems, '.agents/skills is missing'];
  for (const name of readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory())) {
    const file = join(dir, name, 'SKILL.md');
    if (!existsSync(file)) { problems.push(`skill ${name}: SKILL.md is missing`); continue; }
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
    let fm: any = {};
    try { fm = m ? parse(m[1]) : {}; } catch { /* reported below */ }
    for (const k of ['name', 'description']) if (!fm?.[k]) problems.push(`skill ${name}: frontmatter lacks '${k}'`);
    if (!fm?.metadata?.tier && !fm?.tier) problems.push(`skill ${name}: frontmatter lacks 'metadata.tier'`);
    if (fm?.tier !== undefined) warnings.push(`skill ${name}: top-level 'tier' breaks claude.ai upload and the Skills API; move it to metadata: { tier: ${fm.tier} }`);
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
  if (code.includes('self-hosted') && trusted === code) return 'warn: runner: CR code and the secret jobs share one self-hosted runner; set AGENTIC_RUNS_ON_TRUSTED to a separate runner (see docs/forges.md, Self-hosted runners)';
  return `ok   runner: self-hosted, code on ${code || 'ubuntu-latest'}, secrets on ${trusted || 'ubuntu-latest'}`;
}

/** A Claude cloud session reaches only `repos/{owner}/{repo}/...` REST: no GraphQL, so no GitHub Projects. */
export function cloudBoard(b: any, env: Record<string, string | undefined> = {}): string | undefined {
  if (b.board?.adapter !== 'github' || env.CLAUDE_CODE_REMOTE !== 'true') return undefined;
  return 'fail board: a Claude cloud session cannot reach GitHub Projects (board adapter github); use github-issues, jira or linear, or run the cycle from GitHub Actions (templates/runner/github-actions-claude.yml)';
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
      const warnings: string[] = [];
      const problems = validate(ctx.root, warnings);
      problems.forEach((p) => console.error(`problem: ${p}`));
      try { warnings.push(...bindingWarnings(loadBinding(ctx.root))); } catch { /* reported as a problem */ }
      warnings.forEach((m) => console.error(`warn: ${m}`));
      try {
        const info = missingKeysLine(missingBindingKeys(readFileSync(join(packageRoot(), 'templates/binding.yml'), 'utf8'), readFileSync(join(ctx.root, BINDING_PATH), 'utf8')));
        if (info) out(info);
      } catch { /* no package templates to compare with */ }
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
      const cb = cloudBoard(binding, ctx.env);
      if (cb) { out(cb); bad++; probes.shift(); } // the board.list probe would only repeat it
      trunkProtection(binding, ctx).forEach(out);
      const it = implementerToken(binding, ctx);
      if (it) out(it);
      const rn = selfHostedRunner(binding, ctx);
      if (rn) { out(rn); if (rn.startsWith('fail')) bad++; }
      const dw = deliveryWorkflow(binding, ctx.root);
      if (dw) { out(dw); if (dw.startsWith('fail')) bad++; }
      const ua = unpinnedActions(ctx.root);
      if (ua) out(ua);
      for (const [name, run] of probes) {
        try { await run(); out(`ok   ${name}`); }
        catch (e) {
          bad++; out(`fail ${name}: ${probeFailure((e as Error).message, ctx.env, binding)}`);
        }
      }
      return bad ? 1 : 0;
    }
    console.error('usage: agentic-sdlc init [--board ...] [--forge github] [--vcs git] [--harness ...] [--profile individual|individual-api|organization] [--no-plugin] [--upgrade] [--force] | validate | doctor');
    return 2;
  } catch (e) {
    console.error(redact((e as Error).message, ctx.env));
    return 1;
  }
};

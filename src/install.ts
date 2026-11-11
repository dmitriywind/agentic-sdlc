// init / validate / doctor.
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { BINDING_PATH, bindingWarnings, loadBinding, validateBinding } from './binding.ts';
import { createBoard } from './board/index.ts';
import { createForge } from './forge/index.ts';
import { createVcs } from './vcs/index.ts';
import type { PortCli } from './ports.ts';

const START = '<!-- agentic-sdlc:start -->';
const END = '<!-- agentic-sdlc:end -->';
const POINTER = `${START}
Work lives on the board named in \`.agents/binding.yml\`. Before any work, invoke the sdlc skill (\`/agentic-sdlc:sdlc\` in Claude Code).
Never duplicate the process here: the skills own it, the binding owns the project values.
${END}`;
const SKILLS_LOCK = '.agents/skills.lock.json';
const TIERS = ['fast', 'balanced', 'deep'];
const FORGES = ['github', 'gitlab', 'azure', 'bitbucket'];

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

const flagsOf = (argv: string[]) => {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument '${argv[i]}'`);
    const k = argv[i].slice(2);
    if (k === 'force' || k === 'no-plugin') f[k] = 'true';
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

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

function copyFile(from: string, to: string, force: boolean, log: string[]) {
  if (existsSync(to) && !force) { log.push(`kept ${to}`); return; }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  log.push(`wrote ${to}`);
}

function writeKept(to: string, text: string, force: boolean, log: string[], rel: string) {
  if (existsSync(to) && !force) { log.push(`kept ${rel}`); return; }
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, text);
  log.push(`wrote ${rel}`);
}

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => statSync(join(dir, n)).isDirectory() ? filesUnder(join(dir, n)).map((f) => join(n, f)) : [n]);

/**
 * Copy the skill pack into `dest`, keeping local edits. The lock records the hash of each file as
 * installed: a file still at that hash (or new) is updated; one edited since is kept unless --force.
 */
function syncSkills(src: string, root: string, dest: string, force: boolean, log: string[]) {
  const lockFile = join(root, SKILLS_LOCK);
  const lock: Record<string, string> = existsSync(lockFile) ? readJson(lockFile) : {};
  let wrote = 0;
  for (const f of filesUnder(src)) {
    const from = join(src, f), to = join(root, dest, f);
    const key = relative(root, to).replaceAll('\\', '/');
    const want = sha(from);
    if (existsSync(to)) {
      const have = sha(to);
      if (have === want) { lock[key] = want; continue; }
      if (!force && have !== lock[key]) { log.push(`kept ${key} (local edits; --force overwrites)`); continue; }
    }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    lock[key] = want;
    wrote++;
  }
  mkdirSync(dirname(lockFile), { recursive: true });
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  log.push(`wrote ${dest} (${wrote} file${wrote === 1 ? '' : 's'} updated)`);
}

const MCP_FILES = new Map<string, string | null>([
  ['claude', '.mcp.json'], ['cursor', '.cursor/mcp.json'], ['antigravity', '.agents/mcp_config.json'],
  ['codex', '.codex/config.toml'], ['grok', null], ['generic', null],
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
    const doc = cur.trim() ? JSON.parse(cur) : {};
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
  const doc = JSON.parse(text);
  allowGit(root, log);
  if (doc.devDependencies?.['agentic-sdlc'] && !force) { log.push('kept devDependencies.agentic-sdlc in package.json'); return true; }
  doc.devDependencies = { ...doc.devDependencies, 'agentic-sdlc': gitSpec(version) };
  const indent = /^[ \t]+/m.exec(text)?.[0] ?? '  ';
  writeFileSync(file, JSON.stringify(doc, null, indent) + '\n');
  log.push(`set devDependencies.agentic-sdlc=${gitSpec(version)} in package.json: run npm install`);
  return true;
}

/** Claude Code: tier subagents from binding.models, and CLAUDE.md importing AGENTS.md. Skills come from the plugin. */
function claudeSetup(root: string, force: boolean, log: string[]) {
  let models: Record<string, string> = {};
  try { models = parse(readFileSync(join(root, BINDING_PATH), 'utf8'))?.models ?? {}; } catch { /* reported by validate */ }
  for (const tier of TIERS) {
    const rel = `.claude/agents/sdlc-${tier}.md`;
    const model = !models[tier] || /^your-/.test(models[tier]) ? 'inherit' : models[tier]; // template placeholder: the session's model
    writeKept(join(root, rel), `---
name: sdlc-${tier}
description: Runs one agentic-sdlc skill step whose metadata.tier is ${tier}. The sdlc skill hands a step to this agent when the step's skill is at the ${tier} tier.
model: ${model}
---

You run one step of the agentic-sdlc process at the ${tier} tier. Invoke the skill your task names
(\`/agentic-sdlc:<skill>\`; without the plugin, read \`.agents/skills/<skill>/SKILL.md\`), follow it to
its last Done when, and report the result and the evidence. Call the CLI as \`npx --no agentic-sdlc ...\`.
Do not start subagents.
`, force, log, rel);
  }
  const file = join(root, 'CLAUDE.md');
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (/^@AGENTS\.md\s*$/m.test(cur)) log.push('kept CLAUDE.md (imports @AGENTS.md)');
  else {
    writeFileSync(file, (cur ? cur.replace(/\n*$/, '\n\n') : '') + '@AGENTS.md\n');
    log.push(cur ? 'appended @AGENTS.md to CLAUDE.md' : 'wrote CLAUDE.md (@AGENTS.md)');
  }
  log.push('install the Claude Code plugin (skills, guard hook, MCP server): /plugin marketplace add dmitriywind/agentic-sdlc, then /plugin install agentic-sdlc@agentic-sdlc');
  log.push('headless runs load it from the pinned package: claude -p ... --plugin-dir node_modules/agentic-sdlc');
}

function init(root: string, argv: string[], log: string[]) {
  const f = flagsOf(argv);
  const board = f.board ?? 'github', forge = f.forge ?? 'github', vcs = f.vcs ?? 'git', harness = f.harness ?? 'generic';
  const force = f.force === 'true';
  const profile = f.profile ?? 'individual';
  if (profile !== 'individual' && profile !== 'enterprise') throw new Error(`--profile must be individual or enterprise, got '${profile}'`);
  if (vcs !== 'git') throw new Error(`--vcs must be git (v2 supports git only), got '${vcs}'`);
  if (!FORGES.includes(forge)) throw new Error(`--forge must be one of ${FORGES.join('|')}, got '${forge}'`);
  if (!MCP_FILES.has(harness)) throw new Error(`--harness must be one of ${[...MCP_FILES.keys()].join('|')}, got '${harness}'`);
  const pkg = packageRoot();
  const pkgJson = join(pkg, 'package.json');
  const version: string = existsSync(pkgJson) ? readJson(pkgJson).version : 'next';

  const skills = need(pkg, 'skills');
  syncSkills(skills, root, '.agents/skills', force, log);
  // Grok reads .claude/skills. Claude Code gets skills and the MCP server from the plugin, unless --no-plugin.
  const noPlugin = harness === 'claude' && f['no-plugin'] === 'true';
  if (harness === 'grok' || noPlugin) syncSkills(skills, root, '.claude/skills', force, log);
  const pinned = pinCli(root, version, force, log);
  if (harness !== 'claude' || noPlugin) registerMcp(pkg, root, harness, pinned ? ['--no-install', 'agentic-sdlc', 'mcp'] : ['-y', ALLOW_GIT, gitSpec(version), 'mcp'], force, log);
  else log.push('MCP server: provided by the agentic-sdlc Claude Code plugin (use --no-plugin to write .mcp.json instead)');
  const scorers = join(pkg, 'scorers');
  if (existsSync(scorers)) {
    // Scorers are factory definition the project may tune: keep existing files unless --force.
    for (const n of readdirSync(scorers)) copyFile(join(scorers, n), join(root, '.agents', 'scorers', n), force, log);
  }

  const bindingFile = join(root, BINDING_PATH);
  if (existsSync(bindingFile) && !force) log.push(`kept ${BINDING_PATH}`);
  else {
    const doc = parseDocument(readFileSync(need(pkg, 'templates/binding.yml'), 'utf8'));
    doc.setIn(['board', 'adapter'], board);
    doc.setIn(['forge', 'adapter'], forge);
    doc.setIn(['vcs', 'adapter'], vcs);
    doc.set('profile', profile);
    doc.setIn(['executors', 'default'], { kind: 'harness', sandbox: profile === 'enterprise' ? 'container' : 'cloud' });
    if (profile === 'enterprise') {
      doc.set('traces', { uri: '.agents/runtime/traces/{run_id}.jsonl' }); // placeholder: point it at org storage
      doc.setIn(['learning', 'human_sample'], 5);
    }
    mkdirSync(dirname(bindingFile), { recursive: true });
    writeFileSync(bindingFile, String(doc));
    log.push(`wrote ${BINDING_PATH}`);
  }

  const gates = join(pkg, 'templates', 'gates');
  const first = (dir: string) => join(dir, readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile()).sort()[0]);
  const dir = need(pkg, `templates/gates/${forge}`);
  if (forge === 'github') {
    for (const n of readdirSync(dir).filter((n) => n.endsWith('.yml'))) copyFile(join(dir, n), join(root, '.github', 'workflows', n), force, log);
    if (existsSync(join(dir, 'pull_request_template.md'))) copyFile(join(dir, 'pull_request_template.md'), join(root, '.github', 'pull_request_template.md'), force, log);
    if (existsSync(join(dir, 'ruleset.trunk.json'))) {
      copyFile(join(dir, 'ruleset.trunk.json'), join(root, '.github', 'rulesets', 'trunk.json'), force, log);
      log.push('import .github/rulesets/trunk.json in the repo settings (Rules > Rulesets) to protect the trunk');
      log.push('its CI checks are pinned to GitHub Actions (integration_id 15368); review and human-approval are posted with the review token: pin them to your review GitHub App\'s id if it is an App (a PAT cannot be pinned)');
    }
    if (existsSync(join(dir, 'ruleset.release.json'))) {
      copyFile(join(dir, 'ruleset.release.json'), join(root, '.github', 'rulesets', 'release.json'), force, log);
      log.push('import .github/rulesets/release.json (Rules > Rulesets) and add the release bot (app or role) as a bypass actor; set its include to your vcs.release_prefix');
    }
  }
  else if (forge === 'gitlab') copyFile(first(dir), join(root, '.gitlab', 'agentic-sdlc.yml'), force, log);
  else if (forge === 'azure') copyFile(first(dir), join(root, 'azure-pipelines.agentic-sdlc.yml'), force, log);
  else {
    const dest = join(root, 'bitbucket-pipelines.yml');
    if (existsSync(dest)) log.push(`${dest} exists: merge ${first(dir)} into it by hand`);
    else copyFile(first(dir), dest, false, log);
  }
  if (existsSync(join(gates, 'hooks', 'pre-push'))) {
    copyFile(join(gates, 'hooks', 'pre-push'), join(root, '.agents', 'hooks', 'pre-push'), force, log);
    chmodSync(join(root, '.agents', 'hooks', 'pre-push'), 0o755);
    log.push('enable the hook with: git config core.hooksPath .agents/hooks');
  }
  const setup = join(pkg, 'templates', 'runner', 'setup.sh');
  if (existsSync(setup)) copyFile(setup, join(root, '.agents', 'runner-setup.sh'), force, log);

  for (const n of ['cycle-prompt.md', 'review-prompt.md']) {
    const prompt = join(pkg, 'templates', 'runner', n);
    if (existsSync(prompt)) copyFile(prompt, join(root, '.agents', n), force, log);
  }

  const agents = join(root, 'AGENTS.md');
  const cur = existsSync(agents) ? readFileSync(agents, 'utf8') : '';
  const s = cur.indexOf(START), e = cur.indexOf(END);
  const next = s >= 0 && e > s ? cur.slice(0, s) + POINTER + cur.slice(e + END.length) : (cur ? cur.replace(/\n*$/, '\n\n') : '') + POINTER + '\n';
  if (next !== cur) writeFileSync(agents, next);
  log.push('updated AGENTS.md');
  if (harness === 'claude') claudeSetup(root, force, log);
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

const redact = (msg: string, env: NodeJS.ProcessEnv) => {
  for (const [k, v] of Object.entries(env)) if (v && v.length >= 8 && /TOKEN|KEY|SECRET|PASS|AUTH/i.test(k)) msg = msg.replaceAll(v, '***');
  return msg;
};

/** Trunk rules: required checks exist and each is pinned to the app that posts it. */
export function trunkProtection(b: any, ctx: any): string[] {
  const repo = b.forge.options?.repo;
  const reminder = 'warn: pin each required check to the CI integration that posts it, so no other token can post it';
  if (b.forge.adapter !== 'github' || !repo) return ['trunk protection: check manually', reminder];
  let rules: any[];
  try { rules = JSON.parse(ctx.exec('gh', ['api', `repos/${repo}/rules/branches/${b.vcs.trunk}`])); }
  catch { return ['trunk protection: check manually (cannot read the trunk rules)', reminder]; }
  const checks = rules.filter((r) => r.type === 'required_status_checks').flatMap((r) => r.parameters?.required_status_checks ?? []);
  if (!checks.length) return ['fail trunk protection: no required status checks'];
  const loose = checks.filter((c: any) => !c.integration_id).map((c: any) => c.context);
  return ['ok   trunk protection: required checks block merge',
    ...(loose.length ? [`warn: required checks not pinned to an app (integration_id): ${loose.join(', ')}; any token with status access can post them`] : [])];
}

/** The stock delivery workflow's push branches must name this project's trunk and release lines. */
export function deliveryWorkflow(b: any, root: string): string | undefined {
  const f = join(root, '.github', 'workflows', 'agentic-sdlc-delivery.yml');
  if (b.forge.adapter !== 'github' || !existsSync(f)) return undefined;
  const wf = parse(readFileSync(f, 'utf8'));
  const br: string[] = wf?.on?.push?.branches ?? [];
  const rel = `${b.vcs.release_prefix}**`;
  if (!br.includes(b.vcs.trunk) || !br.includes(rel))
    return `fail delivery workflow: push branches ${br.join(', ')} do not name trunk ${b.vcs.trunk} and ${rel}; edit its 'set:' lines`;
  for (const [k, key, v] of [['TRUNK', 'vcs.trunk', b.vcs.trunk], ['RELEASE_PREFIX', 'vcs.release_prefix', b.vcs.release_prefix]])
    if (wf?.env?.[k] !== v) return `fail delivery workflow: env.${k} is '${wf?.env?.[k] ?? ''}', not ${key} '${v}'; edit its 'set:' lines`;
  return `ok   delivery workflow: names trunk ${b.vcs.trunk}`;
}

/** Called with the group name as the first element: init | validate | doctor. */
export const cli: PortCli = async (argv, ctx) => {
  const [verb, ...rest] = argv;
  const out = (s: string) => console.log(s);
  try {
    if (verb === 'init') {
      const log: string[] = [];
      init(ctx.root, rest, log);
      log.forEach(out);
      return 0;
    }
    if (verb === 'validate' || verb === 'doctor') {
      const warnings: string[] = [];
      const problems = validate(ctx.root, warnings);
      problems.forEach((p) => console.error(`problem: ${p}`));
      try { warnings.push(...bindingWarnings(loadBinding(ctx.root))); } catch { /* reported as a problem */ }
      warnings.forEach((m) => console.error(`warn: ${m}`));
      if (problems.length) return 1;
      out('validate: ok');
      if (verb === 'validate') return 0;
      const binding = loadBinding(ctx.root);
      const c = { ...ctx, binding };
      const probes: [string, () => Promise<unknown>][] = [
        ['board.list', () => createBoard({ ...c, options: binding.board.options }).list()],
        ['forge.list', () => createForge({ ...c, options: binding.forge.options }).list()],
        ['vcs.head', () => createVcs({ ...c, options: binding.vcs.options ?? {} }).head()],
      ];
      let bad = 0;
      trunkProtection(binding, ctx).forEach(out);
      if (['gitlab', 'azure', 'bitbucket'].includes(binding.forge.adapter))
        out(`warn: ${binding.forge.adapter} gates run from pipeline YAML a contributor with push access can edit, so review and human-approval statuses can be forged by them; see docs/forges.md (Secret exposure)`);
      const dw = deliveryWorkflow(binding, ctx.root);
      if (dw) { out(dw); if (dw.startsWith('fail')) bad++; }
      for (const [name, run] of probes) {
        try { await run(); out(`ok   ${name}`); }
        catch (e) { bad++; out(`fail ${name}: ${redact((e as Error).message, ctx.env).split('\n')[0]}`); }
      }
      return bad ? 1 : 0;
    }
    console.error('usage: agentic-sdlc init [--board ...] [--forge github|gitlab|azure|bitbucket] [--vcs git] [--harness ...] [--profile individual|enterprise] [--force] | validate | doctor');
    return 2;
  } catch (e) {
    console.error(redact((e as Error).message, ctx.env));
    return 1;
  }
};

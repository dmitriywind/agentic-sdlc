// init / validate / doctor.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
Work lives on the board named in \`.agents/binding.yml\`. Load the \`sdlc\` skill (\`.agents/skills/sdlc/SKILL.md\`) first.
Never duplicate the process here: the skills own it, the binding owns the project values.
${END}`;

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
    if (k === 'force') f[k] = 'true';
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

function copyFile(from: string, to: string, force: boolean, log: string[]) {
  if (existsSync(to) && !force) { log.push(`kept ${to}`); return; }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  log.push(`wrote ${to}`);
}

const MCP_FILES = new Map<string, string | null>([
  ['claude', '.mcp.json'], ['cursor', '.cursor/mcp.json'], ['antigravity', '.agents/mcp_config.json'],
  ['codex', '.codex/config.toml'], ['grok', null], ['generic', null],
]);

/** Register the agentic-sdlc stdio server in the harness's project MCP file, keeping other servers. */
function registerMcp(pkg: string, root: string, harness: string, force: boolean, log: string[]) {
  const snippet = readFileSync(need(pkg, `templates/mcp/${harness === 'codex' ? 'codex.toml' : harness + '.json'}`), 'utf8');
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

function init(root: string, argv: string[], log: string[]) {
  const f = flagsOf(argv);
  const board = f.board ?? 'github', forge = f.forge ?? 'github', vcs = f.vcs ?? 'git', harness = f.harness ?? 'generic';
  const force = f.force === 'true';
  const profile = f.profile ?? 'individual';
  if (profile !== 'individual' && profile !== 'enterprise') throw new Error(`--profile must be individual or enterprise, got '${profile}'`);
  const pkg = packageRoot();

  const skills = need(pkg, 'skills');
  cpSync(skills, join(root, '.agents', 'skills'), { recursive: true });
  log.push('wrote .agents/skills');
  if (!MCP_FILES.has(harness)) throw new Error(`--harness must be one of ${[...MCP_FILES.keys()].join('|')}, got '${harness}'`);
  if (harness === 'claude' || harness === 'grok') { cpSync(skills, join(root, '.claude', 'skills'), { recursive: true }); log.push('wrote .claude/skills'); }
  registerMcp(pkg, root, harness, force, log);
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
    } else {
      doc.setIn(['learning', 'auto_merge_classes'], ['tuning']);
    }
    mkdirSync(dirname(bindingFile), { recursive: true });
    writeFileSync(bindingFile, String(doc));
    log.push(`wrote ${BINDING_PATH}`);
  }

  const gates = join(pkg, 'templates', 'gates');
  const first = (dir: string) => join(dir, readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile()).sort()[0]);
  if (forge !== 'swarm') {
    const dir = need(pkg, `templates/gates/${forge}`);
    if (forge === 'github') {
      for (const n of readdirSync(dir).filter((n) => n.endsWith('.yml'))) copyFile(join(dir, n), join(root, '.github', 'workflows', n), force, log);
      if (existsSync(join(dir, 'pull_request_template.md'))) copyFile(join(dir, 'pull_request_template.md'), join(root, '.github', 'pull_request_template.md'), force, log);
      if (existsSync(join(dir, 'CODEOWNERS'))) {
        copyFile(join(dir, 'CODEOWNERS'), join(root, '.github', 'CODEOWNERS'), force, log);
        log.push('replace @<owners.factory> in .github/CODEOWNERS with the factory owner account');
      }
      if (existsSync(join(dir, 'ruleset.trunk.json'))) {
        copyFile(join(dir, 'ruleset.trunk.json'), join(root, '.github', 'rulesets', 'trunk.json'), force, log);
        log.push('import .github/rulesets/trunk.json in the repo settings (Rules > Rulesets) to protect the trunk');
      }
    }
    else if (forge === 'gitlab') copyFile(first(dir), join(root, '.gitlab', 'agentic-sdlc.yml'), force, log);
    else if (forge === 'azure') copyFile(first(dir), join(root, 'azure-pipelines.agentic-sdlc.yml'), force, log);
    else if (forge === 'bitbucket') {
      const dest = join(root, 'bitbucket-pipelines.yml');
      if (existsSync(dest)) log.push(`${dest} exists: merge ${first(dir)} into it by hand`);
      else copyFile(first(dir), dest, false, log);
    } else throw new Error(`unknown forge '${forge}'`);
  }
  const hook = { git: 'pre-push', hg: 'hg-pretxnchangegroup.sh', p4: 'p4-change-submit.sh' }[vcs];
  if (!hook) throw new Error(`unknown vcs '${vcs}'`);
  if (existsSync(join(gates, 'hooks', hook))) {
    copyFile(join(gates, 'hooks', hook), join(root, '.agents', 'hooks', hook), force, log);
    log.push(vcs === 'git' ? 'enable the hook with: git config core.hooksPath .agents/hooks' : `install .agents/hooks/${hook} as its header comment says`);
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
}

/** Binding problems plus skill frontmatter problems. */
export function validate(root: string): string[] {
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
    for (const k of ['name', 'description', 'tier']) if (!fm?.[k]) problems.push(`skill ${name}: frontmatter lacks '${k}'`);
  }
  return problems;
}

const redact = (msg: string, env: NodeJS.ProcessEnv) => {
  for (const [k, v] of Object.entries(env)) if (v && v.length >= 8 && /TOKEN|KEY|SECRET|PASS|AUTH/i.test(k)) msg = msg.replaceAll(v, '***');
  return msg;
};

function trunkProtection(b: any, ctx: any): string {
  const repo = b.forge.options?.repo;
  if (b.forge.adapter === 'github' && repo) {
    try {
      const p = JSON.parse(ctx.exec('gh', ['api', `repos/${repo}/branches/${b.vcs.trunk}/protection`]));
      return p.required_status_checks ? 'ok   trunk protection: required checks block merge' : 'fail trunk protection: no required status checks';
    } catch { /* unreadable: fall through */ }
  }
  return 'trunk protection: check manually';
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
      const problems = validate(ctx.root);
      problems.forEach((p) => console.error(`problem: ${p}`));
      let warnings: string[] = [];
      try { warnings = bindingWarnings(loadBinding(ctx.root)); } catch { /* reported as a problem */ }
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
      out(trunkProtection(binding, ctx));
      for (const [name, run] of probes) {
        try { await run(); out(`ok   ${name}`); }
        catch (e) { bad++; out(`fail ${name}: ${redact((e as Error).message, ctx.env).split('\n')[0]}`); }
      }
      return bad ? 1 : 0;
    }
    console.error('usage: agentic-sdlc init [--board ...] [--forge ...] [--vcs ...] [--harness ...] [--profile individual|enterprise] [--force] | validate | doctor');
    return 2;
  } catch (e) {
    console.error(redact((e as Error).message, ctx.env));
    return 1;
  }
};

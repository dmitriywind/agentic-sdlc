import { readFileSync } from 'node:fs';
import { loadBinding } from './binding.ts';
import { exec, http } from './exec.ts';
import type { AdapterContext, PortCli } from './ports.ts';

// [module, needs binding, verbs]. install.ts serves init|validate|doctor and takes the group as its verb.
export const GROUPS: Record<string, [() => Promise<{ cli: PortCli }>, boolean, string]> = {
  init: [() => import('./install.ts'), false, 'copy skills, write the binding and CI gates'],
  validate: [() => import('./install.ts'), false, 'check the binding and skills'],
  doctor: [() => import('./install.ts'), false, 'validate, then probe board, forge and vcs'],
  board: [() => import('./board/index.ts'), true, 'list get create move set label assign milestone comment comments hold holds release close child'],
  forge: [() => import('./forge/index.ts'), true, 'open view diff list ready draft sync automerge cut approve approvals comment comments verdict land queue status runs run'],
  vcs: [() => import('./vcs/index.ts'), true, 'start head changed base push cut tag tags drop checkout-tests'],
  dispatch: [() => import('./dispatch.ts'), true, 'dispatch <skill>[/<step>] --ticket <id> | --cr <n> [--run <id>] [--run-model <m>] [--workdir <d>] [--unattended]: start the step on its executor'],
  gate: [() => import('./gates.ts'), true, 'branch-names linkage approval proofs-on-base merged shipped evidence signal-on-red skill-regression review provenance'],
  ledger: [() => import('./ledger.ts'), true, 'runs summary plan record stale hash measures: the run ledger from heartbeats'],
  bench: [() => import('./bench.ts'), true, 'build propose run report compare'],
  mcp: [() => import('./mcp.ts'), true, 'serve the port verbs as MCP tools over stdio; --allow approve,status'],
};

const INIT_FLAGS = '[--profile individual|organization] [--harness claude] [--board github-issues|local] [--forge github] [--vcs git] [--no-plugin] [--upgrade] [--force]';

/** The package version: package.json sits one folder above src/ and dist/. */
const version = () => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string; } catch { return 'unknown'; }
};

const help = () =>
  ['usage: agentic-sdlc [--root <dir>] [--version] <group> <verb> ...', ...Object.entries(GROUPS).map(([g, v]) => `  ${g.padEnd(9)} ${v[2]}`)].join('\n');

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let root = process.cwd();
  const args = [...argv];
  // --root is a leading option only: later arguments belong to the verb, whatever they look like.
  while (args[0] === '--root' || args[0]?.startsWith('--root=')) {
    const [flag] = args.splice(0, 1);
    const v = flag === '--root' ? args.shift() : flag.slice(7);
    if (!v || v.startsWith('-') || Object.hasOwn(GROUPS, v)) { console.error(`--root needs a directory\n${help()}`); return 2; }
    root = v;
  }
  const [group, ...rest] = args;
  if (group === '--version' || group === '-v') { console.log(version()); return 0; }
  if (group === 'help' || group === '--help' || group === '-h') { console.log(help()); return 0; }
  if (!group) { console.log(help()); return 2; }
  if (!Object.hasOwn(GROUPS, group)) { console.error(`unknown group '${group}'\n${help()}`); return 2; }
  const entry = GROUPS[group];
  // `<group> --help` (or -h) prints that group's usage; a group that needs a verb and has none is a usage error.
  const usage = `usage: agentic-sdlc ${group} ${group === 'init' ? INIT_FLAGS : entry[1] ? '<verb> ...' : ''}\n  ${entry[2]}`;
  const isHelp = (a?: string) => a === '--help' || a === '-h';
  if (isHelp(rest[0]) || (entry[1] && isHelp(rest[1]))) { console.log(usage); return 0; }
  if (!rest.length && entry[1] && group !== 'mcp') { console.error(usage); return 2; }
  const ctx = { root, env, exec, http } as Omit<AdapterContext, 'options'>;
  // The binding loads on first read of ctx.binding; init, validate and doctor never use this getter.
  if (entry[1]) {
    let b: AdapterContext['binding'] | undefined;
    Object.defineProperty(ctx, 'binding', { enumerable: true, get: () => (b ??= loadBinding(root)) });
  }
  try {
    const { cli } = await entry[0]();
    return await cli(entry[1] ? rest : [group, ...rest], ctx);
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

import { loadBinding } from './binding.ts';
import { exec, http } from './exec.ts';
import type { AdapterContext, PortCli } from './ports.ts';

// [module, needs binding, verbs]. install.ts serves init|validate|doctor and takes the group as its verb.
const GROUPS: Record<string, [() => Promise<{ cli: PortCli }>, boolean, string]> = {
  init: [() => import('./install.ts'), false, 'copy skills, write the binding and CI gates'],
  validate: [() => import('./install.ts'), false, 'check the binding and skills'],
  doctor: [() => import('./install.ts'), false, 'validate, then probe board, forge and vcs'],
  board: [() => import('./board/index.ts'), true, 'list get create move set label assign comment comments close child'],
  forge: [() => import('./forge/index.ts'), true, 'open view diff list ready draft sync automerge approve approvals comment status runs'],
  vcs: [() => import('./vcs/index.ts'), true, 'start head changed base push cut tag tags drop checkout-tests'],
  dispatch: [() => import('./dispatch.ts'), true, 'dispatch <skill> --ticket <id> | --cr <n> [--workdir <d>]'],
  gate: [() => import('./gates.ts'), true, 'branch-names linkage approval proofs-on-base board-sync shipped signal-on-red skill-regression'],
  ledger: [() => import('./ledger.ts'), true, 'runs summary plan record stale hash: the run ledger from heartbeats'],
  bench: [() => import('./bench.ts'), true, 'build propose run report compare'],
  mcp: [() => import('./mcp.ts'), true, 'serve the port verbs as MCP tools: stdio, or --http --port <p> with AGENTIC_SDLC_MCP_TOKEN; --allow approve,status'],
};

const help = () =>
  ['usage: agentic-sdlc [--root <dir>] <group> <verb> ...', ...Object.entries(GROUPS).map(([g, v]) => `  ${g.padEnd(9)} ${v[2]}`)].join('\n');

export async function main(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let root = process.cwd();
  const args = [...argv];
  const at = args.indexOf('--root');
  if (at >= 0) { root = args[at + 1] ?? root; args.splice(at, 2); }
  const [group, ...rest] = args;
  if (!group || group === '--help' || group === '-h') { console.log(help()); return group ? 0 : 2; }
  const entry = GROUPS[group];
  if (!entry) { console.error(`unknown group '${group}'\n${help()}`); return 2; }
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

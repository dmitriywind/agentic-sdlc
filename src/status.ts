// `agentic-sdlc status`: what is happening and what waits on the person, in one compact call (references/architecture.md
// section 10, Self-guide). It composes validate, board holds, next, the CR checks and the ledger; it decides nothing.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { BINDING_PATH, bindingWarnings, unresolved } from './binding.ts';
import type { Binding, Board, CR, Forge, PortCli } from './ports.ts';
import { holds } from './board/index.ts';
import { next } from './next.ts';
import { headSha, parseHeartbeat, readLedger } from './ledger.ts';
import { ownersFor } from './ports.ts';

type Waiting =
  | { kind: 'hold'; ticket: string; ask: string; since: string; replied: boolean }
  | { kind: 'approval'; cr: string; url: string; ticket?: string; class: string; who: string[]; label: string };
type Person = { step: string; where: string; text?: string; verified: boolean | null };

/**
 * The steps only the person can take, each with where to do it; `verified` true or false when the CLI could check it,
 * null when it cannot (a forge app, a scheduler or a connector outside the repo's API). One forge (GitHub), one runtime
 * (a Claude cloud routine): the mechanism knows both, the skills name neither.
 */
export function personSteps(b: Binding, trunkLines: string[], warnings: string[]): Person[] {
  const repo = String(b.forge?.options?.repo ?? b.board?.options?.repo ?? '<owner>/<repo>');
  const out: Person[] = [
    { step: 'Install the Claude GitHub App on the repo', where: `https://github.com/apps/claude/installations/new (pick ${repo} only)`, verified: null },
    {
      step: 'Create the cloud routine that runs one cycle',
      where: 'https://claude.ai/code/routines > New routine: this repo; an environment with AGENTIC_SDLC_UNATTENDED=1 and the setup script of templates/runner/claude-routine.md; model: the binding\'s models.fast',
      text: 'Prompt: the text of .agents/cycle-prompt.md below its --- line. Triggers: a Schedule (custom cron, at least 1 hour apart, e.g. 7 */2 * * *) and, where the routine offers it, a GitHub event trigger on Issues (opened, labeled) for this repo',
      verified: null,
    },
    {
      step: `Protect ${b.vcs?.trunk ?? 'the trunk'} with the required checks`,
      where: `https://github.com/${repo}/settings/rules > New ruleset > Import a ruleset: .github/rulesets/trunk.json (once it is merged)`,
      verified: trunkLines.some((l) => l.startsWith('ok   trunk protection')) ? true : trunkLines.some((l) => /^(warn: trunk protection|fail trunk protection)/.test(l)) ? false : null,
    },
    b.board?.page
      ? { step: 'Open the board page', where: b.board.page, verified: true }
      : { step: 'For the board page: add the custom connector GitHub on claude.ai, then install its GitHub app on the repo owner', where: 'https://claude.ai/customize/connectors (name GitHub, URL https://api.githubcopilot.com/mcp/); https://github.com/apps/claude-github-mcp-connector/installations/new', verified: null },
  ];
  return out;
}

/** The open CRs whose human-approval check waits, with the class and the accounts that may approve (apply the label). */
async function approvals(crs: CR[], b: Binding, classOf: (cr: CR) => Promise<{ class: string; who: string[] }>) {
  const out: Waiting[] = [];
  for (const cr of crs) {
    const st = cr.checks.find((c) => c.name === 'human-approval')?.state;
    if (cr.draft || !st || st === 'success') continue;
    const { class: klass, who } = await classOf(cr);
    if (!who.length) continue;
    out.push({ kind: 'approval', cr: cr.n, url: cr.url, ...(cr.closes[0] ? { ticket: cr.closes[0] } : {}), class: klass, who, label: b.forge.approval_label || 'approved' });
  }
  return out;
}

/** The live part of `status`: holds and approvals waiting on the person, the next cycle, the last heartbeat; what could not be read goes to broken. */
export async function liveStatus(d: { b: Binding; root: string; board: Board; forge?: Forge; crs: CR[]; classOf: (cr: CR) => Promise<{ class: string; who: string[] }>; head?: () => Promise<string | undefined> }) {
  const { b, root, board, forge, crs, classOf, head } = d;
  const broken: string[] = [];
  const waiting: Waiting[] = [];
  try {
    for (const h of await holds(board, b)) waiting.push({ kind: 'hold', ticket: h.id, ask: h.kind, since: h.askedAt, replied: h.replied });
  } catch (e) { broken.push(`board holds: ${(e as Error).message.split('\n')[0]}`); }
  try { waiting.push(...(await approvals(crs, b, classOf))); } catch (e) { broken.push(`approvals: ${(e as Error).message.split('\n')[0]}`); }

  let cycle: unknown;
  try {
    const n = await next({ b, root, board, forge, classOf, head });
    const line = (w: { step: string; ticket?: string; cr?: string; reason: string }) => `${w.step} ${w.ticket ? `#${w.ticket}` : ''}${w.cr ? ` CR ${w.cr}` : ''}: ${w.reason}`.replace(/ {2,}/g, ' ');
    cycle = { idle: n.idle, work: n.work.map(line), later: n.later.length, releases: n.holds, ...(n.budget ? { budget: n.budget } : {}) };
    broken.push(...n.errors.map((e) => e.msg));
  } catch (e) { broken.push(`next: ${(e as Error).message.split('\n')[0]}`); }

  let heartbeat: { at: string; ageHours: number } | null = null;
  try {
    const o = ownersFor(b.owners, 'board');
    const beat = (await readLedger(board, b.heartbeat.ticket, o.bots)).map((x) => parseHeartbeat(x.body)).find((hb) => hb?.at);
    if (beat) heartbeat = { at: beat.at, ageHours: Math.round((Date.now() - Date.parse(beat.at)) / 36e5 * 10) / 10 };
  } catch (e) { broken.push(`ledger: ${(e as Error).message.split('\n')[0]}`); }

  return { waiting, cycle, heartbeat, broken };
}

export const cli: PortCli = async (argv, ctx) => {
  if (argv.length > 1) { console.error('usage: agentic-sdlc status'); return 2; } // argv[0] is the group (cli.ts)
  const print = (o: unknown) => console.log(JSON.stringify(o, null, 2));
  // A cloud routine (the primary runtime) loads only project files, so the install copies the skills and hooks into the repo.
  if (!existsSync(join(ctx.root, BINDING_PATH))) { print({ installed: false, install: 'agentic-sdlc init --no-plugin' }); return 0; }
  const { validate, trunkProtection, pathWarnings, missingKeys } = await import('./install.ts');
  const warnings: string[] = [];
  const problems = validate(ctx.root, warnings);
  let b: Binding;
  try { b = parse(readFileSync(join(ctx.root, BINDING_PATH), 'utf8')) as Binding; } catch (e) { print({ installed: true, ok: false, problems: [(e as Error).message] }); return 1; }
  warnings.push(...bindingWarnings(b), ...pathWarnings(ctx.root, b));
  const open = unresolved(b);
  const base = { installed: true, problems: problems.filter((p) => !/ is unresolved: /.test(p)), unresolved: open, missing: missingKeys(ctx.root), warnings };
  if (problems.length) { print({ ...base, ok: false, person: personSteps(b, [], warnings) }); return 1; }

  const c = { ...ctx, binding: b };
  const broken: string[] = [];
  const { createBoard } = await import('./board/index.ts');
  const board = createBoard({ ...c, options: b.board.options });
  let forge: Forge | undefined;
  let crs: CR[] = [];
  try {
    const { createForge } = await import('./forge/index.ts');
    const f = createForge({ ...c, options: b.forge.options });
    crs = await f.list({ state: 'open', checks: true });
    forge = { ...f, list: async () => crs }; // next reads the same list
  } catch (e) { broken.push(`forge: ${(e as Error).message.split('\n')[0]}`); }
  const { depsOf, approvalWho } = await import('./gates.ts');
  const gd = depsOf(c);
  const classOf = (cr: CR) => approvalWho(gd, cr);

  const live = await liveStatus({ b, root: ctx.root, board, forge, crs, classOf, head: () => headSha(c) });
  broken.push(...live.broken);
  const person = personSteps(b, forge ? trunkProtection(b, ctx) : [], warnings).filter((p) => p.verified !== true);
  print({ ...base, ok: !broken.length, waiting: live.waiting, cycle: live.cycle, heartbeat: live.heartbeat, broken, person });
  return broken.length ? 1 : 0;
};

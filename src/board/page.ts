// `board page`: the board as one web page for the owner (templates/board/index.html) and its data file.
// The page reads tickets live through a GitHub connector on claude.ai; the data file holds what that
// connector cannot list (milestone totals, deploy runs, tickets done lately) and the board when it is absent.
import type { Binding, Board, Forge, Item } from '../ports.ts';
import { shippedOptions } from '../binding.ts';

const DAYS = 14;

export interface BoardPage { html: string; data: unknown; title: string; capabilities: unknown }

export async function boardPage(d: { board: Board; forge?: Forge; binding: Binding; template: string; connector?: string; now?: Date }): Promise<BoardPage> {
  const b = d.binding, bb = b.board;
  if (bb.adapter !== 'github-issues') throw new Error(`board page: needs the github-issues board (this one is ${bb.adapter})`);
  const [owner, repo] = String(bb.options?.repo ?? '').split('/');
  if (!owner || !repo) throw new Error('board page: board.options.repo is not owner/name');
  const envs = b.product?.environments ?? [], doneAt = bb.done_statuses ?? ['Done', 'Cancelled'];
  const since = new Date((d.now ?? new Date()).getTime() - DAYS * 864e5).toISOString();

  const all = await d.board.list({ state: 'all' });
  const human = bb.labels?.human ?? 'needs-human', bug = bb.labels?.bug ?? 'bug';
  const row = (i: Item) => ({
    n: Number(i.id), t: i.title, s: i.status, z: i.fields.size ?? '', p: i.fields.priority ?? '', l: i.fields.lane ?? '', sh: i.fields.shipped ?? '',
    h: i.labels.includes(human), k: i.labels.includes(bug) ? 'bug' : '', m: i.milestone ?? '', c: i.statusChangedAt ?? '',
  });
  const items = all.filter((i) => !doneAt.includes(i.status)).map(row);
  const done = all.filter((i) => i.status === 'Done' && (i.statusChangedAt ?? '') >= since).map(row).sort((x, y) => y.c.localeCompare(x.c));

  const ms = new Map<string, { t: string; open: number; closed: number }>();
  for (const i of all) {
    if (!i.milestone || i.status === 'Cancelled') continue;
    const m = ms.get(i.milestone) ?? { t: i.milestone, open: 0, closed: 0 };
    if (i.status === 'Done') m.closed++; else m.open++;
    ms.set(i.milestone, m);
  }
  const later = bb.later_milestone;
  const milestones = [...ms.values()].sort((x, y) => Number(x.t === later) - Number(y.t === later) || x.t.localeCompare(y.t));

  // The first and the last environment have a deploy workflow (forge.deploy_workflows); one between them has no run to show.
  const wf = b.forge?.deploy_workflows ?? [];
  const envRows = [];
  for (const [k, name] of envs.entries()) {
    const workflow = k === 0 ? wf[0] : k === envs.length - 1 ? wf[wf.length - 1] : undefined;
    let last = null, good = null;
    if (workflow && d.forge) {
      try {
        const runs = (await d.forge.runs({ workflow })).filter((r) => r.state !== 'pending');
        const g = runs.find((r) => r.state === 'success');
        if (runs[0]) last = { at: runs[0].at, ok: runs[0].state === 'success', url: runs[0].url };
        if (g) good = { at: g.at, sha: g.sha.slice(0, 7), url: g.url };
      } catch { /* the environment shows no deploy */ }
    }
    envRows.push({ name, last, good });
  }

  // A Shipped value to the index of its environment: -1 not deployed; "In release" is still on the one before the last.
  const ship: Record<string, number> = {};
  for (const o of shippedOptions(envs, b.product?.delivery)) ship[o] = o === 'Not shipped' ? -1 : o === 'In release' ? Math.max(0, envs.length - 2) : envs.indexOf(o.slice(3));
  const f = Object.fromEntries((['size', 'priority', 'lane', 'shipped'] as const).map((k) => [k, (bb.fields?.[k] ?? k).toLowerCase()]));
  const server = d.connector ?? 'GitHub';
  const cfg = {
    server, owner, repo, statuses: (bb.statuses ?? []).filter((s) => !doneAt.includes(s)), priorities: b.priorities ?? [], sizes: b.sizes ?? [],
    lanes: ['Fast', 'Full'], human, bug, envs, ship, f: { status: 'status', ...f },
  };
  const title = `${repo} board`;
  // JSON inside a script element: no "<" may start a tag there.
  const json = JSON.stringify(cfg).replaceAll('<', '\\u003c');
  if (!d.template.includes('/*CFG*/{}/*END*/')) throw new Error('board page: the template has no CFG marker');
  const html = d.template.replace('/*CFG*/{}/*END*/', () => json).replace('__TITLE__', () => title.replace(/[<>&]/g, ''));
  return {
    html, title,
    data: { at: (d.now ?? new Date()).toISOString(), repo: `${owner}/${repo}`, milestones, envs: envRows, items, done },
    capabilities: { mcp: { servers: [{ server, tools: ['list_issues', 'issue_read', 'issue_write', 'add_issue_comment'] }] }, db: {} },
  };
}

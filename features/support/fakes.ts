// In-memory board, forge and VCS for the gates: what a gate scenario programs and then inspects.
import type { Comment, CR, CrCommit, Item, LabelEvent, Review, Run } from '../../src/ports.ts';
import type { Deps } from '../../src/gates.ts';

/** The binding every gate scenario starts from. Steps change it through world.gate.binding. */
export const baseBinding = () => ({
  board: { statuses: ['Backlog', 'In review', 'Done', 'Signals'], done_statuses: ['Done'], labels: { human: 'needs-human' } },
  vcs: { trunk: 'main', release_prefix: 'release/', tag_prefix: 'v', change_pattern: '<ticket>/<name>', factory_change_pattern: 'factory/<name>' },
  paths: { factory: ['.agents/**', 'skills/**'] },
  models: { fast: 'f', balanced: 'b', deep: 'd' },
  learning: { auto_merge_classes: ['tuning'] },
  product: { environments: ['staging', 'production'] },
  owners: { factory: 'fo', bots: ['factory-bot'] },
  forge: {},
}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const diffOf = (...paths: string[]) => paths.map((p) => `diff --git a/${p} b/${p}\n`).join('');

export type Status = { sha: string; context: string; state: string; description?: string; as?: string };

export class GateFakes {
  binding = baseBinding();
  items: Item[] = [];
  crs = new Map<string, Partial<CR>>();
  diffs = new Map<string, string | Error>();
  reviews = new Map<string, Review[]>();
  /** The label history of a CR, oldest first. */
  labelEvents = new Map<string, LabelEvent[]>();
  comments = new Map<string, Comment[]>();
  /** The commits of a CR (oldest first), or the error the forge answers with. */
  commits = new Map<string, CrCommit[] | Error>();
  runs: Run[] = [];
  /** File contents by `<sha>:<path>`, for the gates that compare a file at the base and at the head. */
  files = new Map<string, string>();
  statuses: Status[] = [];
  /** Tickets created by the gates (the Signals). */
  created: { title: string; body: string; status: string; labels: string[] }[] = [];
  tags: string[] = [];
  tagError?: Error;
  /** Does the forge search merged CRs by ticket? `asked` lists the tickets it was asked about. */
  searchByTicket = false;
  /** Merged CRs the search index does not show yet. */
  indexTrails = false;
  asked: string[] = [];
  /** Comments written to tickets. */
  commented: { id: string; body: string }[] = [];
  /** How many times the forge was asked for the whole merged list. */
  listed = 0;
  /** Ancestry: undefined means the VCS cannot tell at all; otherwise by merge sha (default for the others). */
  ancestry?: { known: Map<string, boolean | undefined>; others: boolean };
  /** Shipped values a deploy of a later environment writes while the gate runs. */
  meanwhile = new Map<string, string>();
  /** The proof files that pass on the merge base. */
  passingProofs = new Set<string>();

  ticket(id: string, status: string, fields: Item['fields'] = {}, labels: string[] = []) {
    this.items.push({ id, title: id, url: '', status, labels, fields, children: [], assignees: [], createdAt: '', updatedAt: '' });
  }

  cr(n: string, c: Partial<CR> = {}) {
    this.crs.set(n, { headSha: `h${n}`, baseSha: 'base', source: `factory/${n}`, ...c });
  }

  deps(root = '.'): Deps {
    const get = (id: string) => this.items.find((i) => i.id === id);
    const cr = (n: string, c: Partial<CR>): CR => ({ n, url: '', title: '', source: '', target: 'main', headSha: '', baseSha: '', draft: false, state: c.mergeSha ? 'merged' : 'open', behind: false, closes: [], checks: [], body: '', author: 'bot', ...c });
    const view = async (n: string): Promise<CR> => {
      const c = this.crs.get(n);
      if (!c) throw new Error(`no change request ${n}`);
      return cr(n, c);
    };
    const board: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      get: async (id: string) => {
        const i = get(id);
        if (!i) throw new Error(`no item ${id}`);
        if (this.meanwhile.has(id)) i.fields.shipped = this.meanwhile.get(id)!;
        return i;
      },
      list: async (q: { status?: string[]; label?: string } = {}) => this.items.filter((i) => (!q.status || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label))),
      comment: async (id: string, body: string) => { this.commented.push({ id, body }); return { id: 'c', url: '' }; },
      move: async (id: string, s: string) => { get(id)!.status = s; return get(id)!; },
      label: async (id: string, op: 'add' | 'remove', l: string) => { const i = get(id)!; i.labels = op === 'add' ? [...i.labels, l] : i.labels.filter((x) => x !== l); return i; },
      set: async (id: string, f: string, v: string | null) => { if (v === null) delete (get(id)!.fields as any)[f]; else (get(id)!.fields as any)[f] = v; return get(id)!; }, // eslint-disable-line @typescript-eslint/no-explicit-any
      create: async (t: { title: string; body: string; status: string; labels?: string[] }) => {
        this.created.push({ ...t, labels: t.labels ?? [] });
        this.ticket(`n${this.created.length}`, t.status, {}, t.labels ?? []);
        this.items.at(-1)!.title = t.title;
        return this.items.at(-1)!;
      },
    };
    const mergedCrs = () => [...this.crs].map(([n, c]) => cr(n, c)).filter((c) => c.state === 'merged');
    const forge: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      view,
      viewBySha: async (sha: string) => {
        const hit = [...this.crs].find(([, c]) => c.mergeSha === sha);
        if (!hit) throw new Error(`no change request for ${sha}`);
        return cr(hit[0], hit[1]);
      },
      diff: async (n: string) => { const d = this.diffs.get(n) ?? ''; if (d instanceof Error) throw d; return d; },
      approvals: async (n: string) => this.reviews.get(n) ?? [],
      labelEvents: async (n: string) => [...(this.labelEvents.get(n) ?? [])],
      unlabel: async (n: string, label: string) => {
        const list = this.labelEvents.get(n) ?? [];
        if (list.filter((e) => e.label === label).at(-1)?.action === 'labeled') list.push({ label, action: 'unlabeled', actor: 'github-actions[bot]', bot: true, at: new Date().toISOString() });
        this.labelEvents.set(n, list);
      },
      comments: async (n: string) => [...(this.comments.get(n) ?? [])],
      commits: async (n: string) => { const c = this.commits.get(n) ?? []; if (c instanceof Error) throw c; return c; },
      run: async (id: string) => { const r = this.runs.find((x) => x.id === id); if (!r) throw new Error(`no run ${id}`); return r; },
      list: async () => { this.listed++; return mergedCrs(); },
      status: async (sha: string, s: Omit<Status, 'sha' | 'as'>, o?: { as?: string }) => {
        this.statuses.push({ sha, ...s, ...(o?.as ? { as: o.as } : {}) });
      },
    };
    if (this.searchByTicket) {
      forge.closing = async (id: string) => { this.asked.push(id); return this.indexTrails ? [] : mergedCrs().filter((c) => c.closes.includes(id)); };
    } else if (this.indexTrails) forge.closing = async () => [];
    const vcs: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      tag: async (name: string) => { if (this.tagError) throw this.tagError; this.tags.push(name); },
      tags: async () => this.tags.map((name) => ({ name, sha: 's' })),
      head: async () => ({ ref: 'main', sha: 'HEAD1' }),
      base: async () => ({ sha: 'BASE1' }),
      checkoutTests: async () => {},
    };
    const d: Deps = { binding: this.binding as any, root, board, forge, vcs, fileAt: (p, sha) => this.files.get(`${sha}:${p}`) }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (this.ancestry) { const a = this.ancestry; d.isAncestor = (x) => (a.known.has(x) ? a.known.get(x) : a.others); }
    d.run = (cmd) => [...this.passingProofs].some((p) => cmd.includes(p));
    return d;
  }
}

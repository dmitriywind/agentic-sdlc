// In-memory board and forge for the gates: what a gate scenario programs and then inspects.
import type { CR, Item, Review } from '../../src/ports.ts';
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

export type Status = { sha: string; context: string; state: string; description?: string };

export class GateFakes {
  binding = baseBinding();
  items: Item[] = [];
  crs = new Map<string, Partial<CR>>();
  diffs = new Map<string, string | Error>();
  reviews = new Map<string, Review[]>();
  /** File contents by `<sha>:<path>`, for the gates that compare a file at the base and at the head. */
  files = new Map<string, string>();
  statuses: Status[] = [];

  ticket(id: string, status: string, fields: Item['fields'] = {}) {
    this.items.push({ id, title: id, url: '', status, labels: [], fields, children: [], assignees: [], createdAt: '', updatedAt: '' });
  }

  cr(n: string, c: Partial<CR> = {}) {
    this.crs.set(n, { headSha: `h${n}`, baseSha: 'base', source: `factory/${n}`, ...c });
  }

  deps(root = '.'): Deps {
    const get = (id: string) => this.items.find((i) => i.id === id);
    const view = async (n: string): Promise<CR> => {
      const c = this.crs.get(n);
      if (!c) throw new Error(`no change request ${n}`);
      return { n, url: '', title: '', source: '', target: 'main', headSha: '', baseSha: '', draft: false, state: 'open', behind: false, closes: [], checks: [], body: '', author: 'bot', ...c };
    };
    const board: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      get: async (id: string) => { const i = get(id); if (!i) throw new Error(`no item ${id}`); return i; },
      list: async () => this.items,
    };
    const forge: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      view,
      diff: async (n: string) => { const d = this.diffs.get(n) ?? ''; if (d instanceof Error) throw d; return d; },
      approvals: async (n: string) => this.reviews.get(n) ?? [],
      status: async (sha: string, s: Omit<Status, 'sha'>) => { this.statuses.push({ sha, ...s }); },
    };
    return { binding: this.binding as any, root, board, forge, vcs: {} as any, fileAt: (p, sha) => this.files.get(`${sha}:${p}`) }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

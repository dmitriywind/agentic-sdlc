// The reference adapter: .agents/board.json. Used by tests and solo projects.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AdapterContext, Board, Comment, Item } from '../ports.ts';
import { MovedError } from '../ports.ts';

type Db = { items: Item[]; comments: Record<string, Comment[]> };

const words = (s = '') => s.toLowerCase().split(/\s+/).filter(Boolean);

export function createLocalBoard(ctx: AdapterContext): Board {
  const file = join(ctx.root, '.agents', 'board.json');
  const load = (): Db => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { items: [], comments: {} });
  const save = (db: Db) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(db, null, 2)); };
  const now = () => new Date().toISOString();
  const find = (db: Db, id: string) => {
    const it = db.items.find((i) => i.id === id);
    if (!it) throw new Error(`no item ${id}`);
    return it;
  };
  /** Runs a mutation, stamps updatedAt, saves, returns the item. */
  const edit = async (id: string, fn: (it: Item, db: Db) => void): Promise<Item> => {
    const db = load();
    const it = find(db, id);
    fn(it, db);
    it.updatedAt = now();
    save(db);
    return it;
  };
  const setStatus = (it: Item, s: string) => { it.status = s; it.statusChangedAt = now(); };

  return {
    async list(q = {}) {
      return load().items.filter((i) => (!q.status?.length || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label)) && words(q.search).every((w) => `${i.title} ${i.body ?? ''}`.toLowerCase().includes(w)));
    },
    async get(id) { return find(load(), id); },
    async create(t) {
      const db = load();
      const id = String(Math.max(0, ...db.items.map((i) => Number(i.id))) + 1);
      const at = now();
      const it: Item = {
        id, title: t.title, body: t.body, url: `local:${id}`, status: t.status, labels: t.labels ?? [], fields: {},
        milestone: t.milestone, parent: t.parent, children: [], assignees: [], createdAt: at, updatedAt: at, statusChangedAt: at,
      };
      db.items.push(it);
      if (t.parent) find(db, t.parent).children.push(id);
      save(db);
      return it;
    },
    move(id, status, onlyFrom) {
      return edit(id, (it) => {
        if (onlyFrom && it.status !== onlyFrom) throw new MovedError(id, onlyFrom, it.status);
        setStatus(it, status);
      });
    },
    set(id, field, value) {
      return edit(id, (it) => { if (value === null) delete it.fields[field]; else it.fields[field] = value; });
    },
    label(id, op, label) {
      return edit(id, (it) => { it.labels = it.labels.filter((l) => l !== label); if (op === 'add') it.labels.push(label); });
    },
    assign(id, user) { return edit(id, (it) => { it.assignees = user ? [user] : []; }); },
    async comment(id, body) {
      const db = load();
      find(db, id);
      const list = (db.comments[id] ??= []);
      const c: Comment = { id: String(list.length + 1), author: 'local', createdAt: now(), body, url: `local:${id}#${list.length + 1}` };
      list.push(c);
      save(db);
      return { id: c.id, url: c.url };
    },
    async comments(id, q = {}) {
      let list = [...(load().comments[id] ?? [])].reverse();
      if (q.marker) list = list.filter((c) => c.body.split('\n')[0].includes(q.marker!));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) {
      return edit(id, (it) => setStatus(it, reason === 'completed' ? 'Done' : 'Cancelled'));
    },
    child(parent, child) {
      return edit(parent, (p, db) => {
        const c = find(db, child);
        c.parent = parent;
        if (!p.children.includes(child)) p.children.push(child);
      });
    },
  };
}

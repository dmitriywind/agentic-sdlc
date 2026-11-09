// GitHub Projects v2 through `gh`. Field and option ids are looked up by name and cached.
import type { AdapterContext, Board, Comment, Item, LogicalField } from '../ports.ts';
import { MovedError } from '../ports.ts';

type Field = { id: string; name: string; options?: { id: string; name: string }[] };
const DEFAULT_FIELDS: Record<LogicalField, string> = { size: 'Size', priority: 'Priority', lane: 'Lane', shipped: 'Shipped', release_version: 'Release Version' };

export function createGithubBoard(ctx: AdapterContext): Board {
  const o = ctx.options as { owner: string; project_number: number | string; repo: string; token_env?: string };
  const num = String(o.project_number);
  // Projects v2 needs a PAT with project scope; it may differ from the forge's token.
  const env = () => {
    if (!o.token_env) return undefined;
    const t = ctx.env[o.token_env];
    if (!t) throw new Error(`set ${o.token_env} (board.options.token_env) for the GitHub board`);
    return { ...ctx.env, GH_TOKEN: t };
  };
  const gh = (args: string[]) => ctx.exec('gh', args, { env: env() });
  const json = (args: string[]) => JSON.parse(gh(args) || 'null');
  const fieldName = (f: LogicalField) => ctx.binding?.board?.fields?.[f] ?? DEFAULT_FIELDS[f];
  let projectId: string | undefined;
  let fieldCache: Field[] | undefined;
  const pid = () => (projectId ??= json(['project', 'view', num, '--owner', o.owner, '--format', 'json']).id);
  const fields = () => (fieldCache ??= json(['project', 'field-list', num, '--owner', o.owner, '--format', 'json']).fields as Field[]);
  const field = (name: string) => {
    const f = fields().find((x) => x.name === name);
    if (!f) throw new Error(`the board has no field '${name}'`);
    return f;
  };
  const itemId = (id: string) =>
    json(['project', 'item-add', num, '--owner', o.owner, '--url', `https://github.com/${o.repo}/issues/${id}`, '--format', 'json']).id as string;
  const edit = (id: string, f: Field, rest: string[]) =>
    gh(['project', 'item-edit', '--project-id', pid(), '--id', itemId(id), '--field-id', f.id, ...rest]);
  const setOption = (id: string, name: string, option: string) => {
    const f = field(name);
    const opt = f.options?.find((x) => x.name === option);
    if (!opt) throw new Error(`the board has no field '${name}' with an option '${option}'`);
    edit(id, f, ['--single-select-option-id', opt.id]);
  };
  // item-list keys fields by name with a lowercase first letter ("Release Version" -> "release Version").
  const raw = (it: any, name: string): string | undefined => {
    const v = it[name] ?? it[name[0].toLowerCase() + name.slice(1)] ?? it[name.toLowerCase()];
    return v === undefined || v === null ? undefined : String(v);
  };
  const toItem = (it: any): Item => {
    const fs: Item['fields'] = {};
    for (const k of Object.keys(DEFAULT_FIELDS) as LogicalField[]) {
      const v = raw(it, fieldName(k));
      if (v !== undefined) fs[k] = v;
    }
    const c = it.content ?? {};
    return {
      id: String(c.number), title: c.title ?? it.title, url: c.url ?? '', status: it.status ?? '', labels: it.labels ?? [], fields: fs,
      milestone: it.milestone?.title, children: [], assignees: it.assignees ?? [], createdAt: '', updatedAt: '',
    };
  };
  const items = (): any[] =>
    json(['project', 'item-list', num, '--owner', o.owner, '--limit', '1000', '--format', 'json']).items.filter((i: any) => i.content?.number !== undefined);
  const get = async (id: string): Promise<Item> => {
    const it = items().find((i) => String(i.content.number) === id);
    if (!it) throw new Error(`#${id} is not on the board`);
    const out = toItem(it);
    const v = json(['issue', 'view', id, '--repo', o.repo, '--json', 'body,createdAt,updatedAt,assignees,milestone,labels']);
    Object.assign(out, {
      body: v.body, createdAt: v.createdAt, updatedAt: v.updatedAt, assignees: v.assignees.map((a: any) => a.login),
      labels: v.labels.map((l: any) => l.name), milestone: v.milestone?.title,
    });
    try {
      const subs = json(['api', `repos/${o.repo}/issues/${id}/sub_issues`]) as any[];
      out.children = subs.map((s) => String(s.number));
      const p = json(['api', `repos/${o.repo}/issues/${id}/parent`]);
      if (p?.number) out.parent = String(p.number);
    } catch { /* no sub-issue support or no parent */ }
    return out;
  };
  const move = async (id: string, status: string, onlyFrom?: string) => {
    if (onlyFrom) {
      const cur = items().find((i) => String(i.content.number) === id)?.status ?? '';
      if (cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    }
    setOption(id, 'Status', status);
    return get(id);
  };

  return {
    async list(q = {}) {
      const hits = q.search
        ? new Set((json(['issue', 'list', '--repo', o.repo, '--state', 'all', '--search', q.search, '--limit', '200', '--json', 'number']) as any[]).map((x) => String(x.number)))
        : undefined;
      return items().map(toItem).filter((i) => (!hits || hits.has(i.id)) && (!q.status?.length || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label)));
    },
    get,
    async create(t) {
      const args = ['issue', 'create', '--repo', o.repo, '--title', t.title, '--body', t.body];
      for (const l of t.labels ?? []) args.push('--label', l);
      if (t.milestone) args.push('--milestone', t.milestone);
      const id = gh(args).trim().split('/').pop()!;
      await move(id, t.status);
      if (t.parent) await this.child(t.parent, id);
      return get(id);
    },
    move,
    async set(id, f, value) {
      const fd = field(fieldName(f));
      if (value === null) edit(id, fd, ['--clear']);
      else if (fd.options) setOption(id, fd.name, value);
      else edit(id, fd, ['--text', value]);
      return get(id);
    },
    async label(id, op, label) {
      gh(['issue', 'edit', id, '--repo', o.repo, op === 'add' ? '--add-label' : '--remove-label', label]);
      return get(id);
    },
    async assign(id, user) {
      if (user) gh(['issue', 'edit', id, '--repo', o.repo, '--add-assignee', user]);
      else for (const a of (await get(id)).assignees) gh(['issue', 'edit', id, '--repo', o.repo, '--remove-assignee', a]);
      return get(id);
    },
    async comment(id, body) {
      const url = gh(['issue', 'comment', id, '--repo', o.repo, '--body', body]).trim();
      return { id: url.split('issuecomment-')[1] ?? url, url };
    },
    async comments(id, q = {}) {
      const all = (json(['api', `repos/${o.repo}/issues/${id}/comments`, '--paginate', '--slurp']) as any[][]).flat();
      let list: Comment[] = all
        .map((c) => ({ id: String(c.id), author: c.user?.login ?? '', createdAt: c.created_at, body: c.body ?? '', url: c.html_url }))
        .reverse();
      if (q.marker) list = list.filter((c) => c.body.split('\n')[0].includes(q.marker!));
      return q.last ? list.slice(0, q.last) : list;
    },
    async close(id, reason) {
      gh(['issue', 'close', id, '--repo', o.repo, '--reason', reason === 'completed' ? 'completed' : 'not planned']);
      return move(id, reason === 'completed' ? 'Done' : 'Cancelled');
    },
    async child(parent, child) {
      const cid = json(['api', `repos/${o.repo}/issues/${child}`]).id;
      gh(['api', `repos/${o.repo}/issues/${parent}/sub_issues`, '-X', 'POST', '-F', `sub_issue_id=${cid}`]);
      return get(parent);
    },
  };
}

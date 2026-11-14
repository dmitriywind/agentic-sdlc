// The repo's GitHub issues as the board, through `gh api repos/{owner}/{repo}/…` REST only (a Claude cloud
// session reaches nothing else). Status and the logical fields are labels "<name>:<value>": `status:` and the
// lower-cased board.fields name (`size:S`, `release version:1.2`). An issue without a status label is off the board.
import type { AdapterContext, Board, Comment, Item, LogicalField } from '../ports.ts';
import { MovedError } from '../ports.ts';

const LOGICAL: LogicalField[] = ['size', 'priority', 'lane', 'shipped', 'release_version'];
const STATUS = 'status:';
const PAGE = 100;

export function createGithubIssuesBoard(ctx: AdapterContext): Board {
  const repo = String((ctx.options as { repo: string }).repo);
  const api = (method: string, path: string, body?: unknown) => {
    const args = ['api', '-X', method, `repos/${repo}/${path}`];
    if (body !== undefined) args.push('--input', '-');
    const out = ctx.exec('gh', args, body === undefined ? {} : { input: JSON.stringify(body) });
    return out.trim() ? JSON.parse(out) : null;
  };
  const all = (path: string): any[] => {
    const out: any[] = [];
    for (let page = 1; ; page++) {
      const r: any[] = api('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=${PAGE}&page=${page}`) ?? [];
      out.push(...r);
      if (r.length < PAGE) return out;
    }
  };
  const prefix = (f: LogicalField) => `${(ctx.binding?.board?.fields?.[f] ?? f).toLowerCase()}:`;
  const names = (i: any): string[] => (i.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name));
  const statusOf = (i: any) => names(i).find((l) => l.toLowerCase().startsWith(STATUS))?.slice(STATUS.length);
  const toItem = (i: any): Item => {
    const fields: Item['fields'] = {}, labels: string[] = [];
    let status = '';
    for (const l of names(i)) {
      const low = l.toLowerCase();
      const f = LOGICAL.find((k) => low.startsWith(prefix(k)));
      if (f) fields[f] = l.slice(prefix(f).length);
      else if (low.startsWith(STATUS)) status = l.slice(STATUS.length);
      else labels.push(l);
    }
    return {
      id: String(i.number), title: i.title, url: i.html_url ?? '', status, labels, fields, milestone: i.milestone?.title ?? undefined,
      children: [], assignees: (i.assignees ?? []).map((a: any) => a.login), createdAt: i.created_at ?? '', updatedAt: i.updated_at ?? '', body: i.body ?? '',
    };
  };
  let known: Set<string> | undefined;
  const ensureLabels = (ls: string[]) => {
    known ??= new Set(all('labels').map((l) => String(l.name).toLowerCase()));
    for (const name of ls) if (!known.has(name.toLowerCase())) { api('POST', 'labels', { name }); known.add(name.toLowerCase()); }
  };
  const issue = (id: string) => api('GET', `issues/${id}`);
  /** Replaces the issue's labels: drops those `drop` matches, adds `add`. */
  const relabel = (i: any, drop: (low: string) => boolean, add: string[], extra: Record<string, unknown> = {}) => {
    ensureLabels(add);
    const labels = [...new Set([...names(i).filter((l) => !drop(l.toLowerCase())), ...add])];
    api('PATCH', `issues/${i.number}`, { ...extra, labels });
  };
  const get = async (id: string): Promise<Item> => {
    const out = toItem(issue(id));
    try {
      out.children = all(`issues/${id}/sub_issues`).map((s) => String(s.number));
      const p = api('GET', `issues/${id}/parent`);
      if (p?.number) out.parent = String(p.number);
    } catch { /* no parent */ }
    return out;
  };
  const move = async (id: string, status: string, onlyFrom?: string, extra?: Record<string, unknown>) => {
    const i = issue(id);
    const cur = statusOf(i) ?? '';
    if (onlyFrom && cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    relabel(i, (l) => l.startsWith(STATUS), [STATUS + status], extra);
    return get(id);
  };
  const milestone = (title: string) => {
    const m = all('milestones?state=all').find((x) => x.title === title);
    if (!m) throw new Error(`${repo} has no milestone '${title}'`);
    return m.number as number;
  };

  return {
    async list(q = {}) {
      const words = (q.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      return all('issues?state=all')
        .filter((i) => !i.pull_request && statusOf(i) !== undefined)
        .filter((i) => words.every((w) => `${i.title}\n${i.body ?? ''}`.toLowerCase().includes(w)))
        .map(toItem)
        .filter((i) => (!q.status?.length || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label)));
    },
    get,
    async create(t) {
      const labels = [...new Set([...(t.labels ?? []), STATUS + t.status])];
      ensureLabels(labels);
      const body: Record<string, unknown> = { title: t.title, body: t.body, labels };
      if (t.milestone) body.milestone = milestone(t.milestone);
      const id = String(api('POST', 'issues', body).number);
      if (t.parent) await this.child(t.parent, id);
      return get(id);
    },
    move: (id, status, onlyFrom) => move(id, status, onlyFrom),
    async set(id, f, value) {
      const p = prefix(f);
      relabel(issue(id), (l) => l.startsWith(p), value === null ? [] : [p + value]);
      return get(id);
    },
    async label(id, op, label) {
      relabel(issue(id), (l) => op === 'remove' && l === label.toLowerCase(), op === 'add' ? [label] : []);
      return get(id);
    },
    async assign(id, user) {
      if (user) api('POST', `issues/${id}/assignees`, { assignees: [user] });
      else api('PATCH', `issues/${id}`, { assignees: [] });
      return get(id);
    },
    async comment(id, body) {
      const c = api('POST', `issues/${id}/comments`, { body });
      return { id: String(c.id), url: c.html_url };
    },
    async comments(id, q = {}) {
      let list: Comment[] = all(`issues/${id}/comments`)
        .map((c) => ({ id: String(c.id), author: c.user?.login ?? '', createdAt: c.created_at, body: c.body ?? '', url: c.html_url }))
        .reverse();
      if (q.marker) list = list.filter((c) => c.body.split('\n')[0].includes(q.marker!));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) {
      return move(id, reason === 'completed' ? 'Done' : 'Cancelled', undefined, { state: 'closed', state_reason: reason });
    },
    async child(parent, child) {
      api('POST', `issues/${parent}/sub_issues`, { sub_issue_id: issue(child).id });
      return get(parent);
    },
  };
}

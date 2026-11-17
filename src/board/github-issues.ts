// The repo's GitHub issues as the board, through `gh api repos/{owner}/{repo}/…` REST only (a Claude cloud
// session reaches nothing else). Status and the logical fields are labels "<name>:<value>": `status:` and the
// lower-cased board.fields name (`size:S`, `release version:1.2`). An issue without a status label is off the board.
// With board.options.field_ids, the status and each field it maps are org issue fields instead (GA 2026-07, typed fields
// on the issue, reached through `repos/*` too); a field it does not map stays a label.
import type { AdapterContext, Board, Comment, Item, LogicalField } from '../ports.ts';
import { MovedError } from '../ports.ts';
import { ghRetry } from '../exec.ts';

const LOGICAL: LogicalField[] = ['size', 'priority', 'lane', 'shipped', 'release_version'];
const STATUS = 'status:';
const PAGE = 100;
const FIELDS_API = ['-H', 'X-GitHub-Api-Version: 2026-03-10'];

export function createGithubIssuesBoard(ctx: AdapterContext): Board {
  const repo = String((ctx.options as { repo: string }).repo);
  const fieldIds = ((ctx.options as { field_ids?: Record<string, number> }).field_ids ?? {}) as Record<string, number>;
  // Every gh call retries on a rate limit, and a read also on a 5xx (ghRetry).
  const api = async (method: string, path: string, body?: unknown) => {
    const args = ['api', '-X', method, `repos/${repo}/${path}`, ...(Object.keys(fieldIds).length ? FIELDS_API : [])];
    if (body !== undefined) args.push('--input', '-');
    const out = await ghRetry(ctx.exec, args, body === undefined ? {} : { input: JSON.stringify(body) });
    return out.trim() ? JSON.parse(out) : null;
  };
  const all = async (path: string): Promise<any[]> => {
    const out: any[] = [];
    for (let page = 1; ; page++) {
      const r: any[] = (await api('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=${PAGE}&page=${page}`)) ?? [];
      out.push(...r);
      if (r.length < PAGE) return out;
    }
  };
  const prefix = (f: LogicalField) => `${(ctx.binding?.board?.fields?.[f] ?? f).toLowerCase()}:`;
  const names = (i: any): string[] => (i.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name));
  /** The value of a mapped issue field on a raw issue: the option name of a single select, else the value. */
  const fieldOf = (i: any, key: string): string | undefined => {
    const v = (i.issue_field_values ?? []).find((x: any) => x.issue_field_id === fieldIds[key]);
    return v ? String(v.single_select_option?.name ?? v.value) : undefined;
  };
  const statusOf = (i: any) => fieldIds.status ? fieldOf(i, 'status') : names(i).find((l) => l.toLowerCase().startsWith(STATUS))?.slice(STATUS.length);
  const toItem = (i: any): Item => {
    const fields: Item['fields'] = {}, labels: string[] = [];
    let status = '';
    for (const l of names(i)) {
      const low = l.toLowerCase();
      const f = LOGICAL.find((k) => low.startsWith(prefix(k)));
      if (f) fields[f] = l.slice(prefix(f).length);
      else if (low.startsWith(STATUS) && !fieldIds.status) status = l.slice(STATUS.length);
      else labels.push(l);
    }
    for (const f of LOGICAL) if (fieldIds[f]) { delete fields[f]; const v = fieldOf(i, f); if (v !== undefined) fields[f] = v; }
    if (fieldIds.status) status = statusOf(i) ?? '';
    return {
      id: String(i.number), title: i.title, url: i.html_url ?? '', status, labels, fields, milestone: i.milestone?.title ?? undefined,
      children: [], assignees: (i.assignees ?? []).map((a: any) => a.login), createdAt: i.created_at ?? '', updatedAt: i.updated_at ?? '', body: i.body ?? '',
      // The list carries no status change time: a closed issue at Done reached Done when it closed.
      ...(status === 'Done' && i.closed_at ? { statusChangedAt: i.closed_at as string } : {}),
    };
  };
  let known: Set<string> | undefined;
  const ensureLabels = async (ls: string[]) => {
    known ??= new Set((await all('labels')).map((l) => String(l.name).toLowerCase()));
    for (const name of ls) if (!known.has(name.toLowerCase())) { await api('POST', 'labels', { name }); known.add(name.toLowerCase()); }
  };
  const issue = (id: string) => api('GET', `issues/${id}`);
  /** Replaces the issue's labels: drops those `drop` matches, adds `add`. */
  const relabel = async (i: any, drop: (low: string) => boolean, add: string[], extra: Record<string, unknown> = {}) => {
    await ensureLabels(add);
    const labels = [...new Set([...names(i).filter((l) => !drop(l.toLowerCase())), ...add])];
    await api('PATCH', `issues/${i.number}`, { ...extra, labels });
  };
  /** Writes the status (key 'status') or a logical field: an issue field when mapped, else a label; null clears it. */
  const store = async (i: any, key: 'status' | LogicalField, value: string | null, extra: Record<string, unknown> = {}) => {
    if (!fieldIds[key]) { const p = key === 'status' ? STATUS : prefix(key); return relabel(i, (l) => l.startsWith(p), value === null ? [] : [p + value], extra); }
    if (Object.keys(extra).length) await api('PATCH', `issues/${i.number}`, extra);
    if (value === null) await api('DELETE', `issues/${i.number}/issue-field-values/${fieldIds[key]}`);
    else await api('POST', `issues/${i.number}/issue-field-values`, { issue_field_values: [{ field_id: fieldIds[key], value }] });
  };
  const get = async (id: string): Promise<Item> => {
    const raw = await issue(id);
    // A pull request, or an issue with no status label, is not a ticket on this board.
    if (raw.pull_request || statusOf(raw) === undefined) throw new Error(`#${id} is not on the board`);
    const out = toItem(raw);
    try {
      out.children = (await all(`issues/${id}/sub_issues`)).map((s) => String(s.number));
      const p = await api('GET', `issues/${id}/parent`);
      if (p?.number) out.parent = String(p.number);
    } catch { /* no parent */ }
    return out;
  };
  const move = async (id: string, status: string, onlyFrom?: string, extra?: Record<string, unknown>) => {
    const i = await issue(id);
    const cur = statusOf(i) ?? '';
    if (onlyFrom && cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    // GitHub has no compare-and-swap: a writer between this read and the write is not detected.
    await store(i, 'status', status, extra);
    return get(id);
  };
  const milestone = async (title: string) => {
    const m = (await all('milestones?state=all')).find((x) => x.title === title);
    if (!m) throw new Error(`${repo} has no milestone '${title}'`);
    return m.number as number;
  };

  return {
    async list(q = {}) {
      const words = (q.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      return (await all('issues?state=all'))
        .filter((i) => !i.pull_request && statusOf(i) !== undefined)
        .filter((i) => words.every((w) => `${i.title}\n${i.body ?? ''}`.toLowerCase().includes(w)))
        .map(toItem)
        .filter((i) => (!q.status?.length || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label)));
    },
    get,
    async create(t) {
      const labels = [...new Set([...(t.labels ?? []), ...(fieldIds.status ? [] : [STATUS + t.status])])];
      await ensureLabels(labels);
      const body: Record<string, unknown> = { title: t.title, body: t.body, labels };
      if (t.milestone) body.milestone = await milestone(t.milestone);
      const id = String((await api('POST', 'issues', body)).number);
      if (fieldIds.status) await store({ number: id }, 'status', t.status);
      if (t.parent) await this.child(t.parent, id);
      return get(id);
    },
    move: (id, status, onlyFrom) => move(id, status, onlyFrom),
    async set(id, f, value) {
      await store(await issue(id), f, value);
      return get(id);
    },
    async label(id, op, label) {
      await relabel(await issue(id), (l) => op === 'remove' && l === label.toLowerCase(), op === 'add' ? [label] : []);
      return get(id);
    },
    async assign(id, user) {
      await api('PATCH', `issues/${id}`, { assignees: user ? [user] : [] });
      return get(id);
    },
    async milestone(id, name) {
      await api('PATCH', `issues/${id}`, { milestone: name === null ? null : await milestone(name) });
      return get(id);
    },
    async comment(id, body) {
      const c = await api('POST', `issues/${id}/comments`, { body });
      return { id: String(c.id), url: c.html_url };
    },
    async comments(id, q = {}) {
      let list: Comment[] = (await all(`issues/${id}/comments`))
        .map((c) => ({ id: String(c.id), author: c.user?.login ?? '', createdAt: c.created_at, body: c.body ?? '', url: c.html_url }))
        .reverse();
      if (q.marker) list = list.filter((c) => c.body.split('\n')[0].includes(q.marker!));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) {
      return move(id, reason === 'completed' ? 'Done' : 'Cancelled', undefined, { state: 'closed', state_reason: reason });
    },
    async child(parent, child) {
      await api('POST', `issues/${parent}/sub_issues`, { sub_issue_id: (await issue(child)).id });
      return get(parent);
    },
  };
}

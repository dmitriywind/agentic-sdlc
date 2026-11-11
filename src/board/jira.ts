// Jira Cloud REST v3. Status moves are transitions to the named status.
import type { AdapterContext, Board, Comment, Item, LogicalField } from '../ports.ts';
import { MovedError } from '../ports.ts';

const LOGICAL: LogicalField[] = ['size', 'priority', 'lane', 'shipped', 'release_version'];
const adf = (text: string) => ({
  type: 'doc', version: 1,
  content: text.split('\n').filter((l) => l.trim()).map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] })),
});
const adfText = (n: any): string =>
  !n ? '' : typeof n.text === 'string' ? n.text : (n.content ?? []).map(adfText).join(n.type === 'doc' ? '\n' : '');

export function createJiraBoard(ctx: AdapterContext): Board {
  const o = ctx.options as { base_url: string; project_key: string; email_env: string; token_env: string };
  const base = o.base_url.replace(/\/$/, '');
  const auth = () => {
    const e = ctx.env[o.email_env], t = ctx.env[o.token_env];
    if (!e || !t) throw new Error(`set ${o.email_env} and ${o.token_env} for the Jira board`);
    return 'Basic ' + Buffer.from(`${e}:${t}`).toString('base64');
  };
  const api = (method: string, path: string, body?: unknown) =>
    ctx.http(method, `${base}/rest/api/3${path}`, { headers: { authorization: auth() }, body });
  const fieldName = (f: LogicalField) => ctx.binding?.board?.fields?.[f];
  let fieldCache: { id: string; name: string; schema?: { type?: string } }[] | undefined;
  const jiraField = async (f: LogicalField) => {
    const name = fieldName(f);
    if (!name) throw new Error(`binding board.fields.${f} is not set`);
    fieldCache ??= await api('GET', '/field');
    const hit = fieldCache!.find((x) => x.name === name);
    if (!hit) throw new Error(`Jira has no field '${name}'`);
    return hit;
  };
  const fieldIds = async () => {
    const m: Partial<Record<LogicalField, string>> = {};
    for (const f of LOGICAL) if (fieldName(f)) m[f] = (await jiraField(f)).id;
    return m;
  };
  const toItem = async (i: any): Promise<Item> => {
    const f = i.fields, ids = await fieldIds(), fs: Item['fields'] = {};
    for (const k of Object.keys(ids) as LogicalField[]) {
      const v = f[ids[k]!];
      if (v !== null && v !== undefined) fs[k] = typeof v === 'object' ? (v.value ?? v.name ?? '') : String(v);
    }
    return {
      id: i.key, title: f.summary, url: `${base}/browse/${i.key}`, status: f.status?.name ?? '', kind: f.issuetype?.name,
      labels: f.labels ?? [], fields: fs, milestone: f.fixVersions?.[0]?.name, parent: f.parent?.key,
      children: (f.subtasks ?? []).map((s: any) => s.key), assignees: f.assignee ? [f.assignee.accountId] : [],
      createdAt: f.created, updatedAt: f.updated, statusChangedAt: f.statuscategorychangedate, body: adfText(f.description),
    };
  };
  const fetchFields = async () => ['summary', 'status', 'issuetype', 'labels', 'parent', 'subtasks', 'assignee', 'created', 'updated', 'fixVersions', 'description', 'statuscategorychangedate', ...Object.values(await fieldIds())].join(',');
  const get = async (id: string) => toItem(await api('GET', `/issue/${id}?fields=${await fetchFields()}`));
  const transition = async (id: string, status: string) => {
    const t = (await api('GET', `/issue/${id}/transitions`)).transitions.find((x: any) => x.to?.name === status);
    if (!t) throw new Error(`${id} has no transition to '${status}'`);
    await api('POST', `/issue/${id}/transitions`, { transition: { id: t.id } });
  };
  const put = async (id: string, fields: Record<string, unknown>) => { await api('PUT', `/issue/${id}`, { fields }); return get(id); };
  const move = async (id: string, status: string, onlyFrom?: string) => {
    if (onlyFrom) {
      const cur = (await api('GET', `/issue/${id}?fields=status`)).fields.status.name;
      if (cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    }
    await transition(id, status);
    return get(id);
  };
  const quote = (s: string) => `"${s.replaceAll('"', '\\"')}"`;

  return {
    async list(q = {}) {
      const jql = [`project = ${o.project_key}`];
      if (q.status?.length) jql.push(`status in (${q.status.map(quote).join(',')})`);
      if (q.label) jql.push(`labels = ${quote(q.label)}`);
      if (q.search) jql.push(`text ~ ${quote(q.search)}`);
      const fields = (await fetchFields()).split(',');
      const issues: any[] = [];
      let nextPageToken: string | undefined;
      for (let page = 1; ; page++) {
        const r = await api('POST', '/search/jql', { jql: jql.join(' AND ') + ' ORDER BY created ASC', maxResults: 100, fields, ...(nextPageToken ? { nextPageToken } : {}) });
        issues.push(...r.issues);
        const next: string | undefined = r.isLast === true ? undefined : r.nextPageToken;
        if (!next) break;
        if (!r.issues.length || next === nextPageToken || page >= 500) throw new Error('jira: list does not advance (empty page, repeated token or over 500 pages); stopping');
        nextPageToken = next;
      }
      return Promise.all(issues.map(toItem));
    },
    get,
    async create(t) {
      const fields: Record<string, unknown> = {
        project: { key: o.project_key }, summary: t.title, description: adf(t.body), issuetype: { name: t.parent ? 'Sub-task' : 'Task' },
      };
      if (t.labels?.length) fields.labels = t.labels;
      if (t.parent) fields.parent = { key: t.parent };
      if (t.milestone) fields.fixVersions = [{ name: t.milestone }];
      const { key } = await api('POST', '/issue', { fields });
      return move(key, t.status);
    },
    move,
    async set(id, f, value) {
      const fd = await jiraField(f);
      return put(id, { [fd.id]: value === null ? null : fd.schema?.type === 'option' ? { value } : value });
    },
    async label(id, op, label) {
      await api('PUT', `/issue/${id}`, { update: { labels: [{ [op]: label }] } });
      return get(id);
    },
    async assign(id, user) {
      await api('PUT', `/issue/${id}/assignee`, { accountId: user });
      return get(id);
    },
    async comment(id, body) {
      const c = await api('POST', `/issue/${id}/comment`, { body: adf(body) });
      return { id: String(c.id), url: `${base}/browse/${id}?focusedCommentId=${c.id}` };
    },
    async comments(id, q = {}) {
      const raw: any[] = [];
      for (let page = 1; ; page++) {
        const r = await api('GET', `/issue/${id}/comment?orderBy=-created&maxResults=100&startAt=${raw.length}`);
        raw.push(...r.comments);
        if (raw.length >= r.total) break;
        if (!r.comments.length || page >= 500) throw new Error('jira: comments does not advance (empty page or over 500 pages); stopping');
      }
      let list: Comment[] = raw.map((c: any) => ({
        id: String(c.id), author: c.author?.accountId ?? '', createdAt: c.created, body: adfText(c.body), url: `${base}/browse/${id}?focusedCommentId=${c.id}`,
      }));
      if (q.marker) list = list.filter((c) => c.body.split('\n')[0].includes(q.marker!));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) { return move(id, reason === 'completed' ? 'Done' : 'Cancelled'); },
    async child(parent, child) {
      await api('PUT', `/issue/${child}`, { fields: { parent: { key: parent } } });
      return get(parent);
    },
  };
}

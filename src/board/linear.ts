// Linear GraphQL. Status = workflow state by name. Logical fields without a native home are labels "<field>:<value>".
import type { AdapterContext, Board, Comment, Item, LogicalField } from '../ports.ts';
import { MovedError } from '../ports.ts';

const LOGICAL: LogicalField[] = ['size', 'priority', 'lane', 'shipped', 'release_version'];
const ISSUE = `id identifier title url description createdAt updatedAt priority state { name } labels { nodes { id name } }
  assignee { id } parent { identifier } children { nodes { identifier } }`;

export function createLinearBoard(ctx: AdapterContext): Board {
  const o = ctx.options as { team_key: string; token_env: string };
  const gql = async (query: string, variables: Record<string, unknown> = {}) => {
    const token = ctx.env[o.token_env];
    if (!token) throw new Error(`set ${o.token_env} for the Linear board`);
    const r = await ctx.http('POST', 'https://api.linear.app/graphql', { headers: { authorization: token }, body: { query, variables } });
    if (r.errors?.length) throw new Error(`Linear: ${r.errors[0].message}`);
    return r.data;
  };
  const fieldName = (f: LogicalField) => ctx.binding?.board?.fields?.[f] ?? f;
  const nativePriority = () => fieldName('priority').toLowerCase() === 'priority';
  const priorities = () => ctx.binding?.priorities ?? [];
  let team: any;
  const getTeam = async () =>
    (team ??= (await gql(`query($k:String!){ teams(filter:{key:{eq:$k}}){ nodes { id states { nodes { id name } } labels { nodes { id name } } } } }`, { k: o.team_key })).teams.nodes[0]);
  const state = async (name: string) => {
    const s = (await getTeam()).states.nodes.find((x: any) => x.name === name);
    if (!s) throw new Error(`Linear team ${o.team_key} has no state '${name}'`);
    return s.id as string;
  };
  const labelId = async (name: string) => {
    const t = await getTeam();
    let l = t.labels.nodes.find((x: any) => x.name === name);
    if (!l) {
      l = (await gql(`mutation($i:IssueLabelCreateInput!){ issueLabelCreate(input:$i){ issueLabel { id name } } }`, { i: { teamId: t.id, name } })).issueLabelCreate.issueLabel;
      t.labels.nodes.push(l);
    }
    return l.id as string;
  };
  const prefix = (f: string) => `${f}:`;
  const toItem = (i: any): Item => {
    const fs: Item['fields'] = {}, labels: string[] = [];
    let milestone: string | undefined;
    for (const l of i.labels.nodes.map((x: any) => x.name as string)) {
      const f = LOGICAL.find((k) => !(k === 'priority' && nativePriority()) && l.startsWith(prefix(fieldName(k))));
      if (f) fs[f] = l.slice(prefix(fieldName(f)).length);
      else if (l.startsWith('milestone:')) milestone = l.slice(10);
      else labels.push(l);
    }
    if (nativePriority() && i.priority) fs.priority = priorities()[i.priority - 1] ?? String(i.priority);
    return {
      id: i.identifier, title: i.title, url: i.url, status: i.state.name, labels, fields: fs, milestone, parent: i.parent?.identifier,
      children: i.children.nodes.map((c: any) => c.identifier), assignees: i.assignee ? [i.assignee.id] : [],
      createdAt: i.createdAt, updatedAt: i.updatedAt, body: i.description ?? '',
    };
  };
  const raw = async (id: string) => (await gql(`query($id:String!){ issue(id:$id){ ${ISSUE} } }`, { id })).issue;
  const get = async (id: string) => toItem(await raw(id));
  const update = async (id: string, input: Record<string, unknown>) => {
    const u = (await raw(id)).id;
    const r = await gql(`mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ issue { ${ISSUE} } } }`, { id: u, i: input });
    return toItem(r.issueUpdate.issue);
  };
  const withLabels = async (id: string, change: (names: string[]) => string[]) => {
    const names = change((await raw(id)).labels.nodes.map((l: any) => l.name));
    return update(id, { labelIds: await Promise.all(names.map(labelId)) });
  };
  const move = async (id: string, status: string, onlyFrom?: string) => {
    if (onlyFrom) {
      const cur = (await raw(id)).state.name;
      if (cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    }
    return update(id, { stateId: await state(status) });
  };

  return {
    async list(q = {}) {
      const filter: any = { team: { key: { eq: o.team_key } } };
      if (q.status?.length) filter.state = { name: { in: q.status } };
      if (q.label) filter.labels = { name: { eq: q.label } };
      const ws = (q.search ?? '').split(/\s+/).filter(Boolean);
      if (ws.length) filter.and = ws.map((w) => ({ or: [{ title: { containsIgnoreCase: w } }, { description: { containsIgnoreCase: w } }] }));
      const r = await gql(`query($f:IssueFilter){ issues(filter:$f, first:250){ nodes { ${ISSUE} } } }`, { f: filter });
      return r.issues.nodes.map(toItem);
    },
    get,
    async create(t) {
      const names = [...(t.labels ?? []), ...(t.milestone ? [`milestone:${t.milestone}`] : [])];
      const input: any = {
        teamId: (await getTeam()).id, title: t.title, description: t.body, stateId: await state(t.status),
        labelIds: await Promise.all(names.map(labelId)),
      };
      if (t.parent) input.parentId = (await raw(t.parent)).id;
      const r = await gql(`mutation($i:IssueCreateInput!){ issueCreate(input:$i){ issue { ${ISSUE} } } }`, { i: input });
      return toItem(r.issueCreate.issue);
    },
    move,
    async set(id, f, value) {
      if (f === 'priority' && nativePriority()) {
        const n = value === null ? 0 : priorities().indexOf(value) + 1;
        if (value !== null && !n) throw new Error(`'${value}' is not in binding priorities`);
        return update(id, { priority: n });
      }
      const p = prefix(fieldName(f));
      return withLabels(id, (ls) => [...ls.filter((l) => !l.startsWith(p)), ...(value === null ? [] : [p + value])]);
    },
    label(id, op, label) {
      return withLabels(id, (ls) => (op === 'add' ? [...new Set([...ls, label])] : ls.filter((l) => l !== label)));
    },
    assign(id, user) { return update(id, { assigneeId: user }); },
    async comment(id, body) {
      const r = await gql(`mutation($i:CommentCreateInput!){ commentCreate(input:$i){ comment { id url } } }`, { i: { issueId: (await raw(id)).id, body } });
      return r.commentCreate.comment;
    },
    async comments(id, q = {}) {
      const r = await gql(`query($id:String!){ issue(id:$id){ comments { nodes { id body createdAt url user { id } } } } }`, { id });
      let list: Comment[] = r.issue.comments.nodes
        .map((c: any) => ({ id: c.id, author: c.user?.id ?? '', createdAt: c.createdAt, body: c.body, url: c.url }))
        .sort((a: Comment, b: Comment) => b.createdAt.localeCompare(a.createdAt));
      if (q.marker) list = list.filter((c) => c.body.split('\n')[0].includes(q.marker!));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) { return move(id, reason === 'completed' ? 'Done' : 'Cancelled'); },
    async child(parent, child) {
      await update(child, { parentId: (await raw(parent)).id });
      return get(parent);
    },
  };
}

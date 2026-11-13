import type { AdapterContext, CR, Forge, Run } from '../ports.ts';
import { parseCloses } from '../ports.ts';
import { secret } from './util.ts';

const ST: Record<string, 'success' | 'pending'> = { SUCCESS: 'success', PENDING: 'pending', EXPECTED: 'pending' };
const checkState = (c: any): 'success' | 'pending' | 'failure' =>
  c.__typename === 'StatusContext'
    ? ST[c.state] ?? 'failure'
    : c.status !== 'COMPLETED' ? 'pending'
    : ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(c.conclusion) ? 'success' : 'failure';

export function github(ctx: AdapterContext): Forge {
  const repo = ctx.options.repo as string | undefined;
  const api = `repos/${repo ?? '{owner}/{repo}'}`;
  // GH_TOKEN from the env var named by options[key]; status and approve use review_token_env, never the implementer's.
  const withToken = (key: string) => ({ ...ctx.env, GH_TOKEN: secret(ctx, key) });
  const gh = (a: string[], input?: string, env = ctx.options.token_env ? withToken('token_env') : undefined) =>
    ctx.exec('gh', repo && a[0] !== 'api' ? [...a, '-R', repo] : a, { cwd: ctx.root, input, env });
  const view = async (n: string): Promise<CR> => {
    const p = JSON.parse(gh(['api', `${api}/pulls/${n}`]));
    const roll = JSON.parse(gh(['pr', 'view', n, '--json', 'statusCheckRollup'])).statusCheckRollup ?? [];
    return {
      n: String(p.number), url: p.html_url, title: p.title, source: p.head.ref, target: p.base.ref,
      headSha: p.head.sha, baseSha: p.base.sha, draft: !!p.draft,
      state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed',
      behind: p.mergeable_state === 'behind', mergeSha: p.merged_at ? p.merge_commit_sha : undefined, closes: parseCloses(p.body ?? ''),
      checks: roll.map((c: any) => ({ name: c.name ?? c.context, state: checkState(c) })), body: p.body ?? '', author: p.user?.login ?? '',
    };
  };
  return {
    async open(o) {
      const args = ['pr', 'create', '--head', o.source, '--base', ctx.binding.vcs.trunk, '--title', o.title, '--body-file', '-'];
      if (o.draft) args.push('--draft');
      return view(gh(args, o.body).trim().split('/').pop()!);
    },
    view,
    async viewBySha(sha) {
      const ps = JSON.parse(gh(['api', `${api}/commits/${sha}/pulls`]));
      if (!ps.length) throw new Error(`no change request for ${sha}`);
      return view(String(ps[0].number));
    },
    async diff(n) { return gh(['pr', 'diff', n]); },
    async list(q = {}) {
      const rows = JSON.parse(gh(['pr', 'list', '--state', q.state ?? 'open', '--json', 'number', '--limit', '100']));
      return Promise.all(rows.map((r: any) => view(String(r.number))));
    },
    async closing(id) {
      const rows = JSON.parse(gh(['pr', 'list', '--state', 'merged', '--search', `"Closes ${id}" OR "Closes #${id}" in:body`, '--json', 'number', '--limit', '30']));
      return (await Promise.all(rows.map((r: any) => view(String(r.number))))).filter((c) => c.closes.includes(id));
    },
    async ready(n) { gh(['pr', 'ready', n]); return view(n); },
    async draft(n) { gh(['pr', 'ready', n, '--undo']); return view(n); },
    async sync(n) { gh(['pr', 'update-branch', n]); return view(n); },
    async automerge(n) { gh(['pr', 'merge', n, '--auto', '--squash']); return view(n); },
    async cut(revision, version) {
      gh(['workflow', 'run', 'agentic-sdlc-release.yml', '-f', `revision=${revision}`, '-f', `version=${version}`]);
      const [run] = JSON.parse(gh(['run', 'list', '--workflow', 'agentic-sdlc-release.yml', '-L', '1', '--json', 'databaseId,url']) || '[]');
      return { requested: true, ...(run ? { run: String(run.databaseId), url: run.url } : {}) };
    },
    async comment(n, body) {
      const url = gh(['pr', 'comment', n, '--body-file', '-'], body).trim();
      return { id: url.split('issuecomment-')[1] ?? url, url };
    },
    async comments(n) {
      const out = gh(['api', '--paginate', `${api}/issues/${n}/comments`, '--jq', '.[] | {id: (.id | tostring), author: .user.login, createdAt: .created_at, body: .body, url: .html_url}']);
      return out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    },
    async status(sha, s, opts) {
      const a = ['api', '-X', 'POST', `${api}/statuses/${sha}`, '-f', `state=${s.state}`, '-f', `context=${s.context}`, '-f', `description=${s.description}`];
      if (s.url) a.push('-f', `target_url=${s.url}`);
      gh(a, undefined, withToken(opts?.as === 'ci' ? 'token_env' : 'review_token_env'));
    },
    async approve(n) { gh(['pr', 'review', n, '--approve', '--body', 'agentic-sdlc review: PASS'], undefined, withToken('review_token_env')); },
    async approvals(n) {
      const out = gh(['api', '--paginate', `${api}/pulls/${n}/reviews`, '--jq', '.[] | {user: .user.login, state: (.state | ascii_downcase), sha: .commit_id}']);
      return out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    },
    async runs(q = {}) {
      const a = ['run', 'list', '--limit', '30', '--json', 'databaseId,name,headBranch,headSha,status,conclusion,url,createdAt'];
      if (q.ref) a.push('--branch', q.ref);
      if (q.failed) a.push('--status', 'failure');
      return JSON.parse(gh(a)).map((r: any): Run => ({
        id: String(r.databaseId), name: r.name, ref: r.headBranch, sha: r.headSha, url: r.url, at: r.createdAt,
        state: r.status !== 'completed' ? 'pending' : r.conclusion === 'success' ? 'success' : 'failure',
      }));
    },
  };
}

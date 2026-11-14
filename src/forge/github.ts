import type { AdapterContext, CR, Forge, Run } from '../ports.ts';
import { parseCloses } from '../ports.ts';
import { secret } from './util.ts';

type State = 'success' | 'pending' | 'failure';
const runState = (c: any): State =>
  c.status !== 'completed' ? 'pending' : ['success', 'neutral', 'skipped'].includes(c.conclusion) ? 'success' : 'failure';
const statusState = (s: any): State => (s.state === 'success' || s.state === 'pending' ? s.state : 'failure');

export function github(ctx: AdapterContext): Forge {
  const repo = ctx.options.repo as string | undefined;
  const api = `repos/${repo ?? '{owner}/{repo}'}`;
  // GH_TOKEN from the env var named by options[key]; status and approve use review_token_env, never the implementer's.
  const withToken = (key: string) => ({ ...ctx.env, GH_TOKEN: secret(ctx, key) });
  const gh = (a: string[], input?: string, env: NodeJS.ProcessEnv | undefined = ctx.options.token_env ? withToken('token_env') : undefined) =>
    ctx.exec('gh', repo && a[0] !== 'api' ? [...a, '-R', repo] : a, { cwd: ctx.root, input, env });
  // JSON body on stdin, so a long CR body never meets the argument length limit.
  const post = (path: string, data: unknown, env?: NodeJS.ProcessEnv) =>
    JSON.parse(gh(['api', '-X', 'POST', `${api}/${path}`, '--input', '-'], JSON.stringify(data), env));
  // A Claude cloud session's GitHub proxy refuses GraphQL and serves the GraphQL-only PR actions under pulls/{n}/ccr/.
  const cloud = ctx.env.CLAUDE_CODE_REMOTE === 'true';
  const ccr = (method: string, n: string, route: string, ...f: string[]) => gh(['api', '-X', method, `${api}/pulls/${n}/ccr/${route}`, ...f]);
  // A repo that cannot hold draft PRs (private on GitHub Free) marks a draft with the `draft` label instead.
  const labelled = (p: any) => (p.labels ?? []).some((l: any) => l.name === 'draft');
  const label = (n: string) => post(`issues/${n}/labels`, { labels: ['draft'] });
  const view = async (n: string): Promise<CR> => {
    const p = JSON.parse(gh(['api', `${api}/pulls/${n}`]));
    const runs = JSON.parse(gh(['api', `${api}/commits/${p.head.sha}/check-runs?per_page=100`])).check_runs ?? [];
    const statuses = JSON.parse(gh(['api', `${api}/commits/${p.head.sha}/status`])).statuses ?? [];
    // A push starts the check suites for its sha, so the first suite's creation is the push time.
    let pushedAt: string | undefined;
    try { pushedAt = gh(['api', `${api}/commits/${p.head.sha}/check-suites`, '--jq', '[.check_suites[].created_at] | min // empty']).trim() || undefined; }
    catch { /* no suites readable: unknown */ }
    if (pushedAt && Number.isNaN(Date.parse(pushedAt))) pushedAt = undefined;
    return {
      n: String(p.number), url: p.html_url, title: p.title, source: p.head.ref, target: p.base.ref,
      headSha: p.head.sha, baseSha: p.base.sha, draft: !!p.draft || labelled(p),
      state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed',
      behind: p.mergeable_state === 'behind', mergeSha: p.merged_at ? p.merge_commit_sha : undefined, closes: parseCloses(p.body ?? ''),
      checks: [
        ...runs.map((c: any) => ({ name: c.name, state: runState(c) })),
        ...statuses.map((s: any) => ({ name: s.context, state: statusState(s) })),
      ],
      body: p.body ?? '', author: p.user?.login ?? '',
      ...(pushedAt ? { pushedAt } : {}),
    };
  };
  return {
    async open(o) {
      const pr = { head: o.source, base: ctx.binding.vcs.trunk, title: o.title, body: o.body };
      let n: string;
      try { n = String(post('pulls', { ...pr, draft: !!o.draft }).number); }
      catch (e) {
        if (!o.draft || !/draft pull requests are not supported/i.test((e as Error).message)) throw e;
        n = String(post('pulls', pr).number);
        label(n);
      }
      return view(n);
    },
    view,
    async viewBySha(sha) {
      const ps = JSON.parse(gh(['api', `${api}/commits/${sha}/pulls`]));
      if (!ps.length) throw new Error(`no change request for ${sha}`);
      return view(String(ps[0].number));
    },
    async diff(n) { return gh(['api', `${api}/pulls/${n}`, '-H', 'Accept: application/vnd.github.diff']); },
    async list(q = {}) {
      const state = q.state === 'merged' ? 'closed' : q.state ?? 'open';
      const rows: any[] = JSON.parse(gh(['api', `${api}/pulls?state=${state}&per_page=100`]));
      return Promise.all(rows.filter((p) => q.state !== 'merged' || p.merged_at).map((p) => view(String(p.number))));
    },
    async closing(id) {
      const q = `repo:${repo ?? '{owner}/{repo}'} is:pr is:merged "Closes ${id}" OR "Closes #${id}" in:body`;
      const rows = JSON.parse(gh(['api', '-X', 'GET', 'search/issues', '-F', `q=${q}`, '-F', 'per_page=30'])).items ?? [];
      return (await Promise.all(rows.map((r: any) => view(String(r.number))))).filter((c) => c.closes.includes(id));
    },
    async ready(n) {
      if (labelled(JSON.parse(gh(['api', `${api}/pulls/${n}`])))) gh(['api', '-X', 'DELETE', `${api}/issues/${n}/labels/draft`]);
      else if (cloud) ccr('POST', n, 'ready_for_review');
      else gh(['pr', 'ready', n]);
      return view(n);
    },
    async draft(n) {
      try { if (cloud) ccr('POST', n, 'convert_to_draft'); else gh(['pr', 'ready', n, '--undo']); }
      catch { label(n); }
      return view(n);
    },
    async sync(n) { gh(['api', '-X', 'PUT', `${api}/pulls/${n}/update-branch`]); return view(n); },
    async automerge(n) {
      try {
        if (cloud) ccr('PUT', n, 'auto_merge', '-f', 'merge_method=squash');
        else gh(['pr', 'merge', n, '--auto', '--squash']);
      } catch (e) {
        // A trunk with no ruleset or branch protection gives auto-merge nothing to wait on, so GitHub refuses it:
        // merge now, but only a ready CR whose every required check is green on its head.
        const cr = await view(n);
        const green = (r: string) => cr.checks.some((c) => c.name === r && c.state === 'success');
        if (cr.draft || !(ctx.binding.forge.required_checks ?? []).every(green)) throw e;
        gh(['api', '-X', 'PUT', `${api}/pulls/${n}/merge`, '-f', 'merge_method=squash', '-f', `sha=${cr.headSha}`]);
      }
      return view(n);
    },
    async cut(revision, version) {
      const list = () => JSON.parse(gh(['run', 'list', '--workflow', 'agentic-sdlc-release.yml', '--event', 'workflow_dispatch', '-L', '5', '--json', 'databaseId,url']) || '[]') as { databaseId: number; url: string }[];
      const before = Math.max(0, ...list().map((r) => r.databaseId));
      gh(['workflow', 'run', 'agentic-sdlc-release.yml', '-f', `revision=${revision}`, '-f', `version=${version}`]);
      // The new run appears a few seconds after the dispatch; run ids only grow, so no clock is compared.
      for (let i = 0; i < 10; i++) {
        const run = list().filter((r) => r.databaseId > before).sort((a, b) => a.databaseId - b.databaseId)[0];
        if (run) return { requested: true, run: String(run.databaseId), url: run.url };
        if (i < 9) await new Promise((r) => setTimeout(r, 2_000));
      }
      return { requested: true };
    },
    async comment(n, body) {
      const c = post(`issues/${n}/comments`, { body });
      return { id: String(c.id), url: c.html_url };
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
    async approve(n) { post(`pulls/${n}/reviews`, { event: 'APPROVE', body: 'agentic-sdlc review: PASS' }, withToken('review_token_env')); },
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

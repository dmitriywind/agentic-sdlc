import type { AdapterContext, CR, Forge, Run } from '../ports.ts';
import { parseCloses } from '../ports.ts';
import { ghRetry } from '../exec.ts';
import { secret } from './util.ts';

type State = 'success' | 'pending' | 'failure';
const runState = (c: any): State =>
  c.status !== 'completed' ? 'pending' : ['success', 'neutral', 'skipped'].includes(c.conclusion) ? 'success' : 'failure';
const runOf = (r: any): Run => ({
  id: String(r.databaseId), name: r.name, ref: r.headBranch, sha: r.headSha, url: r.url, at: r.createdAt,
  state: r.status !== 'completed' ? 'pending' : r.conclusion === 'success' ? 'success' : 'failure',
});
const RUN_FIELDS = 'databaseId,name,headBranch,headSha,status,conclusion,url,createdAt';
const statusState = (s: any): State => (s.state === 'success' || s.state === 'pending' ? s.state : 'failure');

export function github(ctx: AdapterContext): Forge {
  const repo = ctx.options.repo as string | undefined;
  const api = `repos/${repo ?? '{owner}/{repo}'}`;
  // GH_TOKEN from the env var named by options[key]; with a review identity, status and approve use review_token_env, never the implementer's.
  // Ids reach `gh api` paths: a number or a hex sha, nothing else.
  const num = (n: string) => { if (!/^\d+$/.test(String(n))) throw new Error(`forge: not a change request number: ${n}`); return String(n); };
  const hex = (sha: string) => { if (!/^[0-9a-f]{7,40}$/i.test(String(sha))) throw new Error(`forge: not a commit sha: ${sha}`); return String(sha); };
  const withToken = (key: string) => ({ ...ctx.env, GH_TOKEN: secret(ctx, key) });
  // In a Claude cloud session the proxy injects the token, so an unset token_env falls back to it: one binding
  // serves CI (token_env set) and the cloud. The review token never falls back.
  const implementer = () => {
    const name = ctx.options.token_env as string | undefined;
    if (!name || (!ctx.env[name] && ctx.env.CLAUDE_CODE_REMOTE === 'true')) return undefined;
    return withToken('token_env');
  };
  // Every gh call retries on a rate limit, and a read also on a 5xx (ghRetry).
  const gh = (a: string[], input?: string, env: NodeJS.ProcessEnv | undefined = implementer()) =>
    ghRetry(ctx.exec, repo && a[0] !== 'api' ? [...a, '-R', repo] : a, { cwd: ctx.root, input, env });
  // JSON body on stdin, so a long CR body never meets the argument length limit.
  const post = async (path: string, data: unknown, env?: NodeJS.ProcessEnv) =>
    JSON.parse(await gh(['api', '-X', 'POST', `${api}/${path}`, '--input', '-'], JSON.stringify(data), env));
  // A Claude cloud session's GitHub proxy refuses GraphQL and serves the GraphQL-only PR actions under pulls/{n}/ccr/.
  const cloud = ctx.env.CLAUDE_CODE_REMOTE === 'true';
  const oneIdentity = !ctx.binding.forge.review_identity;
  const lines = (out: string): any[] => out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const ccr = (method: string, n: string, route: string, ...f: string[]) => gh(['api', '-X', method, `${api}/pulls/${n}/ccr/${route}`, ...f]);
  // A repo that cannot hold draft PRs (private on GitHub Free) marks a draft with the `draft` label instead.
  const labelled = (p: any) => (p.labels ?? []).some((l: any) => l.name === 'draft');
  const label = (n: string) => post(`issues/${n}/labels`, { labels: ['draft'] });
  const view = async (n: string): Promise<CR> => {
    n = num(n);
    const p = JSON.parse(await gh(['api', `${api}/pulls/${n}`]));
    // Every page: a failing check or a gate status must not fall off the first one.
    const runs = lines(await gh(['api', '--paginate', `${api}/commits/${p.head.sha}/check-runs?per_page=100`, '--jq', '.check_runs[]']));
    const statuses = lines(await gh(['api', '--paginate', `${api}/commits/${p.head.sha}/status?per_page=100`, '--jq', '.statuses[]']));
    // A push starts the check suites for its sha, so the first suite's creation is the push time.
    let pushedAt: string | undefined;
    try { pushedAt = (await gh(['api', `${api}/commits/${p.head.sha}/check-suites`, '--jq', '[.check_suites[].created_at] | min // empty'])).trim() || undefined; }
    catch { /* no suites readable: unknown */ }
    if (pushedAt && Number.isNaN(Date.parse(pushedAt))) pushedAt = undefined;
    return {
      n: String(p.number), url: p.html_url, title: p.title, source: p.head.ref, target: p.base.ref,
      headSha: p.head.sha, baseSha: p.base.sha, draft: !!p.draft || labelled(p),
      state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed',
      behind: p.mergeable_state === 'behind', mergeSha: p.merged_at ? p.merge_commit_sha : undefined, closes: parseCloses(p.body ?? ''),
      checks: [
        // A re-run adds a check run with the same name: only the newest (highest id) counts.
        ...Object.values(Object.fromEntries([...runs].sort((x: any, y: any) => x.id - y.id).map((c: any) => [c.name, c])))
          .map((c: any) => ({ name: c.name, state: runState(c) })),
        ...statuses.map((s: any) => ({ name: s.context, state: statusState(s) })),
      ],
      body: p.body ?? '', author: p.user?.login ?? '',
      ...(pushedAt ? { pushedAt } : {}),
    };
  };
  // A CR from a pulls list row: no check data and no behind/pushedAt, which cost API calls per CR.
  const fromRow = (p: any): CR => ({
    n: String(p.number), url: p.html_url, title: p.title, source: p.head.ref, target: p.base.ref,
    headSha: p.head.sha, baseSha: p.base.sha, draft: !!p.draft || labelled(p),
    state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed',
    behind: false, mergeSha: p.merged_at ? p.merge_commit_sha : undefined, closes: parseCloses(p.body ?? ''),
    checks: [], body: p.body ?? '', author: p.user?.login ?? '',
  });
  return {
    async open(o) {
      const pr = { head: o.source, base: ctx.binding.vcs.trunk, title: o.title, body: o.body };
      let n: string;
      try { n = String((await post('pulls', { ...pr, draft: !!o.draft })).number); }
      catch (e) {
        if (!o.draft || !/draft pull requests are not supported/i.test((e as Error).message)) throw e;
        n = String((await post('pulls', pr)).number);
        await label(n);
      }
      return view(n);
    },
    view,
    async viewBySha(sha) {
      const ps: any[] = JSON.parse(await gh(['api', `${api}/commits/${hex(sha)}/pulls`]));
      if (!ps.length) throw new Error(`no change request for ${sha}`);
      const is = (a?: string) => !!a && a.toLowerCase() === sha.toLowerCase();
      const hit = ps.find((p) => is(p.merge_commit_sha)) ?? ps.find((p) => is(p.head?.sha)) ?? ps[0];
      return view(String(hit.number));
    },
    async diff(n) { n = num(n); return gh(['api', `${api}/pulls/${n}`, '-H', 'Accept: application/vnd.github.diff']); },
    async list(q = {}) {
      const state = q.state === 'merged' ? 'closed' : q.state ?? 'open';
      const since = q.since ? Date.parse(q.since) : undefined;
      const at = (p: any) => Date.parse(q.state === 'merged' ? p.merged_at : p.updated_at);
      const keep = (p: any) => (q.state !== 'merged' || p.merged_at) && (since === undefined || at(p) >= since);
      let rows: any[];
      if (q.limit === undefined && since === undefined) {
        rows = JSON.parse(await gh(['api', `${api}/pulls?state=${state}&per_page=100`, '--paginate', '--slurp'])).flat().filter(keep);
      } else {
        // Newest first by update, one page at a time: stop at the limit, or at the first page older than `since`.
        rows = [];
        for (let page = 1; ; page++) {
          const r: any[] = JSON.parse(await gh(['api', `${api}/pulls?state=${state}&sort=updated&direction=desc&per_page=100&page=${page}`]));
          rows.push(...r.filter(keep));
          if (r.length < 100 || (q.limit !== undefined && rows.length >= q.limit)) break;
          if (since !== undefined && Date.parse(r[r.length - 1].updated_at) < since) break;
        }
        if (q.limit !== undefined) rows = rows.slice(0, q.limit);
      }
      // The list payload has no checks: a caller that reads them asks for `checks`.
      return Promise.all(rows.map((p) => (q.checks ? view(String(p.number)) : fromRow(p))));
    },
    async closing(id) {
      const q = `repo:${repo ?? '{owner}/{repo}'} is:pr is:merged "Closes ${id}" OR "Closes #${id}" in:body`;
      const rows = JSON.parse(await gh(['api', '-X', 'GET', 'search/issues', '-F', `q=${q}`, '-F', 'per_page=30'])).items ?? [];
      return (await Promise.all(rows.map((r: any) => view(String(r.number))))).filter((c) => c.closes.includes(id));
    },
    async ready(n) { n = num(n);
      if (labelled(JSON.parse(await gh(['api', `${api}/pulls/${n}`])))) await gh(['api', '-X', 'DELETE', `${api}/issues/${n}/labels/draft`]);
      else if (cloud) await ccr('POST', n, 'ready_for_review');
      else await gh(['pr', 'ready', n]);
      return view(n);
    },
    async draft(n) { n = num(n);
      try { if (cloud) await ccr('POST', n, 'convert_to_draft'); else await gh(['pr', 'ready', n, '--undo']); }
      catch { await label(n); }
      return view(n);
    },
    async sync(n) { n = num(n); await gh(['api', '-X', 'PUT', `${api}/pulls/${n}/update-branch`]); return view(n); },
    async automerge(n) { n = num(n);
      try {
        if (cloud) await ccr('PUT', n, 'auto_merge', '-f', 'merge_method=squash');
        else await gh(['pr', 'merge', n, '--auto', '--squash']);
      } catch (e) {
        // A trunk with no ruleset or branch protection gives auto-merge nothing to wait on, so GitHub refuses it:
        // merge now, but only a ready CR whose every required check is green on its head.
        const cr = await view(n);
        const green = (r: string) => cr.checks.some((c) => c.name === r && c.state === 'success');
        if (cr.draft || !(ctx.binding.forge.required_checks ?? []).every(green)) throw e;
        await gh(['api', '-X', 'PUT', `${api}/pulls/${n}/merge`, '-f', 'merge_method=squash', '-f', `sha=${cr.headSha}`]);
      }
      return view(n);
    },
    async cut(revision, version) {
      const list = async () => JSON.parse(await gh(['run', 'list', '--workflow', 'agentic-sdlc-release.yml', '--event', 'workflow_dispatch', '-L', '5', '--json', 'databaseId,url']) || '[]') as { databaseId: number; url: string }[];
      const before = Math.max(0, ...(await list()).map((r) => r.databaseId));
      await gh(['workflow', 'run', 'agentic-sdlc-release.yml', '-f', `revision=${revision}`, '-f', `version=${version}`]);
      // The new run appears a few seconds after the dispatch; run ids only grow, so no clock is compared.
      for (let i = 0; i < 10; i++) {
        const run = (await list()).filter((r) => r.databaseId > before).sort((a, b) => a.databaseId - b.databaseId)[0];
        if (run) return { requested: true, run: String(run.databaseId), url: run.url };
        if (i < 9) await new Promise((r) => setTimeout(r, 2_000));
      }
      return { requested: true };
    },
    async comment(n, body) { n = num(n);
      const c = await post(`issues/${n}/comments`, { body });
      return { id: String(c.id), url: c.html_url };
    },
    async comments(n) {
      n = num(n);
      const out = await gh(['api', '--paginate', `${api}/issues/${n}/comments`, '--jq', '.[] | {id: (.id | tostring), author: .user.login, createdAt: .created_at, body: .body, url: .html_url}']);
      return out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    },
    async status(sha, s, opts) {
      hex(sha);
      const a = ['api', '-X', 'POST', `${api}/statuses/${sha}`, '-f', `state=${s.state}`, '-f', `context=${s.context}`, '-f', `description=${s.description}`];
      if (s.url) a.push('-f', `target_url=${s.url}`);
      // One identity (no review_identity): the review status goes out with the implementer's own token.
      // { as: 'ci' }: the CI job's token (token_env, or gh's GH_TOKEN when token_env is unset).
      await gh(a, undefined, opts?.as === 'ci' || oneIdentity ? implementer() : withToken('review_token_env'));
    },
    async approve(n) {
      n = num(n);
      if (oneIdentity) throw new Error('one identity (forge.review_identity is empty): GitHub refuses an approving review from the CR\'s author; the review step skips forge approve');
      await post(`pulls/${n}/reviews`, { event: 'APPROVE', body: 'agentic-sdlc review: PASS' }, withToken('review_token_env'));
    },
    async approvals(n) {
      n = num(n);
      const out = await gh(['api', '--paginate', `${api}/pulls/${n}/reviews`, '--jq', '.[] | {user: .user.login, state: (.state | ascii_downcase), sha: .commit_id, assoc: .author_association}']);
      return out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    },
    async labelEvents(n) {
      n = num(n);
      const out = await gh(['api', '--paginate', `${api}/issues/${n}/events?per_page=100`, '--jq', '.[] | select(.event == "labeled" or .event == "unlabeled") | {label: .label.name, action: .event, actor: (.actor.login // ""), bot: (.actor.type == "Bot"), at: .created_at}']);
      return lines(out);
    },
    async unlabel(n, label) {
      n = num(n);
      try { await gh(['api', '-X', 'DELETE', `${api}/issues/${n}/labels/${encodeURIComponent(label)}`]); }
      catch (e) { if (!/404|Label does not exist/.test(String((e as Error).message))) throw e; }
    },
    async commits(n) {
      n = num(n);
      const out = await gh(['api', '--paginate', `${api}/pulls/${n}/commits?per_page=100`, '--jq', '.[] | {sha: .sha, message: .commit.message, author: (.author.login // ""), committer: (.committer.login // ""), authorName: (.commit.author.name // ""), committerName: (.commit.committer.name // ""), committerEmail: (.commit.committer.email // ""), parents: (.parents | length)}']);
      const rows = out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
      // The endpoint lists at most 250 commits: a full list may be cut off, so it is not trusted.
      if (rows.length >= 250) throw new Error(`forge: CR ${n} has ${rows.length} or more commits; the forge lists at most 250`);
      return rows;
    },
    async runs(q = {}) {
      const a = ['run', 'list', '--limit', '30', '--json', RUN_FIELDS];
      if (q.ref) a.push('--branch', q.ref);
      if (q.failed) a.push('--status', 'failure');
      return JSON.parse(await gh(a)).map(runOf);
    },
    async run(id) {
      if (!/^\d+$/.test(String(id))) throw new Error(`forge: not a run id: ${id}`);
      return runOf(JSON.parse(await gh(['run', 'view', String(id), '--json', RUN_FIELDS])));
    },
  };
}

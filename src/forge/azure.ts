import type { AdapterContext, Check, Comment, CR, Forge, Run } from '../ports.ts';
import { parseCloses } from '../ports.ts';
import { basic, localDiff, secret } from './util.ts';

const V = 'api-version=7.1';
const br = (r: string) => r.replace(/^refs\/heads\//, '');
const cs = (s: string): 'success' | 'failure' | 'pending' =>
  s === 'succeeded' || s === 'notApplicable' ? 'success' : s === 'failed' || s === 'error' ? 'failure' : 'pending';

export function azure(ctx: AdapterContext): Forge {
  const o = ctx.options as Record<string, string>;
  const org = o.org_url.replace(/\/$/, '');
  const proj = `${org}/${encodeURIComponent(o.project)}`;
  const git = `${proj}/_apis/git/repositories/${encodeURIComponent(o.repo)}`;
  const call = (m: string, url: string, body?: unknown, key = 'token_env') =>
    ctx.http(m, url + (url.includes('?') ? '&' : '?') + V, { headers: { authorization: basic('', secret(ctx, key)) }, body });
  const view = async (n: string): Promise<CR> => {
    const p = await call('GET', `${git}/pullrequests/${n}`);
    const st = await call('GET', `${git}/pullrequests/${n}/statuses`);
    return {
      n: String(p.pullRequestId), url: `${proj}/_git/${o.repo}/pullrequest/${p.pullRequestId}`, title: p.title,
      source: br(p.sourceRefName), target: br(p.targetRefName),
      headSha: p.lastMergeSourceCommit?.commitId ?? '', baseSha: p.lastMergeTargetCommit?.commitId ?? '',
      draft: !!p.isDraft, state: p.status === 'active' ? 'open' : p.status === 'completed' ? 'merged' : 'closed',
      mergeSha: p.lastMergeCommit?.commitId, behind: false, // ponytail: Azure DevOps exposes no "behind" flag; sync is unsupported anyway
      closes: parseCloses(p.description ?? ''),
      // The newest status per context wins: an older iteration's success does not hide a new pending.
      checks: [...new Map<string, Check>((st.value ?? []).sort((a: any, b: any) => a.id - b.id).map((s: any) => [s.context.name, { name: s.context.name, state: cs(s.state) }])).values()],
      body: p.description ?? '',
    };
  };
  const patch = async (n: string, body: unknown) => { await call('PATCH', `${git}/pullrequests/${n}`, body); return view(n); };
  return {
    async open(x) {
      const p = await call('POST', `${git}/pullrequests`, {
        sourceRefName: `refs/heads/${x.source}`, targetRefName: `refs/heads/${ctx.binding.vcs.trunk}`,
        title: x.title, description: x.body, isDraft: x.draft,
      });
      return view(String(p.pullRequestId));
    },
    view,
    async viewBySha(sha) {
      const r = await call('GET', `${git}/pullrequests?searchCriteria.status=completed&$top=100`);
      const p = r.value.find((x: any) => x.lastMergeCommit?.commitId === sha);
      if (!p) throw new Error(`no change request for ${sha}`);
      return view(String(p.pullRequestId));
    },
    // ponytail: no unified-diff endpoint; uses local git objects (fetch first)
    async diff(n) { return localDiff(ctx, await view(n)); },
    async list(q = {}) {
      const st = { open: 'active', merged: 'completed', all: 'all' }[q.state ?? 'open'];
      const r = await call('GET', `${git}/pullrequests?searchCriteria.status=${st}&$top=100`);
      return Promise.all(r.value.map((p: any) => view(String(p.pullRequestId))));
    },
    ready: (n) => patch(n, { isDraft: false }),
    draft: (n) => patch(n, { isDraft: true }),
    async sync() { throw new Error('azure: sync is not supported by Azure DevOps; rebase the source with vcs and push'); },
    async automerge(n) {
      const me = (await call('GET', `${org}/_apis/connectionData`)).authenticatedUser.id;
      return patch(n, { autoCompleteSetBy: { id: me }, completionOptions: { mergeStrategy: 'squash', deleteSourceBranch: true } });
    },
    async comment(n, body) {
      const t = await call('POST', `${git}/pullrequests/${n}/threads`, { comments: [{ content: body, commentType: 1 }], status: 1 });
      return { id: String(t.id) };
    },
    async comments(n) {
      const r = await call('GET', `${git}/pullrequests/${n}/threads`);
      return (r.value ?? []).flatMap((t: any) => t.comments ?? [])
        .filter((c: any) => c.commentType !== 'system' && !c.isDeleted)
        .map((c: any): Comment => ({ id: String(c.id), author: c.author?.uniqueName ?? c.author?.displayName ?? '', createdAt: c.publishedDate, body: c.content ?? '' }))
        .sort((a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt));
    },
    // Branch status policies read pull request statuses, so post on the PR iteration whose head is sha.
    async status(sha, s, opts) {
      const key = opts?.as === 'ci' ? 'token_env' : 'review_token_env';
      const r = await call('GET', `${git}/pullrequests?searchCriteria.status=active&$top=100`, undefined, key);
      const p = r.value.find((x: any) => x.lastMergeSourceCommit?.commitId === sha);
      if (!p) throw new Error(`azure: no active pull request has head ${sha}`);
      const its = await call('GET', `${git}/pullrequests/${p.pullRequestId}/iterations`, undefined, key);
      await call('POST', `${git}/pullrequests/${p.pullRequestId}/statuses`, {
        state: s.state === 'success' ? 'succeeded' : s.state === 'failure' ? 'failed' : 'pending',
        description: s.description, context: { name: s.context, genre: 'agentic-sdlc' }, targetUrl: s.url,
        iterationId: its.value?.at(-1)?.id,
      }, key);
    },
    async approve(n) {
      const me = (await call('GET', `${org}/_apis/connectionData`, undefined, 'review_token_env')).authenticatedUser.id;
      await call('PUT', `${git}/pullrequests/${n}/reviewers/${me}`, { vote: 10 }, 'review_token_env');
    },
    // ponytail: votes carry no commit; the head stands in, so the branch policy must reset votes on push.
    async approvals(n) {
      const p = await call('GET', `${git}/pullrequests/${n}`);
      const sha = p.lastMergeSourceCommit?.commitId ?? '';
      const vote = (v: number) => (v >= 5 ? 'approved' : v <= -5 ? 'changes_requested' : 'pending');
      return (p.reviewers ?? []).map((x: any) => ({ user: x.uniqueName ?? x.displayName ?? '', state: vote(x.vote), sha }));
    },
    async runs(q = {}) {
      const qs = new URLSearchParams();
      if (q.ref) qs.set('branchName', `refs/heads/${q.ref}`);
      if (q.failed) qs.set('resultFilter', 'failed');
      const r = await call('GET', `${proj}/_apis/build/builds?${qs}`);
      return r.value.map((b: any): Run => ({
        id: String(b.id), name: b.definition?.name ?? String(b.id), ref: br(b.sourceBranch), sha: b.sourceVersion,
        url: b._links?.web?.href ?? '', at: b.queueTime,
        state: b.status !== 'completed' ? 'pending' : b.result === 'succeeded' ? 'success' : 'failure',
      }));
    },
  };
}

import type { AdapterContext, CR, Forge, Run } from '../ports.ts';
import { parseCloses } from '../ports.ts';
import { secret } from './util.ts';

const DRAFT = /^\s*(draft:|\[draft\]|\(draft\))\s*/i;
const cs = (s: string): 'success' | 'failure' | 'pending' =>
  s === 'success' || s === 'skipped' ? 'success' : s === 'failed' || s === 'canceled' ? 'failure' : 'pending';

export function gitlab(ctx: AdapterContext): Forge {
  // No default host: a token is only ever sent to the base_url the binding names.
  if (!ctx.options.base_url) throw new Error('gitlab: forge.options.base_url is required (e.g. https://gitlab.com)');
  const root = String(ctx.options.base_url).replace(/\/$/, '');
  const base = `${root}/api/v4/projects/${encodeURIComponent(String(ctx.options.project))}`;
  const call = (m: string, p: string, body?: unknown, key = 'token_env') =>
    ctx.http(m, base + p, { headers: { 'PRIVATE-TOKEN': secret(ctx, key) }, body });
  const toCR = async (m: any): Promise<CR> => {
    const st = await call('GET', `/repository/commits/${m.sha}/statuses`);
    return {
      n: String(m.iid), url: m.web_url, title: m.title.replace(DRAFT, ''), source: m.source_branch, target: m.target_branch,
      headSha: m.sha, baseSha: m.diff_refs?.base_sha ?? '', draft: DRAFT.test(m.title) || !!m.draft,
      state: m.state === 'opened' ? 'open' : m.state === 'merged' ? 'merged' : 'closed',
      behind: m.detailed_merge_status === 'need_rebase', mergeSha: m.merge_commit_sha ?? m.squash_commit_sha ?? undefined, closes: parseCloses(m.description ?? ''),
      checks: st.map((s: any) => ({ name: s.name, state: cs(s.status) })), body: m.description ?? '',
    };
  };
  const view = async (n: string) => toCR(await call('GET', `/merge_requests/${n}`));
  const setTitle = async (n: string, fn: (t: string) => string) => {
    const m = await call('GET', `/merge_requests/${n}`);
    return toCR(await call('PUT', `/merge_requests/${n}`, { title: fn(m.title.replace(DRAFT, '')) }));
  };
  return {
    async open(o) {
      return toCR(await call('POST', '/merge_requests', {
        source_branch: o.source, target_branch: ctx.binding.vcs.trunk,
        title: o.draft ? `Draft: ${o.title}` : o.title, description: o.body,
      }));
    },
    view,
    async viewBySha(sha) {
      const ms = await call('GET', `/repository/commits/${sha}/merge_requests`);
      if (!ms.length) throw new Error(`no change request for ${sha}`);
      return view(String(ms[0].iid));
    },
    async diff(n) {
      const r = await call('GET', `/merge_requests/${n}/changes`);
      return r.changes.map((c: any) => `diff --git a/${c.old_path} b/${c.new_path}\n--- a/${c.old_path}\n+++ b/${c.new_path}\n${c.diff}`).join('');
    },
    async list(q = {}) {
      const st = { open: 'opened', merged: 'merged', all: 'all' }[q.state ?? 'open'];
      const ms = await call('GET', `/merge_requests?state=${st}&per_page=100`);
      return Promise.all(ms.map(toCR));
    },
    ready: (n) => setTitle(n, (t) => t),
    draft: (n) => setTitle(n, (t) => `Draft: ${t}`),
    async sync(n) { await call('PUT', `/merge_requests/${n}/rebase`); return view(n); },
    async automerge(n) { await call('PUT', `/merge_requests/${n}/merge`, { merge_when_pipeline_succeeds: true, squash: true }); return view(n); },
    async comment(n, body) {
      const r = await call('POST', `/merge_requests/${n}/notes`, { body });
      return { id: String(r.id) };
    },
    async status(sha, s) {
      await call('POST', `/statuses/${sha}`, {
        state: s.state === 'failure' ? 'failed' : s.state, name: s.context, description: s.description, target_url: s.url,
      }, 'review_token_env');
    },
    async approve(n) { await call('POST', `/merge_requests/${n}/approve`, {}, 'review_token_env'); },
    async runs(q = {}) {
      const qs = new URLSearchParams({ per_page: '30' });
      if (q.ref) qs.set('ref', q.ref);
      if (q.failed) qs.set('status', 'failed');
      return (await call('GET', `/pipelines?${qs}`)).map((p: any): Run => ({
        id: String(p.id), name: `pipeline ${p.id}`, ref: p.ref, sha: p.sha, url: p.web_url, at: p.created_at, state: cs(p.status),
      }));
    },
  };
}

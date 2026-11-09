import type { AdapterContext, CR, Forge, Run } from '../ports.ts';
import { parseCloses } from '../ports.ts';
import { MARKER, allGreen, localDiff, secret } from './util.ts';

const cs = (s: string): 'success' | 'failure' | 'pending' =>
  s === 'SUCCESSFUL' ? 'success' : s === 'FAILED' || s === 'STOPPED' ? 'failure' : 'pending';

export function bitbucket(ctx: AdapterContext): Forge {
  const o = ctx.options as Record<string, string>;
  const base = `https://api.bitbucket.org/2.0/repositories/${o.workspace}/${o.repo}`;
  const call = (m: string, p: string, body?: unknown, key = 'token_env') =>
    ctx.http(m, base + p, { headers: { authorization: `Bearer ${secret(ctx, key)}` }, body });
  const view = async (n: string): Promise<CR> => {
    const p = await call('GET', `/pullrequests/${n}`);
    const sha = p.source.commit.hash;
    const st = await call('GET', `/commit/${sha}/statuses`);
    const tip = await call('GET', `/refs/branches/${encodeURIComponent(p.destination.branch.name)}`);
    return {
      n: String(p.id), url: p.links.html.href, title: p.title, source: p.source.branch.name, target: p.destination.branch.name,
      headSha: sha, baseSha: p.destination.commit.hash, draft: !!p.draft,
      state: p.state === 'OPEN' ? 'open' : p.state === 'MERGED' ? 'merged' : 'closed',
      mergeSha: p.merge_commit?.hash, behind: tip.target.hash !== p.destination.commit.hash, closes: parseCloses(p.description ?? ''),
      checks: (st.values ?? []).map((s: any) => ({ name: s.name ?? s.key, state: cs(s.state) })), body: p.description ?? '',
    };
  };
  const put = async (n: string, body: unknown) => { await call('PUT', `/pullrequests/${n}`, body); return view(n); };
  const comment = async (n: string, raw: string) => {
    const c = await call('POST', `/pullrequests/${n}/comments`, { content: { raw } });
    return { id: String(c.id), url: c.links?.html?.href };
  };
  return {
    async open(x) {
      const p = await call('POST', '/pullrequests', {
        title: x.title, description: x.body, draft: x.draft,
        source: { branch: { name: x.source } }, destination: { branch: { name: ctx.binding.vcs.trunk } },
      });
      return view(String(p.id));
    },
    view,
    async viewBySha(sha) {
      const r = await call('GET', `/commit/${sha}/pullrequests`);
      if (!r.values?.length) throw new Error(`no change request for ${sha}`);
      return view(String(r.values[0].id));
    },
    // ponytail: the diff endpoint returns text the JSON http helper cannot read; uses local git objects (fetch first)
    async diff(n) { return localDiff(ctx, await view(n)); },
    async list(q = {}) {
      const st = { open: 'state=OPEN', merged: 'state=MERGED', all: 'state=OPEN&state=MERGED&state=DECLINED&state=SUPERSEDED' }[q.state ?? 'open'];
      const r = await call('GET', `/pullrequests?${st}&pagelen=50`);
      return Promise.all(r.values.map((p: any) => view(String(p.id))));
    },
    async ready(n) { return put(n, { draft: false }); },
    async draft(n) { return put(n, { draft: true }); },
    async sync() { throw new Error('bitbucket: sync is not supported by Bitbucket Cloud; rebase the source with vcs and push'); },
    async automerge(n) {
      const cr = await view(n);
      if (allGreen(cr, ctx.binding.forge.required_checks)) {
        await call('POST', `/pullrequests/${n}/merge`, { merge_strategy: 'squash' });
      } else {
        const cm = await call('GET', `/pullrequests/${n}/comments?pagelen=100`);
        if (!(cm.values ?? []).some((c: any) => c.content?.raw?.includes(MARKER))) await comment(n, `${MARKER}\nMerge when required checks are green.`);
      }
      return view(n);
    },
    comment,
    async status(sha, s) {
      await call('POST', `/commit/${sha}/statuses/build`, {
        key: s.context, name: s.context, description: s.description,
        state: s.state === 'success' ? 'SUCCESSFUL' : s.state === 'failure' ? 'FAILED' : 'INPROGRESS',
        url: s.url ?? `https://bitbucket.org/${o.workspace}/${o.repo}`,
      }, 'review_token_env');
    },
    async approve(n) { await call('POST', `/pullrequests/${n}/approve`, undefined, 'review_token_env'); },
    async runs(q = {}) {
      const r = await call('GET', '/pipelines/?sort=-created_on&pagelen=50');
      return (r.values ?? [])
        .map((p: any): Run => ({
          id: String(p.build_number ?? p.uuid), name: `pipeline ${p.build_number}`, ref: p.target?.ref_name ?? '',
          sha: p.target?.commit?.hash ?? '', at: p.created_on,
          url: `https://bitbucket.org/${o.workspace}/${o.repo}/pipelines/results/${p.build_number}`,
          state: p.state?.name !== 'COMPLETED' ? 'pending' : p.state?.result?.name === 'SUCCESSFUL' ? 'success' : 'failure',
        }))
        .filter((x: Run) => (!q.ref || x.ref === q.ref) && (!q.failed || x.state === 'failure'));
    },
  };
}

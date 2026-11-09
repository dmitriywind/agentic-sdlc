import type { AdapterContext, CR, Check, Forge, Run } from '../ports.ts';
import { parseCloses } from '../ports.ts';
import { MARKER, allGreen, basic, secret, title1 } from './util.ts';

const STATUS = /<!-- agentic-sdlc:status:(.+?):(pending|success|failure) -->/g;
const ts = (s: string | null): Check['state'] => (s === 'pass' ? 'success' : s === 'fail' ? 'failure' : s ? 'pending' : 'missing');

export function swarm(ctx: AdapterContext): Forge {
  const root = String(ctx.options.base_url).replace(/\/$/, '');
  const reviewUser = String(ctx.options.review_user ?? '');
  // Status and approve act as the review identity: options.review_user with its ticket in review_token_env.
  const auth = (review: boolean) => {
    if (!review) return basic(secret(ctx, 'user_env'), secret(ctx, 'ticket_env'));
    if (!reviewUser) throw new Error('swarm: forge.options.review_user is required for status and approve');
    return basic(reviewUser, secret(ctx, 'review_token_env'));
  };
  const call = (m: string, p: string, body?: unknown, review = false) =>
    ctx.http(m, `${root}/api/v11${p}`, { headers: { authorization: auth(review) }, body });
  const reviews = (r: any): any[] => r.data?.reviews ?? r.reviews ?? [];
  const comments = async (n: string): Promise<any[]> => (await call('GET', `/comments?topic=reviews/${n}&max=100`)).data?.comments ?? [];
  const view = async (n: string): Promise<CR> => {
    const g = await call('GET', `/reviews/${n}`);
    const r = reviews(g)[0] ?? g.review ?? g;
    const changes: number[] = r.pending ? (r.changes ?? []) : (r.commits ?? r.changes ?? []);
    const head = String(changes[changes.length - 1] ?? r.versions?.at(-1)?.change ?? '');
    const checks = new Map<string, Check['state']>();
    if (r.testStatus) checks.set('swarm-tests', ts(r.testStatus));
    // Only the review identity's markers count; any account can write a comment.
    for (const c of await comments(n)) {
      if (!reviewUser || c.user !== reviewUser) continue;
      for (const m of String(c.body).matchAll(STATUS)) checks.set(m[1], m[2] as Check['state']);
    }
    const merged = r.state === 'approved' && (r.commits?.length ?? 0) > 0;
    return {
      n: String(r.id), url: `${root}/reviews/${r.id}`, title: title1(r.description), source: head, target: ctx.binding.vcs.trunk,
      headSha: head, baseSha: '', draft: r.state === 'needsRevision',
      state: merged ? 'merged' : r.state === 'archived' || r.state === 'rejected' ? 'closed' : 'open',
      mergeSha: merged ? head : undefined, behind: false, closes: parseCloses(r.description ?? ''),
      checks: [...checks].map(([name, state]) => ({ name, state })), body: r.description ?? '',
    };
  };
  const setState = async (n: string, state: string, extra: object = {}) => {
    await call('PATCH', `/reviews/${n}/state`, { state, ...extra });
    return view(n);
  };
  const comment = async (n: string, body: string, review = false) => {
    const c = await call('POST', '/comments', { topic: `reviews/${n}`, body }, review);
    return { id: String(c.data?.comment?.id ?? c.comment?.id ?? ''), url: `${root}/reviews/${n}` };
  };
  return {
    async open(x) {
      // source is the shelved changelist number; description = title line + body so parseCloses sees it
      const r = await call('POST', '/reviews', { change: x.source, description: `${x.title}\n\n${x.body}` });
      const id = String(r.data?.review?.id ?? r.review?.id ?? r.id);
      return x.draft ? setState(id, 'needsRevision') : view(id);
    },
    view,
    async viewBySha(sha) {
      const id = reviews(await call('GET', `/reviews?change[]=${sha}&max=1`))[0]?.id;
      if (!id) throw new Error(`no change request for ${sha}`);
      return view(String(id));
    },
    // ponytail: file list only, Swarm has no unified-diff endpoint; use p4 describe for content
    async diff(n) {
      const r = await call('GET', `/reviews/${n}/files`);
      return (r.data?.files ?? []).map((f: any) => `${f.action ?? 'edit'} ${f.depotFile}`).join('\n');
    },
    async list(q = {}) {
      const st = { open: 'state[]=needsReview&state[]=needsRevision', merged: 'state[]=approved&committed=1', all: 'max=100' }[q.state ?? 'open'];
      const r = await call('GET', `/reviews?${st}&max=100`);
      return Promise.all(reviews(r).map((x: any) => view(String(x.id))));
    },
    ready: (n) => setState(n, 'needsReview'),
    draft: (n) => setState(n, 'needsRevision'),
    async sync() { throw new Error('swarm: sync does not apply; re-shelve the changelist with vcs push'); },
    async automerge(n) {
      const cr = await view(n);
      if (allGreen(cr, ctx.binding.forge.required_checks)) return setState(n, 'approved', { commit: true });
      if (!(await comments(n)).some((c) => String(c.body).includes(MARKER))) await comment(n, `${MARKER}\nCommit when required checks are green.`);
      return cr;
    },
    comment: (n, body) => comment(n, body),
    // ponytail: Swarm has no commit statuses; stored as marker comments on the review holding the changelist
    async status(sha, s) {
      const id = reviews(await call('GET', `/reviews?change[]=${sha}&max=1`))[0]?.id;
      if (!id) throw new Error(`swarm: no review holds changelist ${sha}`);
      await comment(String(id), `<!-- agentic-sdlc:status:${s.context}:${s.state} -->\n${s.context}: ${s.state} ${s.description}${s.url ? ` ${s.url}` : ''}`, true);
    },
    async approve(n) { await call('POST', `/reviews/${n}/vote`, { vote: 'up' }, true); },
    // ponytail: runs are the test status of open reviews, one per review
    async runs(q = {}) {
      const r = await call('GET', '/reviews?state[]=needsReview&max=50');
      return reviews(r)
        .map((x: any): Run => {
          const ch = x.changes ?? [];
          return {
            id: String(x.id), name: 'swarm-tests', ref: String(x.id), sha: String(ch[ch.length - 1] ?? ''), url: `${root}/reviews/${x.id}`,
            at: x.updated ? new Date(x.updated * 1000).toISOString() : '',
            state: x.testStatus === 'pass' ? 'success' : x.testStatus === 'fail' ? 'failure' : 'pending',
          };
        })
        .filter((x: Run) => (!q.ref || x.ref === q.ref) && (!q.failed || x.state === 'failure'));
    },
  };
}

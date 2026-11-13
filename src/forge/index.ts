import { readFileSync } from 'node:fs';
import type { AdapterContext, Forge, PortCli } from '../ports.ts';
import { selectComments } from '../comments.ts';
import { UsageError, guard, parseArgs } from './util.ts';
import { azure } from './azure.ts';
import { bitbucket } from './bitbucket.ts';
import { github } from './github.ts';
import { gitlab } from './gitlab.ts';

/** Status contexts only a gate posts. */
export const GATE_CONTEXTS = ['human-approval', 'ticket-linkage', 'proofs-on-base'];

const adapters = { github, gitlab, azure, bitbucket };

export function createForge(ctx: AdapterContext): Forge {
  const make = adapters[ctx.binding.forge.adapter];
  if (!make) throw new Error(`unknown forge adapter: ${ctx.binding.forge.adapter}`);
  return make(ctx);
}

export const cli: PortCli = (argv, ctx) =>
  guard(async () => {
    const [verb, ...rest] = argv;
    const a = parseArgs(rest, ['draft', 'failed', 'trusted']);
    const f = createForge({ ...ctx, options: ctx.binding.forge.options });
    const n = () => {
      if (!a.pos[0]) throw new UsageError(`forge ${verb}: argument is required`);
      return a.pos[0];
    };
    const body = () => readFileSync(a.need('body-file'), 'utf8');
    switch (verb) {
      case 'open': return f.open({ source: a.need('source'), title: a.need('title'), body: body(), draft: a.has('draft') });
      case 'view': return a.has('sha') ? f.viewBySha(a.get('sha')!) : f.view(n());
      case 'diff': return f.diff(n());
      case 'list': return f.list({ state: (a.get('state') ?? 'open') as 'open' | 'merged' | 'all' });
      case 'ready': return f.ready(n());
      case 'draft': return f.draft(n());
      case 'sync': return f.sync(n());
      case 'automerge': return f.automerge(n());
      case 'cut': {
        if (!f.cut) throw new Error(`forge ${ctx.binding.forge.adapter} has no release workflow: cut with \`vcs cut\` under the release credential`);
        if (!a.pos[1]) throw new UsageError('forge cut <revision> <version>');
        return f.cut(a.pos[0] ?? '', a.pos[1]);
      }
      case 'comment': return f.comment(n(), body());
      case 'comments':
        // Adapters return oldest first; the CLI answers newest first, as `board comments` does.
        return selectComments((await f.comments(n())).reverse(), {
          owners: ctx.binding.owners, authors: a.all('author'), trusted: a.has('trusted'),
          last: a.get('last') ? Number(a.get('last')) : undefined, marker: a.get('marker'),
        });
      case 'status': {
        const state = a.need('state');
        // Gates post these from CI through the port, never through this verb: an agent posting one would forge a gate.
        if (GATE_CONTEXTS.includes(a.need('context'))) throw new UsageError(`context '${a.need('context')}' is posted only by its gate`);
        if (!['pending', 'success', 'failure'].includes(state)) throw new UsageError('--state must be pending|success|failure');
        await f.status(n(), { context: a.need('context'), state: state as 'pending', description: a.need('description'), url: a.get('url') });
        return {};
      }
      case 'approve': await f.approve(n()); return {};
      case 'approvals': return f.approvals(n());
      case 'runs': return f.runs({ ref: a.get('ref'), failed: a.has('failed') });
      default: throw new UsageError(`unknown forge verb: ${verb ?? ''}`);
    }
  });

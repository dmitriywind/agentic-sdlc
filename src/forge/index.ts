import { ownersFor, type AdapterContext, type Forge, type PortCli } from '../ports.ts';
import { selectComments } from '../comments.ts';
import { UsageError, bodyFile, guard, parseStrict, type VerbSpec } from './util.ts';
import { github } from './github.ts';

/** Status contexts only a gate posts. */
export const GATE_CONTEXTS = ['human-approval', 'ticket-linkage', 'proofs-on-base', 'agent-provenance'];

const adapters = { github };

export function createForge(ctx: AdapterContext): Forge {
  const make = adapters[ctx.binding.forge.adapter];
  if (!make) throw new Error(`unknown forge adapter: ${ctx.binding.forge.adapter}`);
  return make(ctx);
}

/** The flags each verb accepts; anything else is a usage error. */
const VERBS: Record<string, VerbSpec> = {
  open: { value: ['source', 'title', 'body-file'], bool: ['draft'] },
  view: { value: ['sha'] },
  diff: {},
  list: { value: ['state', 'limit', 'since'], bool: ['checks'] },
  ready: {}, draft: {}, sync: {}, automerge: {}, cut: {},
  comment: { value: ['body-file'] },
  comments: { value: ['last', 'marker', 'author'], bool: ['trusted'] },
  status: { value: ['state', 'context', 'description', 'url'] },
  approve: {}, approvals: {},
  runs: { value: ['ref'], bool: ['failed'] },
  run: {},
};

export const cli: PortCli = (argv, ctx) =>
  guard(async () => {
    const [verb, ...rest] = argv;
    if (!verb || !Object.hasOwn(VERBS, verb)) throw new UsageError(`unknown forge verb: ${verb ?? ''}`);
    const a = parseStrict('forge', verb, rest, VERBS[verb]);
    const f = createForge({ ...ctx, options: ctx.binding.forge.options });
    const n = () => {
      if (!a.pos[0]) throw new UsageError(`forge ${verb}: argument is required`);
      return a.pos[0];
    };
    const body = () => bodyFile(a);
    switch (verb) {
      case 'open': return f.open({ source: a.need('source'), title: a.need('title'), body: body(), draft: a.has('draft') });
      case 'view': return a.has('sha') ? f.viewBySha(a.get('sha')!) : f.view(n());
      case 'diff': return f.diff(n());
      case 'list': {
        const limit = a.get('limit'), since = a.get('since');
        if (limit !== undefined && !/^[1-9]\d*$/.test(limit)) throw new UsageError('--limit must be a positive integer');
        if (since !== undefined && Number.isNaN(Date.parse(since))) throw new UsageError('--since must be an ISO date');
        return f.list({ state: (a.get('state') ?? 'open') as 'open' | 'merged' | 'all', limit: limit ? Number(limit) : undefined, since, checks: a.has('checks') });
      }
      case 'ready': return f.ready(n());
      case 'draft': return f.draft(n());
      case 'sync': return f.sync(n());
      case 'automerge': return f.automerge(n());
      case 'cut': {
        if (!a.pos[1]) throw new UsageError('forge cut <revision> <version>');
        return f.cut(a.pos[0] ?? '', a.pos[1]);
      }
      case 'comment': return f.comment(n(), body());
      case 'comments':
        // Adapters return oldest first; the CLI answers newest first, as `board comments` does.
        return selectComments((await f.comments(n())).reverse(), {
          owners: ownersFor(ctx.binding.owners, 'forge'), authors: a.all('author'), trusted: a.has('trusted'),
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
      case 'run': return f.run(n());
      case 'runs': return f.runs({ ref: a.get('ref'), failed: a.has('failed') });
      default: throw new UsageError(`unknown forge verb: ${verb}`);
    }
  });

import type { AdapterContext, PortCli, Vcs } from '../ports.ts';
import { UsageError, guard, parseArgs } from '../forge/util.ts';
import { git } from './git.ts';
import { hg } from './hg.ts';
import { p4 } from './p4.ts';

const adapters = { git, hg, p4 };

export function createVcs(ctx: AdapterContext): Vcs {
  const make = adapters[ctx.binding.vcs.adapter];
  if (!make) throw new Error(`unknown vcs adapter: ${ctx.binding.vcs.adapter}`);
  return make(ctx);
}

export const cli: PortCli = (argv, ctx) =>
  guard(async () => {
    const [verb, ...rest] = argv;
    const a = parseArgs(rest, ['stdin-prepush']);
    const v = createVcs({ ...ctx, options: ctx.binding.vcs.options ?? {} });
    const need = (i: number) => {
      if (!a.pos[i]) throw new UsageError(`vcs ${verb}: missing argument`);
      return a.pos[i];
    };
    switch (verb) {
      case 'start': return v.start(need(0));
      case 'head': return v.head();
      case 'changed': return v.changed(a.get('since'));
      case 'base': return v.base();
      case 'push': await v.push(); return {};
      case 'cut': return v.cut(need(0), need(1));
      case 'tag': await v.tag(need(0), need(1)); return {};
      case 'drop': await v.drop(need(0)); return {};
      case 'tags': return v.tags(a.get('prefix'));
      case 'checkout-tests': await v.checkoutTests(need(0), a.pos.slice(1)); return {};
      default: throw new UsageError(`unknown vcs verb: ${verb ?? ''}`);
    }
  });

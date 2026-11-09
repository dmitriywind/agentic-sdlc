import { readFileSync } from 'node:fs';
import type { AdapterContext, Board, LogicalField, PortCli } from '../ports.ts';
import { createGithubBoard } from './github.ts';
import { createJiraBoard } from './jira.ts';
import { createLinearBoard } from './linear.ts';
import { createLocalBoard } from './local.ts';

export function createBoard(ctx: AdapterContext): Board {
  const make = { github: createGithubBoard, jira: createJiraBoard, linear: createLinearBoard, local: createLocalBoard }[ctx.binding.board.adapter];
  if (!make) throw new Error(`unknown board adapter '${ctx.binding.board.adapter}'`);
  return make(ctx);
}

class Usage extends Error {}

/** `--flag value` (repeatable) and boolean flags; everything else is positional. */
function parse(argv: string[], bools: string[] = []) {
  const pos: string[] = [], flags: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const k = a.slice(2);
    if (bools.includes(k)) (flags[k] ??= []).push('true');
    else {
      if (i + 1 >= argv.length) throw new Usage(`--${k} needs a value`);
      (flags[k] ??= []).push(argv[++i]);
    }
  }
  return { pos, flags, one: (k: string) => flags[k]?.[0], has: (k: string) => k in flags };
}

const USAGE = `usage: agentic-sdlc board <verb>
  list [--status <s>]... [--label <l>] [--search <text>]    get <id>
  create --title <t> --body-file <f> --status <s> [--label <l>]... [--parent <id>] [--milestone <m>]
  move <id> <status> [--only-from <s>]    set <id> <field> <value> | --clear
  label <id> add|remove <label>           assign <id> <user> | --none
  comment <id> --body-file <f>            comments <id> [--last <n>] [--marker <text>] [--author <a>]... [--trusted]
  close <id> --reason completed|not_planned    child <parent> <child>`;

export const cli: PortCli = async (argv, base) => {
  const [verb, ...rest] = argv;
  try {
    if (!verb || verb === '--help') { console.log(USAGE); return verb ? 0 : 2; }
    const a = parse(rest, ['clear', 'none', 'trusted']);
    const need = (n: number) => { if (a.pos.length < n) throw new Usage(`board ${verb}: missing argument`); };
    const req = (k: string) => a.one(k) ?? (() => { throw new Usage(`board ${verb}: --${k} is required`); })();
    const body = () => readFileSync(req('body-file'), 'utf8');
    const board = createBoard({ ...base, options: base.binding.board.options });
    const [id] = a.pos;
    let out: unknown;
    switch (verb) {
      case 'list': out = await board.list({ status: a.flags.status, label: a.one('label'), search: a.one('search') }); break;
      case 'get': need(1); out = await board.get(id); break;
      case 'create':
        out = await board.create({
          title: req('title'), body: body(), status: req('status'), labels: a.flags.label, parent: a.one('parent'), milestone: a.one('milestone'),
        });
        break;
      case 'move': need(2); out = await board.move(id, a.pos[1], a.one('only-from')); break;
      case 'set':
        need(a.has('clear') ? 2 : 3);
        out = await board.set(id, a.pos[1] as LogicalField, a.has('clear') ? null : a.pos[2]);
        break;
      case 'label':
        need(3);
        if (a.pos[1] !== 'add' && a.pos[1] !== 'remove') throw new Usage('label: add or remove');
        out = await board.label(id, a.pos[1], a.pos[2]);
        break;
      case 'assign': need(a.has('none') ? 1 : 2); out = await board.assign(id, a.has('none') ? null : a.pos[1]); break;
      case 'comment': need(1); out = await board.comment(id, body()); break;
      case 'comments': {
        need(1);
        const last = a.one('last') ? Number(a.one('last')) : undefined;
        // --trusted: the binding's bots and owners, added to any --author.
        const o = base.binding.owners;
        const authors = [...(a.flags.author ?? []), ...(a.has('trusted') ? [...(o?.bots ?? []), o?.product, o?.factory] : [])].filter((x): x is string => !!x);
        const by = a.flags.author || a.has('trusted') ? authors.map((s) => s.toLowerCase()) : undefined;
        // --last applies after --author, so a forged comment never pushes a trusted one out.
        const list = await board.comments(id, { last: by ? undefined : last, marker: a.one('marker') });
        out = by ? list.filter((c) => by.includes(c.author?.toLowerCase())).slice(0, last) : list;
        break;
      }
      case 'close': {
        need(1);
        const r = req('reason');
        if (r !== 'completed' && r !== 'not_planned') throw new Usage('--reason completed|not_planned');
        out = await board.close(id, r);
        break;
      }
      case 'child': need(2); out = await board.child(id, a.pos[1]); break;
      default: throw new Usage(`unknown board verb '${verb}'`);
    }
    console.log(JSON.stringify(out, null, 2));
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return e instanceof Usage ? 2 : 1;
  }
};

import type { AdapterContext, Binding, Board, Comment, Hold, Item, LogicalField, PortCli } from '../ports.ts';
import { ownersFor } from '../ports.ts';
import { validateBinding } from '../binding.ts';
import { isMarked, matches, parseKind, selectComments, stamp, stampBody } from '../comments.ts';
import { UsageError, bodyFile, parseStrict, type VerbSpec } from '../forge/util.ts';
import { createGithubBoard } from './github.ts';
import { createGithubIssuesBoard } from './github-issues.ts';
import { createJiraBoard } from './jira.ts';
import { createLinearBoard } from './linear.ts';
import { createLocalBoard } from './local.ts';

export function createBoard(ctx: AdapterContext): Board {
  const make = { github: createGithubBoard, 'github-issues': createGithubIssuesBoard, jira: createJiraBoard, linear: createLinearBoard, local: createLocalBoard }[ctx.binding.board.adapter];
  if (!make) throw new Error(`unknown board adapter '${ctx.binding.board.adapter}'`);
  // The same required-option check `validate` runs: a missing key fails here, not as `gh ... undefined`.
  const missing = validateBinding({ ...ctx.binding, board: { ...ctx.binding.board, options: ctx.options } } as Binding)
    .map((m) => /^board\.options\.(\w+) is required/.exec(m)?.[1]).filter(Boolean).map((k) => `board.options.${k}`);
  if (missing.length) throw new Error(`board adapter '${ctx.binding.board.adapter}' needs binding keys: ${missing.join(', ')}; run: agentic-sdlc validate`);
  const board = checked(make(ctx), ctx);
  const scope = ctx.binding.board.scope;
  if (!scope?.label) return board;
  // Many repos, one board: a repo lists only tickets with its scope label; the home repo also lists
  // tickets with no label of that prefix, which triage gives a repo label. Every new ticket gets this repo's label.
  const pre = scope.label.slice(0, scope.label.indexOf(':') + 1);
  const mine = (i: Item) => i.labels.includes(scope.label) || (!!scope.home && !i.labels.some((l) => l.startsWith(pre)));
  return {
    ...board,
    list: async (q) => (await board.list(q)).filter(mine),
    create: (t) => board.create({ ...t, labels: [...new Set([...(t.labels ?? []), scope.label])] }),
  };
}

/** Refuses what no adapter should see: a status the binding does not list, and, on the GitHub boards, an id that is not an issue number. */
function checked(b: Board, ctx: AdapterContext): Board {
  const numeric = ctx.binding.board.adapter === 'github' || ctx.binding.board.adapter === 'github-issues';
  const statuses = ctx.binding.board.statuses;
  const id = (v: string | undefined) => {
    if (numeric && v !== undefined && !/^\d+$/.test(String(v))) throw new Error(`board: not an issue number: ${v}`);
    return v as string;
  };
  const status = (s: string) => {
    if (Array.isArray(statuses) && statuses.length && !statuses.includes(s)) throw new Error(`board: status '${s}' is not in board.statuses (${statuses.join(', ')})`);
    return s;
  };
  return {
    ...b,
    get: async (i) => b.get(id(i)),
    create: async (t) => { id(t.parent); status(t.status); return b.create(t); },
    move: async (i, s, from) => b.move(id(i), status(s), from),
    set: async (i, f, v) => b.set(id(i), f, v),
    label: async (i, op, l) => b.label(id(i), op, l),
    assign: async (i, u) => b.assign(id(i), u),
    milestone: async (i, m) => b.milestone(id(i), m),
    comment: async (i, body) => b.comment(id(i), body),
    comments: async (i, q) => b.comments(id(i), q),
    close: async (i, r) => b.close(id(i), r),
    child: async (p, c) => b.child(id(p), id(c)),
  };
}

const Usage = UsageError;

const asked = (c: Comment) => isMarked(c.body, 'ask');
const byTime = (x: Comment, y: Comment) => Date.parse(y.createdAt) - Date.parse(x.createdAt);

/** `board hold`: the human label, then the ask with the trigger as its marker ref. The trigger is one non-empty line. */
export async function hold(board: Board, b: Binding, id: string, kind: string, body: string): Promise<{ id: string; kind: string; comment: { id: string; url?: string } }> {
  const trigger = kind.trim();
  if (!trigger || /[\r\n]/.test(trigger)) throw new Usage('board hold: --kind is one non-empty line');
  const text = body.replace(/^### Needs human[^\n]*\n+/, '');
  await board.label(id, 'add', b.board.labels.human);
  const comment = await board.comment(id, `${stamp('ask', trigger)}\n\n${text.trim()}\n`);
  return { id, kind: trigger, comment };
}

/** `board holds`: every ticket with the human label, its last ask, and the owner-role reply after it if any (a bot never counts). */
export async function holds(board: Board, b: Binding): Promise<Hold[]> {
  const o = ownersFor(b.owners, 'board');
  const owners = new Set([...o.product, ...o.factory, ...o.operator, ...o.security, ...o.compliance].map((x) => x.toLowerCase()));
  const bots = new Set(o.bots.map((x) => x.toLowerCase()));
  const out: Hold[] = [];
  for (const item of await board.list({ label: b.board.labels.human })) {
    const all = [...(await board.comments(item.id))].sort(byTime);
    const ask = all.find(asked);
    const line = ask?.body.split('\n')[0].slice(matches('ask').length).replace(/^:\s*/, '').trim();
    const after = ask ? all.filter((c) => !asked(c) && Date.parse(c.createdAt) > Date.parse(ask.createdAt)) : [];
    const reply = after.find((c) => { const a = c.author?.toLowerCase(); return !!a && owners.has(a) && !bots.has(a); });
    out.push({
      id: item.id, kind: line || 'unspecified', askedAt: ask?.createdAt ?? item.updatedAt, replied: !!reply,
      ...(reply ? { reply: { author: reply.author, createdAt: reply.createdAt, ...(reply.url ? { url: reply.url } : {}) } } : {}),
    });
  }
  return out;
}

/** The flags each verb accepts; anything else is a usage error. */
export const VERBS: Record<string, VerbSpec> = {
  list: { value: ['status', 'label', 'search'] },
  get: {},
  create: { value: ['title', 'body-file', 'status', 'label', 'parent', 'milestone'] },
  move: { value: ['only-from'] },
  set: { bool: ['clear'] },
  label: {},
  assign: { bool: ['none'] },
  milestone: { bool: ['clear'] },
  comment: { value: ['body-file', 'kind', 'ref'] },
  comments: { value: ['last', 'marker', 'author', 'kind', 'ref'], bool: ['trusted'], num: ['last'] },
  hold: { value: ['kind', 'body-file'] },
  holds: {},
  release: {},
  close: { value: ['reason'] },
  child: {},
};

const USAGE = `usage: agentic-sdlc board <verb>
  list [--status <s>]... [--label <l>] [--search <text>]    get <id>
  create --title <t> --body-file <f> --status <s> [--label <l>]... [--parent <id>] [--milestone <m>]
  move <id> <status> [--only-from <s>]    set <id> <field> <value> | --clear
  milestone <id> <name> | --clear
  label <id> add|remove <label>           assign <id> <user> | --none
  comment <id> --body-file <f> [--kind <kind> [--ref <value>]]
  comments <id> [--last <n>] [--kind <kind> [--ref <value>] | --marker <text>] [--author <a>]... [--trusted]
  hold <id> --kind <trigger> --body-file <f>    holds    release <id>
  close <id> --reason completed|not_planned    child <parent> <child>`;

export const cli: PortCli = async (argv, base) => {
  const [verb, ...rest] = argv;
  try {
    if (!verb || verb === '--help') { console.log(USAGE); return verb ? 0 : 2; }
    if (!Object.hasOwn(VERBS, verb)) throw new Usage(`unknown board verb '${verb}'`);
    const a = parseStrict('board', verb, rest, VERBS[verb]);
    const need = (n: number) => { if (a.pos.length < n) throw new Usage(`board ${verb}: missing argument`); };
    const req = (k: string) => a.need(k);
    const body = () => bodyFile(a);
    const board = createBoard({ ...base, options: base.binding.board.options });
    const [id] = a.pos;
    let out: unknown;
    switch (verb) {
      case 'list': out = await board.list({ status: a.all('status'), label: a.get('label'), search: a.get('search') }); break;
      case 'get': need(1); out = await board.get(id); break;
      case 'create':
        out = await board.create({
          title: req('title'), body: body(), status: req('status'), labels: a.all('label'), parent: a.get('parent'), milestone: a.get('milestone'),
        });
        break;
      case 'move': need(2); out = await board.move(id, a.pos[1], a.get('only-from')); break;
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
      case 'comment': {
        need(1);
        if (a.has('ref') && !a.has('kind')) throw new Usage('board comment: --ref needs --kind');
        out = await board.comment(id, a.has('kind') ? stampBody(body(), parseKind(a.get('kind')!), a.get('ref'), { specMarker: base.binding.spec_marker }) : body());
        break;
      }
      case 'hold': need(1); out = await hold(board, base.binding, id, req('kind'), body()); break;
      case 'holds': out = await holds(board, base.binding); break;
      case 'release': need(1); out = await board.label(id, 'remove', base.binding.board.labels.human); break;
      case 'comments': {
        need(1);
        if (a.has('kind') && a.has('marker')) throw new Usage('board comments: --kind and --marker together');
        if (a.has('ref') && !a.has('kind')) throw new Usage('board comments: --ref needs --kind');
        const marker = a.has('kind') ? matches(parseKind(a.get('kind')!), a.get('ref'), { specMarker: base.binding.spec_marker }) : a.get('marker');
        // --trusted: the binding's bots and owners, added to any --author.
        out = selectComments(await board.comments(id, { marker }), {
          owners: ownersFor(base.binding.owners, 'board'), authors: a.all('author'), trusted: a.has('trusted'),
          last: a.get('last') ? Number(a.get('last')) : undefined, marker,
        });
        break;
      }
      case 'close': {
        need(1);
        const r = req('reason');
        if (r !== 'completed' && r !== 'not_planned') throw new Usage('--reason completed|not_planned');
        out = await board.close(id, r);
        break;
      }
      case 'milestone':
        need(a.has('clear') ? 1 : 2);
        if (a.has('clear') && a.pos.length > 1) throw new Usage('board milestone: a name and --clear together');
        out = await board.milestone(id, a.has('clear') ? null : a.pos[1]);
        break;
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

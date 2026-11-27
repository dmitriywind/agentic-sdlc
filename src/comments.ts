import type { Comment, Owners } from './ports.ts';
import { UsageError } from './forge/util.ts';

/**
 * The marker registry: the one table of comment kinds and the exact first line each carries.
 * A marker is always the first line of a comment; readers match it with `matches`, writers stamp it with `stamp`.
 * Formats are the ones existing boards already hold (references/architecture.md section 11.1).
 */
export const KINDS = ['spec', 'verdict', 'note', 'verify', 'manual-check', 'ask', 'heartbeat', 'scores', 'release-proposal', 'release-cut', 'dispatch', 'done'] as const;
export type Kind = (typeof KINDS)[number];

/** What the registry needs from the binding: the spec comment's first line (`spec_marker`). */
export type MarkerCtx = { specMarker?: string };

type Def = {
  /** none: no ref allowed; optional; required: `stamp` refuses a missing ref. */
  ref: 'none' | 'optional' | 'required';
  /** The text a first line starts with (a comment marker is `<!-- name`, closed by ` -->`). */
  open: (c: MarkerCtx) => string;
  /** How the marker is written: `<!-- name [ref] -->`, or a heading `### Needs human[: ref]`. */
  style: 'html' | 'text' | 'heading';
};
const html = (name: string, ref: Def['ref']): Def => ({ ref, style: 'html', open: () => `<!-- ${name}` });

const REGISTRY: Record<Kind, Def> = {
  spec: { ref: 'none', style: 'text', open: (c) => c.specMarker ?? 'spec.md' },
  verdict: html('verdict', 'optional'), // ref: the CR head sha
  note: html('note', 'optional'),
  verify: html('verify', 'optional'),
  'manual-check': html('manual-check', 'optional'), // ref: the head sha
  ask: { ref: 'optional', style: 'heading', open: () => '### Needs human' }, // ref: the trigger
  heartbeat: html('heartbeat', 'none'),
  scores: html('scores', 'none'),
  'release-proposal': html('release-proposal', 'required'), // ref: the revision
  'release-cut': html('release-cut', 'required'), // ref: the version
  dispatch: html('agentic-sdlc:dispatch', 'required'), // ref: the run key
  done: html('agentic-sdlc:done', 'required'), // ref: the run key
};

export const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

/** A kind from a flag: an unknown one is a usage error (exit 2). */
export function parseKind(k: string): Kind {
  if (!isKind(k)) throw new UsageError(`unknown comment kind '${k}' (kinds: ${KINDS.join(', ')})`);
  return k;
}

/** Kinds only one verb writes; `comment --kind` refuses them, so no step can post a verdict, a dispatch or a score by hand. */
const VERB_ONLY: Partial<Record<Kind, string>> = { verdict: 'forge verdict', dispatch: 'dispatch', scores: 'ledger record' };

/** A kind from `comment --kind`: as `parseKind`, and not a kind only a verb writes. */
export function parseWritableKind(k: string): Kind {
  const kind = parseKind(k);
  if (VERB_ONLY[kind]) throw new UsageError(`comment kind '${kind}' is written only by '${VERB_ONLY[kind]}'`);
  return kind;
}

const oneLine = (ref: string | undefined) => {
  if (ref !== undefined && (!ref.trim() || /[\r\n]/.test(ref))) throw new UsageError('--ref must be one non-empty line');
  return ref?.trim();
};

/** The first line of a comment of this kind. */
export function stamp(kind: Kind, ref?: string, ctx: MarkerCtx = {}): string {
  const d = REGISTRY[kind];
  const r = oneLine(ref);
  if (r !== undefined && d.ref === 'none') throw new UsageError(`comment kind '${kind}' takes no --ref`);
  if (r === undefined && d.ref === 'required') throw new UsageError(`comment kind '${kind}' needs --ref`);
  if (d.style === 'text') return d.open(ctx);
  if (d.style === 'heading') return r ? `${d.open(ctx)}: ${r}` : d.open(ctx);
  return r ? `${d.open(ctx)} ${r} -->` : `${d.open(ctx)} -->`;
}

/**
 * The text a first line of this kind (and ref) contains: the filter for `comments --marker`.
 * With a ref the match stops at a word end, so sha `ab1` does not match `ab12`.
 */
export function matches(kind: Kind, ref?: string, ctx: MarkerCtx = {}): string {
  const d = REGISTRY[kind];
  const r = oneLine(ref);
  if (d.style === 'html') return r ? `${d.open(ctx)} ${r} ` : d.open(ctx);
  if (d.style === 'heading') return r ? `${d.open(ctx)}: ${r}` : d.open(ctx);
  return d.open(ctx);
}

const firstLine = (body: string) => body.split('\n')[0];
/** Does this comment body open with a marker of this kind (and ref)? */
export const isMarked = (body: string, kind: Kind, ref?: string, ctx: MarkerCtx = {}) => firstLine(body).includes(matches(kind, ref, ctx));

/** Does this comment open with any factory marker (the registry's kinds)? A person's comment never does. */
export const isFactoryComment = (body: string, ctx: MarkerCtx = {}) => KINDS.some((k) => isMarked(body, k, undefined, ctx));

/** The body with its marker first. A body that already opens with the exact marker is not stamped twice. */
export function stampBody(body: string, kind: Kind, ref?: string, ctx: MarkerCtx = {}): string {
  const line = stamp(kind, ref, ctx);
  const rest = firstLine(body).trim() === line ? body.split('\n').slice(1).join('\n') : body;
  return `${line}\n${rest.replace(/^\n+/, '')}`;
}

export type Verdict = 'PASS' | 'REMEDIATION REQUIRED';
export const VERDICT_LINE = /^Verdict:[ \t]*(PASS|REMEDIATION REQUIRED)[ \t]*$/gm;
/** A report's one verdict; CONFLICT when its lines disagree (quoted CR text may carry another); undefined when it has none. */
export function verdictOf(body: string): Verdict | 'CONFLICT' | undefined {
  const all = new Set([...body.matchAll(VERDICT_LINE)].map((m) => m[1] as Verdict));
  return all.size > 1 ? 'CONFLICT' : [...all][0];
}

/** The one comment filter for `board comments` and `forge comments`. list is newest first; --last applies after --author, so a forged comment never pushes a trusted one out. */
export function selectComments(
  list: Comment[],
  o: { owners?: Owners; authors?: string[]; trusted?: boolean; last?: number; marker?: string },
): Comment[] {
  const w = o.owners;
  let out = o.marker ? list.filter((c) => firstLine(c.body).includes(o.marker!)) : list;
  if (o.authors?.length || o.trusted) {
    const by = [...(o.authors ?? []), ...(o.trusted ? [...(w?.bots ?? []), ...(w?.product ?? []), ...(w?.factory ?? []), ...(w?.operator ?? []), ...(w?.security ?? []), ...(w?.compliance ?? [])] : [])]
      .filter((x): x is string => !!x).map((s) => s.toLowerCase());
    out = out.filter((c) => by.includes(c.author?.toLowerCase()));
  }
  return o.last ? out.slice(0, o.last) : out;
}

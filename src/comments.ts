import type { Comment, Owners } from './ports.ts';

/** The one comment filter for `board comments` and `forge comments`. list is newest first; --last applies after --author, so a forged comment never pushes a trusted one out. */
export function selectComments(
  list: Comment[],
  o: { owners?: Owners; authors?: string[]; trusted?: boolean; last?: number; marker?: string },
): Comment[] {
  const w = o.owners;
  let out = o.marker ? list.filter((c) => c.body.includes(o.marker!)) : list;
  if (o.authors?.length || o.trusted) {
    const by = [...(o.authors ?? []), ...(o.trusted ? [...(w?.bots ?? []), w?.product, w?.factory] : [])]
      .filter((x): x is string => !!x).map((s) => s.toLowerCase());
    out = out.filter((c) => by.includes(c.author?.toLowerCase()));
  }
  return o.last ? out.slice(0, o.last) : out;
}

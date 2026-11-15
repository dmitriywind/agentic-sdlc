// Names the scenarios that run no src/ block another kept scenario does not run.
//   COVERMAP=/tmp/cover.jsonl node --test features/support/run.ts ; node scripts/prune-features.mjs /tmp/cover.jsonl [--apply]
// Greedy set cover over V8 block coverage. A scenario with no in-process coverage (it spawns the CLI or a hook)
// is reported as "unknown" and never removed. --apply deletes redundant plain scenarios and Examples rows.
import { readFileSync, writeFileSync } from 'node:fs';

const [file, apply] = [process.argv[2], process.argv.includes('--apply')];
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const known = rows.filter((r) => r.blocks.length);
const unknown = rows.filter((r) => !r.blocks.length);
// Rare blocks first: a scenario that alone reaches a block is kept before broad ones are judged.
const freq = new Map();
for (const r of known) for (const b of new Set(r.blocks)) freq.set(b, (freq.get(b) ?? 0) + 1);
const rarity = (r) => Math.min(...r.blocks.map((b) => freq.get(b)));
const order = [...known].sort((a, b) => rarity(a) - rarity(b) || b.blocks.length - a.blocks.length);
const seen = new Set();
const keep = new Set(), drop = [];
for (const r of order) {
  const fresh = r.blocks.filter((b) => !seen.has(b));
  if (fresh.length) { keep.add(r); for (const b of r.blocks) seen.add(b); } else drop.push(r);
}
const byFile = new Map();
for (const r of drop) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
console.log(`${rows.length} scenarios: keep ${keep.size}, redundant ${drop.length}, unknown ${unknown.length} (no in-process coverage)`);
for (const [f, rs] of [...byFile].sort()) console.log(`${String(rs.length).padStart(4)}  ${f}`);
if (!apply) process.exit(0);

for (const [f, rs] of byFile) {
  let lines = readFileSync(f, 'utf8').split('\n');
  const dead = new Set();
  const blockEnd = (i) => { let j = i + 1; while (j < lines.length && !/^\s*(Scenario|Scenario Outline|Example|Rule|Background|Feature)\b.*:/.test(lines[j]) && !/^\s*@/.test(lines[j])) j++; return j; };
  const start = (i) => { let k = i; while (k > 0 && /^\s*(#|@)/.test(lines[k - 1])) k--; return k; };
  const outlines = new Map();
  for (const r of rs) {
    const i = r.line - 1;
    if (!r.example) { for (let k = start(i); k < blockEnd(i); k++) dead.add(k); continue; }
    outlines.set(i, [...(outlines.get(i) ?? []), Object.values(r.example).map(String)]);
  }
  for (const [i, exs] of outlines) {
    const end = blockEnd(i);
    const cellsOf = (l) => l.trim().slice(1, -1).split('|').map((c) => c.trim());
    let header = true, left = 0;
    for (let k = i + 1; k < end; k++) {
      if (/^\s*Examples:/.test(lines[k])) { header = true; continue; }
      if (!/^\s*\|/.test(lines[k]) || !lines.slice(i, k).some((l) => /^\s*Examples:/.test(l))) continue;
      if (header) { header = false; continue; }
      const cells = cellsOf(lines[k]).join('\u0001');
      if (exs.some((e) => e.join('\u0001') === cells)) dead.add(k); else left++;
    }
    if (!left) for (let k = start(i); k < end; k++) dead.add(k); // every row redundant: the outline goes
  }
  lines = lines.filter((_, k) => !dead.has(k));
  writeFileSync(f, lines.join('\n').replace(/\n{3,}/g, '\n\n'));
}
console.log('applied; run the suite: unused step definitions and empty Rules need a hand');

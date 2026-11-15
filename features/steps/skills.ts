// The executable lint of the shipped skill pack (skills/ of this repo). Each Then collects problems as `file:line: text`
// and fails with all of them. The forbidden words, the verb tables and the marker kinds come from src/, never copied here.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { VERBS as BOARD } from '../../src/board/index.ts';
import { VERBS as FORGE } from '../../src/forge/index.ts';
import { VERBS as VCS } from '../../src/vcs/index.ts';
import { cliVerbs } from '../../src/gates.ts';
import { FORBIDDEN, TIER_NAMES, frontmatter, readSkills } from '../../src/skills.ts';
import { Given, Then } from '../support/steps.ts';
import { REPO, type World } from '../support/world.ts';

type File = { rel: string; path: string; text: string };

const mdFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mdFiles(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));

const pack = (w: World) => {
  assert.ok(w.state.skillsDir, 'add: Given the shipped skill pack');
  return w.state.skillsDir as string;
};
const files = (w: World): File[] => mdFiles(pack(w)).map((path) => ({ path, rel: relative(REPO, path), text: readFileSync(path, 'utf8') }));
const skillDirs = (w: World) => readdirSync(pack(w), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const noProblems = (problems: string[]) => assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
const lines = (f: File) => f.text.split(/\r?\n/).map((text, i) => ({ text, no: i + 1 }));

Given('the shipped skill pack', (w) => { w.state.skillsDir = join(REPO, 'skills'); });

Then('every skill folder has a SKILL.md whose name is the folder name and whose description is not empty', (w) => {
  const problems: string[] = [];
  for (const d of skillDirs(w)) {
    const file = join(pack(w), d, 'SKILL.md');
    if (!existsSync(file)) { problems.push(`skills/${d}: SKILL.md missing`); continue; }
    const fm = frontmatter(readFileSync(file, 'utf8'))?.fm;
    if (!fm) { problems.push(`skills/${d}/SKILL.md: no valid frontmatter`); continue; }
    if (fm.name !== d) problems.push(`skills/${d}/SKILL.md: name is '${fm.name}', not '${d}'`);
    if (typeof fm.description !== 'string' || !fm.description.trim()) problems.push(`skills/${d}/SKILL.md: description missing`);
  }
  noProblems(problems);
});

Then('every skill declares one tier, or the tier of each of its steps', (w) => {
  const problems: string[] = [];
  for (const d of skillDirs(w)) {
    const fm = frontmatter(readFileSync(join(pack(w), d, 'SKILL.md'), 'utf8'))?.fm;
    const meta = fm?.metadata ?? {};
    const tiers: [string, unknown][] = meta.steps ? Object.entries<any>(meta.steps).map(([s, v]) => [`metadata.steps.${s}.tier`, v?.tier]) : [['metadata.tier', meta.tier]]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (meta.steps && meta.tier !== undefined) problems.push(`skills/${d}: metadata.steps and metadata.tier are both set`);
    for (const [key, tier] of tiers) if (!TIER_NAMES.includes(String(tier))) problems.push(`skills/${d}/SKILL.md: ${key} is '${tier}', not one of ${TIER_NAMES.join(', ')}`);
  }
  noProblems(problems);
});

Then('every declared step has a file in steps/ and every file in steps/ is declared', (w) => {
  const problems: string[] = [];
  for (const d of skillDirs(w)) {
    const fm = frontmatter(readFileSync(join(pack(w), d, 'SKILL.md'), 'utf8'))?.fm;
    const declared = Object.keys(fm?.metadata?.steps ?? {});
    const dir = join(pack(w), d, 'steps');
    const onDisk = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)) : [];
    for (const s of declared) if (!onDisk.includes(s)) problems.push(`skills/${d}: step '${s}' has no file steps/${s}.md`);
    for (const s of onDisk) if (!declared.includes(s)) problems.push(`skills/${d}: steps/${s}.md is not in metadata.steps`);
  }
  noProblems(problems);
});

Then('every relative link in a skill file resolves', (w) => {
  const problems: string[] = [];
  for (const f of files(w)) for (const l of lines(f)) for (const m of l.text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const link = m[1].split('#')[0];
    if (link && !/^[a-z][a-z0-9+.-]*:/i.test(link) && !existsSync(resolve(dirname(f.path), link))) problems.push(`${f.rel}:${l.no}: broken link ${m[1]}`);
  }
  noProblems(problems);
});

Then('every {string} in a skill file names a verb of the CLI', (w, form: string) => {
  assert.equal(form, 'agentic-sdlc <group> <verb>');
  const verbs = cliVerbs();
  const problems: string[] = [];
  for (const f of files(w)) for (const l of lines(f)) for (const m of l.text.matchAll(/agentic-sdlc\s+(board|forge|vcs|gate|ledger|bench)\s+([a-z][a-z-]*)/g))
    if (!verbs[m[1]].has(m[2])) problems.push(`${f.rel}:${l.no}: '${m[0]}' is not a verb (${m[1]}: ${[...verbs[m[1]]].join(' ')})`);
  noProblems(problems);
});

Then('every flag a skill file passes to a board, forge or vcs verb is a flag of that verb', (w) => {
  const tables: Record<string, typeof BOARD> = { board: BOARD, forge: FORGE, vcs: VCS };
  const problems: string[] = [];
  for (const f of files(w)) for (const l of lines(f)) for (const m of l.text.matchAll(/agentic-sdlc\s+(board|forge|vcs)\s+([a-z][a-z-]*)([^`\n]*)/g)) {
    const spec = tables[m[1]][m[2]];
    if (!spec) continue; // an unknown verb is reported by the verb check
    const known = new Set([...(spec.value ?? []), ...(spec.bool ?? [])]);
    for (const flag of m[3].matchAll(/(?<![\w-])--([a-z][a-z-]*)/g)) if (!known.has(flag[1])) problems.push(`${f.rel}:${l.no}: '--${flag[1]}' is not a flag of '${m[1]} ${m[2]}' (${[...known].map((k) => `--${k}`).join(' ') || 'none'})`);
  }
  noProblems(problems);
});

Then('every {string} in a skill file names a step of the pack', (w, form: string) => {
  assert.equal(form, 'agentic-sdlc dispatch <step>');
  const ids = new Set(readSkills(pack(w)).steps.map((s) => s.id));
  const problems: string[] = [];
  for (const f of files(w)) for (const l of lines(f)) for (const m of l.text.matchAll(/agentic-sdlc\s+dispatch\s+([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)/g))
    if (!ids.has(m[1])) problems.push(`${f.rel}:${l.no}: '${m[0]}' is not a step (${[...ids].join(' ')})`);
  noProblems(problems);
});

Then('no skill file holds a word that ties it to one setup, harness, forge or vendor', (w) => {
  const problems: string[] = [];
  for (const f of files(w)) for (const l of lines(f)) for (const { re, reason } of FORBIDDEN) {
    const m = re.exec(l.text);
    if (m) problems.push(`${f.rel}:${l.no}: '${m[0]}': ${reason}`);
  }
  noProblems(problems);
});

Then('no skill file spells a comment marker', (w) => {
  // Every marker is an HTML comment on the first line of a comment (src/comments.ts); a skill never writes one.
  const problems: string[] = [];
  for (const f of files(w)) for (const l of lines(f)) if (l.text.includes('<!--')) problems.push(`${f.rel}:${l.no}: an HTML comment: markers are stamped by '--kind'`);
  noProblems(problems);
});

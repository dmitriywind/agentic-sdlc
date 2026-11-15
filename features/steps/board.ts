// The local board (.agents/board.json), driven through the CLI: tickets are numbered 1, 2, ... in the order given.
// State on w.state: tickets (the number of tickets created by a Given).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { Given, Then, type DataTable } from '../support/steps.ts';
import type { World } from '../support/world.ts';

const run = (w: World, line: string) => {
  const o = w.cliLine(line);
  assert.equal(o.code, 0, `setup failed: ${line}\n${o.stderr}`);
  return o;
};

Given('the board has these tickets:', (w, t: DataTable) => {
  for (const [i, r] of t.hashes().entries()) {
    const body = `.body-${i}.md`;
    w.write(body, r.body ?? '');
    const flags = [`--title`, `'${r.title}'`, '--status', `'${r.status}'`, '--body-file', body];
    if (r.parent) flags.push('--parent', r.parent);
    if (r.milestone) flags.push('--milestone', r.milestone);
    for (const l of (r.labels ?? '').split(',').map((x) => x.trim()).filter(Boolean)) flags.push('--label', `'${l}'`);
    run(w, `board create ${flags.join(' ')}`);
  }
});

Given('the comments on ticket {string} are:', (w, id: string, t: DataTable) => {
  const rows = t.hashes();
  rows.forEach((r, i) => { w.write(`.comment-${i}.md`, r.body); run(w, `board comment ${id} --body-file .comment-${i}.md`); });
  // The local board writes every comment as "local": a fixture sets who wrote each one.
  const file = w.path('.agents', 'board.json');
  const db = JSON.parse(readFileSync(file, 'utf8'));
  rows.forEach((r, i) => { db.comments[id][i].author = r.author; });
  writeFileSync(file, JSON.stringify(db));
});

Given('the board lists the statuses {string}', (w, list: string) => w.binding({ board: { statuses: list.split(',').map((s) => s.trim()) } }));
Given('the board is scoped to the label {string}', (w, label: string) => w.binding({ board: { scope: { label } } }));
Given('the board is scoped to the label {string} as the home of {string}', (w, label: string, repos: string) =>
  w.binding({ board: { scope: { label, home: true, repos: repos.split(',').map((s) => s.trim()) } } }));

/** The value at a dotted path of the CLI's JSON output, as text (a list is joined with ", "). */
const at = (w: World, path: string): string | undefined => {
  let v: any = w.last.json(); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const k of path.split('.')) v = v?.[k];
  return v === undefined ? undefined : Array.isArray(v) ? v.join(', ') : String(v);
};
Then('the result {string} is {string}', (w, path: string, value: string) => assert.equal(at(w, path), value));
Then('the result has no {string}', (w, path: string) => assert.equal(at(w, path), undefined));
Then('the {string} of the result entries are {string}', (w, key: string, values: string) =>
  assert.equal(w.last.json().map((e: Record<string, unknown>) => e[key]).join(', '), values));

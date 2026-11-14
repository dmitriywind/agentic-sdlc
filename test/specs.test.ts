// The behaviour specs and the tests name each other: every `# Proof: test/<file> "<title>"` line
// names a real test, and every test is named by at least one scenario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const titles = new Map<string, Set<string>>();
for (const f of readdirSync(join(root, 'test')).filter((n) => n.endsWith('.test.ts') && n !== 'specs.test.ts')) { // this file checks the rule; it proves no scenario
  const src = readFileSync(join(root, 'test', f), 'utf8');
  const set = new Set<string>();
  for (const m of src.matchAll(/^test\((['"`])((?:\\.|(?!\1).)*)\1/gm)) set.add(m[2].replace(/\\(.)/g, '$1'));
  titles.set(`test/${f}`, set);
}
const proofs: { file: string; test: string; title: string }[] = [];
let bare = 0;
for (const f of readdirSync(join(root, 'docs/behaviour')).filter((n) => n.endsWith('.feature'))) {
  const lines = readFileSync(join(root, 'docs/behaviour', f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*Scenario( Outline)?:/.test(line)) {
      let j = i - 1, proved = false;
      while (j >= 0 && /^\s*(#|@)/.test(lines[j])) { if (/#\s*Proof:/.test(lines[j])) proved = true; j--; }
      if (!proved) bare++;
    }
    const m = /#\s*Proof:\s*(test\/\S+)\s+"(.*)"\s*$/.exec(line);
    if (m) proofs.push({ file: f, test: m[1], title: m[2] });
  });
}

test('every Proof line names a real test, every test proves a scenario, and every scenario has a Proof line', () => {
  const missing = proofs.filter((p) => !titles.get(p.test)?.has(p.title)).map((p) => `${p.file}: ${p.test} "${p.title}"`);
  assert.deepEqual(missing, [], 'Proof lines that name no test');
  const cited = new Set(proofs.map((p) => `${p.test} "${p.title}"`));
  const orphans = [...titles].flatMap(([f, set]) => [...set].map((t) => `${f} "${t}"`)).filter((k) => !cited.has(k));
  assert.deepEqual(orphans, [], 'tests that prove no scenario');
  assert.equal(bare, 0, 'scenarios with no Proof line');
});

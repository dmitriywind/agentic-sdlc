// A small Gherkin parser: Feature, Rule, Background, Scenario, Scenario Outline + Examples, steps, data tables,
// doc strings, tags, comments. No dependency. An outline is expanded into one Scenario per Examples row.

export type DataTable = { header: string[]; rows: string[][]; raw: () => string[][]; hashes: () => Record<string, string>[] };

export type Step = {
  keyword: string; // Given | When | Then | And | But | *
  text: string;
  line: number;
  table?: DataTable;
  docString?: string;
};

export type Scenario = {
  name: string;
  line: number;
  tags: string[];
  /** Comment lines directly above the tags or the keyword: the reason of a @skip. */
  comment: string;
  steps: Step[];
  /** Set on a scenario expanded from an outline: the Examples row. */
  example?: Record<string, string>;
};

export type Background = { line: number; steps: Step[] };
export type Rule = { name: string; line: number; tags: string[]; background?: Background; scenarios: Scenario[] };
export type Feature = {
  file: string;
  name: string;
  line: number;
  tags: string[];
  description: string;
  background?: Background;
  /** Scenarios outside any Rule. */
  scenarios: Scenario[];
  rules: Rule[];
};

export class GherkinError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
  }
}

const STEP_RE = /^(Given|When|Then|And|But|\*)\s+(.*)$/;

const table = (rows: string[][]): DataTable => ({
  header: rows[0] ?? [],
  rows: rows.slice(1),
  raw: () => rows,
  hashes: () => rows.slice(1).map((r) => Object.fromEntries(rows[0].map((h, i) => [h, r[i] ?? '']))),
});

function cells(line: string, file: string, n: number): string[] {
  const t = line.trim();
  if (!t.endsWith('|')) throw new GherkinError(file, n, 'a table row must end with |');
  const out: string[] = [];
  let cur = '';
  for (let i = 1; i < t.length; i++) {
    const c = t[i];
    if (c === '\\' && (t[i + 1] === '|' || t[i + 1] === '\\')) { cur += t[i + 1]; i++; continue; }
    if (c === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  return out;
}

type Raw = { name: string; line: number; tags: string[]; comment: string; steps: Step[]; outline: boolean; examples: { line: number; tags: string[]; rows: string[][] }[] };

export function parse(text: string, file: string): Feature {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let feature: Feature | undefined;
  let rule: Rule | undefined;
  let bg: Background | undefined;
  let cur: Raw | undefined;
  let curEx: Raw['examples'][number] | undefined;
  let tags: string[] = [];
  let comment: string[] = [];
  let descTarget: 'feature' | 'other' | undefined;
  let lastStep: Step | undefined;

  const flush = () => {
    if (cur) {
      const into = rule ? rule.scenarios : feature!.scenarios;
      into.push(...expand(cur, file));
      cur = undefined;
    }
    curEx = undefined;
    lastStep = undefined;
  };

  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith('#')) {
      if (/^#\s*language:/.test(t)) continue;
      comment.push(t.replace(/^#\s?/, ''));
      continue;
    }
    if (t.startsWith('@')) {
      for (const tag of t.split(/\s+/)) {
        if (!tag.startsWith('@') || tag.length < 2) throw new GherkinError(file, n, `bad tag '${tag}'`);
        tags.push(tag);
      }
      continue;
    }

    // Doc string
    if (t === '"""' || t === '```') {
      if (!lastStep) throw new GherkinError(file, n, 'a doc string must follow a step');
      const close = t;
      const indent = raw.length - raw.trimStart().length;
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length && lines[j].trim() !== close; j++) body.push(lines[j].slice(Math.min(indent, lines[j].length - lines[j].trimStart().length)));
      if (j >= lines.length) throw new GherkinError(file, n, 'doc string is never closed');
      lastStep.docString = body.join('\n');
      i = j;
      continue;
    }
    // Table row
    if (t.startsWith('|')) {
      const row = cells(t, file, n);
      if (curEx) curEx.rows.push(row);
      else if (lastStep) {
        const rows = lastStep.table ? lastStep.table.raw() : [];
        lastStep.table = table([...rows, row]);
      } else throw new GherkinError(file, n, 'a table must follow a step or Examples');
      continue;
    }

    const kw = /^(Feature|Rule|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Scenarios):\s*(.*)$/.exec(t);
    if (kw) {
      const [, key, name] = kw;
      const c = comment.join('\n');
      comment = [];
      if (key === 'Feature') {
        if (feature) throw new GherkinError(file, n, 'only one Feature per file');
        feature = { file, name, line: n, tags, description: '', scenarios: [], rules: [] };
        descTarget = 'feature';
      } else {
        if (!feature) throw new GherkinError(file, n, `${key} before Feature`);
        descTarget = 'other';
        if (key === 'Rule') {
          flush();
          rule = { name, line: n, tags, scenarios: [] };
          feature.rules.push(rule);
        } else if (key === 'Background') {
          flush();
          if (tags.length) throw new GherkinError(file, n, 'a Background takes no tags');
          bg = { line: n, steps: [] };
          if (rule) rule.background = bg; else feature.background = bg;
          cur = undefined;
        } else if (key === 'Examples' || key === 'Scenarios') {
          if (!cur || !cur.outline) throw new GherkinError(file, n, 'Examples belong to a Scenario Outline');
          curEx = { line: n, tags, rows: [] };
          cur.examples.push(curEx);
          lastStep = undefined;
        } else {
          flush();
          bg = undefined;
          cur = { name, line: n, tags, comment: c, steps: [], outline: key !== 'Scenario' && key !== 'Example', examples: [] };
        }
      }
      tags = [];
      continue;
    }

    const st = STEP_RE.exec(t);
    if (st) {
      if (!feature) throw new GherkinError(file, n, 'step before Feature');
      const step: Step = { keyword: st[1], text: st[2].trim(), line: n };
      if (cur) cur.steps.push(step);
      else if (bg) bg.steps.push(step);
      else throw new GherkinError(file, n, 'a step must be in a Scenario or Background');
      lastStep = step;
      curEx = undefined;
      comment = [];
      continue;
    }

    // Free text after a header: the description of the Feature (kept) or of a Rule or Scenario (ignored).
    if (feature && !lastStep && !curEx) {
      if (descTarget === 'feature' && !cur && !bg && !rule) feature.description += (feature.description ? '\n' : '') + t;
      continue;
    }
    throw new GherkinError(file, n, `unexpected line: ${t}`);
  }
  flush();
  if (!feature) throw new GherkinError(file, 1, 'no Feature');
  if (tags.length) throw new GherkinError(file, lines.length, 'tags with nothing after them');
  return feature;
}

function expand(s: Raw, file: string): Scenario[] {
  if (!s.outline) return [{ name: s.name, line: s.line, tags: s.tags, comment: s.comment, steps: s.steps }];
  if (!s.examples.length) throw new GherkinError(file, s.line, 'a Scenario Outline needs an Examples table');
  const out: Scenario[] = [];
  for (const ex of s.examples) {
    if (ex.rows.length < 2) throw new GherkinError(file, ex.line, 'an Examples table needs a header and at least one row');
    const [header, ...rows] = ex.rows;
    for (const row of rows) {
      if (row.length !== header.length) throw new GherkinError(file, ex.line, `an Examples row has ${row.length} cells, the header ${header.length}`);
      const vals = Object.fromEntries(header.map((h, i) => [h, row[i]]));
      const sub = (v: string) => v.replace(/<([^<>]+)>/g, (m, k) => (Object.hasOwn(vals, k) ? vals[k] : m));
      const used = (v: string) => [...v.matchAll(/<([^<>]+)>/g)].some((m) => Object.hasOwn(vals, m[1]));
      const name = used(s.name) ? sub(s.name) : `${s.name} (${header.map((h) => `${h}=${vals[h]}`).join(', ')})`;
      const steps = s.steps.map((st) => ({
        ...st,
        text: sub(st.text),
        docString: st.docString === undefined ? undefined : sub(st.docString),
        table: st.table ? table(st.table.raw().map((r) => r.map(sub))) : undefined,
      }));
      out.push({ name, line: s.line, tags: [...s.tags, ...ex.tags], comment: s.comment, steps, example: vals });
    }
  }
  return out;
}

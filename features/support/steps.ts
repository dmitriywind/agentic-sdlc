// The step library: Given/When/Then register a definition; the runner matches a step's text against all of them
// (the keyword does not matter, as in Cucumber). {string} is "quoted" or 'quoted', {int} a whole number, {word} a
// run of non-space characters. Inside "double quotes" a \" is a quote. A RegExp works too: its capture groups are the arguments (as strings).
import type { DataTable } from './gherkin.ts';
import type { World } from './world.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StepFn = (world: World, ...args: any[]) => unknown;
export type { DataTable };

export type StepDef = { source: string | RegExp; re: RegExp; casts: ((v: string) => unknown)[]; fn: StepFn; where: string; used: boolean };

export const defs: StepDef[] = [];

const PLACEHOLDERS: Record<string, [string, (v: string) => unknown]> = {
  string: ['', (v) => v],
  int: ['(-?\\d+)', (v) => Number(v)],
  word: ['(\\S+)', (v) => v],
};

function compile(pattern: string | RegExp): { re: RegExp; casts: ((v: string) => unknown)[] } {
  if (pattern instanceof RegExp) return { re: new RegExp(`^(?:${pattern.source})$`, pattern.flags), casts: [] };
  const casts: ((v: string) => unknown)[] = [];
  let out = '';
  for (const part of pattern.split(/(\{(?:string|int|word)\})/)) {
    const m = /^\{(string|int|word)\}$/.exec(part);
    if (m) { casts.push(PLACEHOLDERS[m[1]][1]); out += m[1] === 'string' ? `(?:"((?:[^"\\\\]|\\\\.)*)"|'([^']*)')` : PLACEHOLDERS[m[1]][0]; }
    else out += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return { re: new RegExp(`^${out}$`), casts };
}

function register(pattern: string | RegExp, fn: StepFn) {
  const stack = new Error().stack?.split('\n').find((l) => /features\/steps\//.test(l)) ?? '';
  const where = /(features\/steps\/[^:)]+:\d+)/.exec(stack)?.[1] ?? 'unknown';
  defs.push({ source: pattern, ...compile(pattern), fn, where, used: false });
}

export const Given = register;
export const When = register;
export const Then = register;

/** The arguments a step text yields for a definition: casts for placeholders, raw strings for regex groups; undefined groups dropped. */
export function match(def: StepDef, text: string): unknown[] | undefined {
  const m = def.re.exec(text);
  if (!m) return undefined;
  const groups = m.slice(1);
  if (typeof def.source === 'string') {
    // a {string} placeholder owns two groups (double or single quotes): fold each pair into one value
    const out: unknown[] = [];
    let g = 0;
    for (const cast of def.casts) {
      const isString = cast === PLACEHOLDERS.string[1];
      if (isString) { out.push((groups[g] ?? groups[g + 1]).replace(/\\(["\\])/g, '$1')); g += 2; } else { out.push(cast(groups[g])); g += 1; }
    }
    return out;
  }
  return groups.filter((v) => v !== undefined);
}

/** A ready-to-paste definition for a step text nobody defined. */
export function snippet(keyword: string, text: string, extra: 'table' | 'docString' | undefined): string {
  let n = 0;
  const args: string[] = [];
  const pat = text
    .replace(/'/g, "\\'")
    .replace(/"[^"]*"|(?<![\w.])-?\d+(?![\w.])/g, (m) => { n++; if (m.startsWith('"')) { args.push(`s${n}: string`); return '{string}'; } args.push(`n${n}: number`); return '{int}'; });
  if (extra === 'table') args.push('table: DataTable');
  if (extra === 'docString') args.push('doc: string');
  return `${keyword}('${pat}', (world${args.length ? ', ' + args.join(', ') : ''}) => {\n  throw new Error('pending');\n});`;
}

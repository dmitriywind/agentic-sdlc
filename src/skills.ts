// The skill pack reader: one loader for validate, dispatch, skill-regression, ledger and bench (references/architecture.md).
// A STEP is the unit that runs. Its id is `<skill>/<step>`, or the skill name alone for a one-step skill.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

export const TIER_NAMES = ['fast', 'balanced', 'deep'];

/** Old skill names -> the step that replaced them. Old heartbeat rows, executors keys and scorers still read. */
export const OLD_STEP_IDS: Record<string, string> = {
  'implement-spec': 'build',
  'review-pr': 'review/review',
  shape: 'plan/shape',
  'triage-signal': 'plan/triage',
  'backlog-grooming': 'plan/groom',
  'verify-ux': 'review/verify',
  release: 'ship',
  'judge-run': 'learn/judge',
  'improve-factory': 'learn/improve',
  'escalate-to-human': 'escalate',
};
/** A step id for a name that may be an old skill name. */
export const stepIdOf = (name: string): string => (Object.hasOwn(OLD_STEP_IDS, name) ? OLD_STEP_IDS[name] : name);
/** The skill a step id belongs to. */
export const skillOf = (id: string): string => id.split('/')[0];
/** The package's skill name for an installed folder name (copied installs write `sdlc-<name>`; `sdlc` stays). */
export const logicalName = (folder: string): string => folder.replace(/^sdlc-(?=.)/, '');

export interface Step {
  /** The logical skill name (`build`, never `sdlc-build`). */
  skill: string;
  step?: string;
  id: string;
  tier: string;
  /** The file to follow: steps/<step>.md, or SKILL.md for a one-step skill. */
  file: string;
  /** The skill folder. */
  dir: string;
  /** Content hash of the skill folder (what a heartbeat row's skillHash holds). */
  hash: string;
}
export interface SkillInfo { skill: string; name: string; dir: string; file: string; steps: Step[] }
export interface Pack { skills: SkillInfo[]; steps: Step[]; errors: string[]; warnings: string[] }

/** Frontmatter (parsed) and body of a markdown file; undefined when either is missing or not YAML. */
export function frontmatter(text: string): { fm: Record<string, any>; body: string } | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) return undefined;
  try {
    const fm = parse(m[1]);
    return fm && typeof fm === 'object' && !Array.isArray(fm) ? { fm, body: m[2].replace(/\r\n/g, '\n') } : undefined;
  } catch { return undefined; }
}

/** Content hash of a skill folder: sorted relative paths and LF-normalised contents. 12 hex chars. */
export function hashSkill(dir: string): string {
  const h = createHash('sha256');
  const files = (readdirSync(dir, { recursive: true, withFileTypes: true }) as import('node:fs').Dirent[])
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name))
    .map((p) => [relative(dir, p).replaceAll('\\', '/'), p])
    .sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [rel, p] of files) h.update(`${rel}\0${readFileSync(p, 'utf8').replace(/\r\n/g, '\n')}\0`);
  return h.digest('hex').slice(0, 12);
}

const STEP_NAME = /^[a-z][a-z0-9-]*$/;

/**
 * Every skill folder under `dir` and its steps, from SKILL.md frontmatter (`metadata.steps: { <step>: { tier } }`,
 * or `metadata.tier` for a one-step skill) and `steps/<step>.md`. Problems come back as `errors` and `warnings`
 * (a missing name or description, an unknown tier, a step with no file, a step file not in the frontmatter);
 * the steps that are sound are still returned.
 */
export function readSkills(dir: string): Pack {
  const pack: Pack = { skills: [], steps: [], errors: [], warnings: [] };
  if (!existsSync(dir)) { pack.errors.push(`${dir} does not exist`); return pack; }
  const { errors, warnings } = pack;
  for (const e of readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const d = join(dir, e.name), file = join(d, 'SKILL.md');
    if (!existsSync(file)) { errors.push(`${e.name}: SKILL.md missing`); continue; }
    const fm = frontmatter(readFileSync(file, 'utf8'))?.fm;
    if (!fm) { errors.push(`${e.name}: no frontmatter`); continue; }
    for (const k of ['name', 'description']) if (typeof fm[k] !== 'string' || !fm[k].trim()) errors.push(`${e.name}: frontmatter ${k} missing`);
    if (typeof fm.name === 'string' && fm.name && fm.name !== e.name) errors.push(`${e.name}: frontmatter name '${fm.name}' differs from the folder name`);
    const skill = logicalName(e.name);
    const hash = hashSkill(d);
    const steps: Step[] = [];
    const meta = fm.metadata && typeof fm.metadata === 'object' ? fm.metadata : {};
    const tierOk = (label: string, tier: unknown): tier is string => {
      if (tier === undefined || tier === null || tier === '') { errors.push(`${e.name}: frontmatter ${label} missing`); return false; }
      if (!TIER_NAMES.includes(tier as string)) { errors.push(`${e.name}: tier ${tier} invalid (${label})`); return false; }
      return true;
    };
    if (meta.steps !== undefined) {
      if (meta.tier !== undefined) errors.push(`${e.name}: metadata.steps and metadata.tier are both set; a skill with steps has no tier of its own`);
      const decl = meta.steps;
      if (!decl || typeof decl !== 'object' || Array.isArray(decl) || !Object.keys(decl).length) errors.push(`${e.name}: metadata.steps must be { <step>: { tier } }`);
      else {
        for (const [step, def] of Object.entries<any>(decl)) {
          if (!STEP_NAME.test(step)) { errors.push(`${e.name}: step name '${step}' is not lower-case words with hyphens`); continue; }
          const stepFile = join(d, 'steps', `${step}.md`);
          if (!existsSync(stepFile)) errors.push(`${e.name}: step ${step} has no file steps/${step}.md`);
          if (!tierOk(`metadata.steps.${step}.tier`, def?.tier) || !existsSync(stepFile)) continue;
          steps.push({ skill, step, id: `${skill}/${step}`, tier: def.tier, file: stepFile, dir: d, hash });
        }
        const sdir = join(d, 'steps');
        if (existsSync(sdir)) for (const n of readdirSync(sdir).filter((x) => x.endsWith('.md')))
          if (!Object.hasOwn(decl ?? {}, n.slice(0, -3))) errors.push(`${e.name}: steps/${n} is not in metadata.steps`);
      }
    } else {
      let tier = meta.tier;
      if (tier === undefined && fm.tier !== undefined) { tier = fm.tier; warnings.push(`${e.name}: top-level tier is deprecated; move it to metadata.tier`); }
      if (tier === undefined) errors.push(`${e.name}: frontmatter metadata.tier or metadata.steps missing`);
      else if (tierOk('metadata.tier', tier)) steps.push({ skill, id: skill, tier, file, dir: d, hash });
    }
    pack.skills.push({ skill, name: e.name, dir: d, file, steps });
    pack.steps.push(...steps);
  }
  return pack;
}

/** The step an id names, or undefined. */
export const findStep = (pack: Pack, id: string): Step | undefined => pack.steps.find((s) => s.id === id);

/** The ids a scorer's `applies_to` may name: every step id and every skill name. */
export const scorerTargets = (pack: Pack): Set<string> => new Set([...pack.steps.map((s) => s.id), ...pack.skills.map((s) => s.skill)]);

/**
 * Words and facts that tie a skill to one setup, harness, forge or vendor. A skill holds process only (REDESIGN 1):
 * the CLI decides setup-dependent behaviour from the binding. `skill-regression` fails a skill file with a hit.
 * `(?<!agentic-sdlc gate )` lets a skill name the gate verbs, which are CLI verbs.
 */
export const FORBIDDEN: { re: RegExp; reason: string }[] = [
  { re: /\bidentit(?:y|ies)\b/i, reason: 'one or two forge identities is a setup fact: the CLI decides it from the binding' },
  { re: /\breview[ -]tokens?\b|\breview_token_env\b/i, reason: 'the review token is a setup fact: the CLI decides it' },
  { re: /\breview[ -]runtimes?\b|\breview_identity\b/i, reason: 'where a review runs is a setup fact: dispatch decides it' },
  { re: /\b(?:Claude|Codex|Cursor|Gemini|Antigravity)\b/, reason: 'a skill works in any harness: name no harness' },
  { re: /\bplugins?\b|\bsub-?agents?\b|\bMCP\b/i, reason: 'a skill names no harness mechanism (plugin, subagent, MCP)' },
  { re: /\bGitHub\b|\bGitLab\b|\bBitbucket\b|\bgh\b/i, reason: 'a skill works on any forge: it calls `agentic-sdlc forge <verb>`' },
  { re: /\bpull[ -]requests?\b/i, reason: 'the word is change request' },
  { re: /\bnpm\b|\bnpx\b|\bnode\b|\bpnpm\b|\byarn\b/i, reason: 'a skill names no package manager or runtime; commands come from the binding' },
  { re: /\bcloud sessions?\b/i, reason: 'a skill works in any runtime' },
  { re: /\bHTTP\b|\b(?:status|code|error|answer)s? (?:4\d\d|5\d\d)\b|\b(?:4\d\d|5\d\d) (?:error|status)\b/i, reason: 'a skill reads the CLI result, never an HTTP status' },
  { re: /\b(?:glab|jira|aws|gcloud|az|kubectl|docker|terraform|vercel|netlify)\b/i, reason: 'a skill calls no vendor CLI' },
  { re: /`Required`|(?<!agentic-sdlc gate )\b(?:proofs-on-base|agent-provenance|human-approval|evidence-check|signal-on-red)\b/, reason: 'check names come from the binding or the CLI output, never from a skill' },
  { re: /\bDORA\b/, reason: 'a measure is named by what it counts' },
  { re: /\b(?:GDPR|HIPAA|SOX|CCPA|FedRAMP|PCI-DSS|SOC ?2|ISO ?27001)\b/, reason: 'a skill names no law or standard; the binding names the product\'s' },
];

/** Forbidden content in a file's text: one hit per line and pattern, with its 1-based line. */
export function forbiddenHits(text: string): { line: number; match: string; reason: string }[] {
  const hits: { line: number; match: string; reason: string }[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    for (const { re, reason } of FORBIDDEN) { const m = re.exec(l); if (m) hits.push({ line: i + 1, match: m[0], reason }); }
  });
  return hits;
}

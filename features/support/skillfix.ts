// A fixture skill pack in the new layout (one-step skills and skills with step files), for tests that read skills.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const fm = (name: string, meta: string, extra = '') => `---\nname: ${name}\ndescription: d\n${extra}metadata:\n${meta}---\nbody\n`;

/** Files of the fixture pack, by path inside the skills folder. `prefix` is '' (package) or 'sdlc-' (copied install). */
export function packFiles(prefix = ''): Record<string, string> {
  const n = (s: string) => (s === 'sdlc' ? s : prefix + s);
  return {
    'sdlc/SKILL.md': fm('sdlc', '  tier: fast\n'),
    [`${n('plan')}/SKILL.md`]: fm(n('plan'), '  steps:\n    triage: { tier: fast }\n    groom: { tier: balanced }\n    shape: { tier: deep }\n') + `see [the contract](../sdlc/references/contract.md)\n`,
    [`${n('plan')}/steps/triage.md`]: 'triage\n',
    [`${n('plan')}/steps/groom.md`]: 'groom\n',
    [`${n('plan')}/steps/shape.md`]: 'shape, then [escalate](../../' + n('escalate') + '/SKILL.md)\n',
    [`${n('build')}/SKILL.md`]: fm(n('build'), '  tier: deep\n'),
    [`${n('review')}/SKILL.md`]: fm(n('review'), '  steps:\n    review: { tier: balanced }\n    verify: { tier: balanced }\n'),
    [`${n('review')}/steps/review.md`]: 'review\n',
    [`${n('review')}/steps/verify.md`]: 'verify\n',
    [`${n('ship')}/SKILL.md`]: fm(n('ship'), '  tier: balanced\n', 'disable-model-invocation: true\n'),
    [`${n('learn')}/SKILL.md`]: fm(n('learn'), '  steps:\n    judge: { tier: fast }\n    improve: { tier: deep }\n'),
    [`${n('learn')}/steps/judge.md`]: 'judge\n',
    [`${n('learn')}/steps/improve.md`]: 'improve\n',
    [`${n('escalate')}/SKILL.md`]: fm(n('escalate'), '  tier: fast\n'),
    'sdlc/references/contract.md': 'contract\n',
  };
}

export function writePack(skillsDir: string, files = packFiles()) {
  for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(skillsDir, p)), { recursive: true }); writeFileSync(join(skillsDir, p), t); }
}

/** A temp project root holding the fixture pack as an installed `.agents/skills`. */
export function packRoot(prefix = 'sdlc-'): string {
  const root = mkdtempSync(join(tmpdir(), 'pack-'));
  writePack(join(root, '.agents', 'skills'), packFiles(prefix));
  return root;
}

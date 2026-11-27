// What init treats as an unedited file: one whose hash is a hash of some released version of it.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { join } from 'node:path';

export const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** Package paths init installs from: the skill pack, scorers, gate templates, the launcher, and three runner files. */
export const isInstallable = (path: string) =>
  /^(skills|scorers)\/./.test(path) || /^templates\/(gates|bin)\/./.test(path) || /^templates\/runner\/(setup\.sh|cycle-prompt\.md|review-prompt\.md)$/.test(path);

/** The binding values written into the stock workflows (the `# set:` lines init derives from the binding). */
export type Bound = { trunk: string; releasePrefix: string; delivery: string; install: string; verify: string; ci: string; deployFirst: string; deployLast: string };
export const DEFAULTS: Bound = { trunk: 'main', releasePrefix: 'release/', delivery: 'release-line', install: 'npm ci', verify: 'npm test', ci: 'CI', deployFirst: 'Deploy staging', deployLast: 'Deploy production' };

const yamlScalar = (v: string) => (/^[\w./ -]+$/.test(v) ? v : JSON.stringify(v));

/** Write the binding's values into a stock workflow, by the file's name. Other files come back unchanged. */
export function bindWorkflow(name: string, text: string, v: Bound): string {
  if (name === 'agentic-sdlc-delivery.yml')
    return text
      .replace(/^(\s+TRUNK: )\S+(?=\s+# set:)/m, `$1${v.trunk}`)
      .replace(/^(\s+RELEASE_PREFIX: )\S+(?=\s+# set:)/m, `$1${v.releasePrefix}`)
      .replace(/^(\s+DELIVERY: )\S+(?=\s+# set:)/m, `$1${v.delivery}`)
      .replace(/(# set: your vcs\.trunk\n\s+branches: )\[[^\]]*\]/, `$1[${v.trunk}]`)
      // The workflow names it watches: forge.deploy_workflows (first and last environment) and forge.ci_workflow.
      .replace(/(# set: your staging deploy workflow name[^\n]*\n\s+workflows: )\[[^\]]*\]/, (_, a) => a + JSON.stringify([v.deployFirst, v.deployLast, v.ci]).replaceAll('","', '", "'))
      .replace(/(# set: the deploy\/publish workflow for the first environment[^\n]*\n\s+if \[ "\$RUN_NAME" = )"[^"]*"/, (_, a) => a + JSON.stringify(v.deployFirst))
      .replace(/(# set: the deploy\/publish workflow for the last environment[^\n]*\n[^\n]*\n\s+if \[ "\$RUN_NAME" = )"[^"]*"/, (_, a) => a + JSON.stringify(v.deployLast))
      .replace(/(# set: your trunk CI workflow name\n\s+if: >-\n[^\n]*?github\.event\.workflow_run\.name == )'[^']*'/, (_, a) => `${a}'${v.ci.replaceAll("'", "''")}'`);
  if (name === 'agentic-sdlc-verify.yml')
    return text
      .replace(/^(\s+run: ).*?(?=\s+# set: the binding's commands\.install)/gm, (_, a) => a + yamlScalar(v.install))
      .replace(/^(\s+run: ).*?(?=\s+# set: the binding's commands\.verify)/gm, (_, a) => a + yamlScalar(v.verify));
  return text;
}

/** The prefix a copied install gives every skill folder but `sdlc` (the package source has short names, the plugin namespaces them). */
export const COPY_PREFIX = 'sdlc-';

/**
 * A skill file as a copied install writes it (`to`), or back as the package ships it (`from`). `rel` is the file's
 * path inside the skills folder (`build/SKILL.md`, package side; `sdlc-build/SKILL.md`, installed side).
 * Three things change: the folder's first path segment is named by the caller, a SKILL.md `name:` line takes the
 * folder's name, and a relative markdown link that reaches into another skill's folder follows that rename.
 * `names` are the package's skill folders; `from` strips the prefix from any folder, so a skill the package dropped
 * still reads back as the source it had.
 */
export function renameSkill(rel: string, text: string, dir: 'to' | 'from', names: ReadonlySet<string>): string {
  const swap = (seg: string) => dir === 'to'
    ? (names.has(seg) && seg !== 'sdlc' ? COPY_PREFIX + seg : seg)
    : (seg.startsWith(COPY_PREFIX) && seg.length > COPY_PREFIX.length ? seg.slice(COPY_PREFIX.length) : seg);
  const parts = posix.normalize(rel.replaceAll('\\', '/')).split('/');
  const here = parts[0], moved = swap(here);
  // the file's own folder, in the target naming, decides the relative form of every link
  let out = text.replace(/\]\(([^)\s#]+)((?:#[^)\s]*)?)\)/g, (m, target: string, anchor: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) return m;
    const abs = posix.normalize(posix.join(posix.dirname(parts.join('/')), target));
    const seg = abs.split('/');
    if (seg[0] === '..' || seg[0] === '.') return m;
    const to = [swap(seg[0]), ...seg.slice(1)].join('/');
    const relTo = posix.relative(posix.dirname([moved, ...parts.slice(1)].join('/')), to);
    const keepDot = target.startsWith('./') && !relTo.startsWith('.');
    return `](${keepDot ? './' : ''}${relTo}${anchor})`;
  });
  if (parts.length === 2 && parts[1] === 'SKILL.md')
    out = out.replace(/^(---\r?\n(?:[^\n]*\r?\n)*?name:[ \t]*)\S+/, `$1${moved}`);
  return out;
}

/** The skill folders of a package: the names `renameSkill` renames. */
export const skillNames = (skillsDir: string): Set<string> =>
  new Set(existsSync(skillsDir) ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

/** The package path an installed skill file comes from, undone: `.agents/skills/sdlc-build/SKILL.md` reads as `build/SKILL.md` source. */
const SKILL_ROOT = /^(\.agents\/skills|\.claude\/skills)\/(.+)$/;

/**
 * The hash a file has when its binding values are the template's own: what a released version is compared by. `rel` is its installed path.
 * Line endings are LF first: a checkout with core.autocrlf (Windows) holds the same released file with CRLF.
 */
export function releasedHash(name: string, data: Buffer, rel?: string): string {
  const text = data.toString('utf8').replaceAll('\r\n', '\n');
  if (name === 'agentic-sdlc-delivery.yml' || name === 'agentic-sdlc-verify.yml') return sha(bindWorkflow(name, text, DEFAULTS));
  const m = rel && name.endsWith('.md') ? SKILL_ROOT.exec(rel.replaceAll('\\', '/')) : null;
  return sha(m ? renameSkill(m[2], text, 'from', new Set()) : text);
}

/** One-identity trunk ruleset: GitHub refuses an approving review from the CR's author, so none is asked for. */
export function oneIdentityRuleset(text: string): string {
  const rs = JSON.parse(text);
  for (const r of rs.rules) if (r.type === 'pull_request') Object.assign(r.parameters, { required_approving_review_count: 0, require_last_push_approval: false });
  // CI posts review (gate review) and human-approval with the Actions token: pin them to Actions too.
  for (const r of rs.rules) if (r.type === 'required_status_checks')
    for (const c of r.parameters.required_status_checks) if (['review', 'human-approval'].includes(c.context)) c.integration_id = 15368;
  return JSON.stringify(rs, null, 2) + '\n';
}

/** Every hash a released version of an installable file has had (templates/known-hashes.json). */
export function knownHashes(pkg: string): Set<string> {
  const f = join(pkg, 'templates', 'known-hashes.json');
  return new Set(existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as string[]) : []);
}

/** The hashes a package file can have once installed: as shipped, and (trunk ruleset) as patched for one identity. */
export function shippedHashes(path: string, data: Buffer): string[] {
  const name = path.split('/').pop()!;
  const out = [releasedHash(name, data)];
  if (name === 'ruleset.trunk.json') try { out.push(sha(oneIdentityRuleset(data.toString('utf8')))); } catch { /* an old shape: the unpatched hash only */ }
  return out;
}

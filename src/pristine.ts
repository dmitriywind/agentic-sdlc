// What init treats as an unedited file: one whose hash is a hash of some released version of it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** Package paths init installs from: the skill pack, scorers, gate templates, and three runner files. */
export const isInstallable = (path: string) =>
  /^(skills|scorers)\/./.test(path) || /^templates\/gates\/./.test(path) || /^templates\/runner\/(setup\.sh|cycle-prompt\.md|review-prompt\.md)$/.test(path);

/** The binding values written into the stock workflows (the `# set:` lines init derives from the binding). */
export type Bound = { trunk: string; releasePrefix: string; delivery: string; install: string; verify: string };
export const DEFAULTS: Bound = { trunk: 'main', releasePrefix: 'release/', delivery: 'release-line', install: 'npm ci', verify: 'npm test' };

const yamlScalar = (v: string) => (/^[\w./ -]+$/.test(v) ? v : JSON.stringify(v));

/** Write the binding's values into a stock workflow, by the file's name. Other files come back unchanged. */
export function bindWorkflow(name: string, text: string, v: Bound): string {
  if (name === 'agentic-sdlc-delivery.yml')
    return text
      .replace(/^(\s+TRUNK: )\S+(?=\s+# set:)/m, `$1${v.trunk}`)
      .replace(/^(\s+RELEASE_PREFIX: )\S+(?=\s+# set:)/m, `$1${v.releasePrefix}`)
      .replace(/^(\s+DELIVERY: )\S+(?=\s+# set:)/m, `$1${v.delivery}`)
      .replace(/(# set: your vcs\.trunk\n\s+branches: )\[[^\]]*\]/, `$1[${v.trunk}]`);
  if (name === 'agentic-sdlc-verify.yml')
    return text
      .replace(/^(\s+run: ).*?(?=\s+# set: the binding's commands\.install)/gm, (_, a) => a + yamlScalar(v.install))
      .replace(/^(\s+run: ).*?(?=\s+# set: the binding's commands\.verify)/gm, (_, a) => a + yamlScalar(v.verify));
  return text;
}

/** The hash a file has when its binding values are the template's own: what a released version is compared by. */
export function releasedHash(name: string, data: Buffer): string {
  return sha(name === 'agentic-sdlc-delivery.yml' || name === 'agentic-sdlc-verify.yml' ? bindWorkflow(name, data.toString('utf8'), DEFAULTS) : data);
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

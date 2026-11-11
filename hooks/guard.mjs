#!/usr/bin/env node
// PreToolUse guard of the agentic-sdlc plugin. Exit 2 (stderr shown to the agent) blocks the call:
// - `git push` to the trunk (vcs.trunk in .agents/binding.yml, default main): delivery goes through a CR;
// - `agentic-sdlc forge approve` (Bash or the MCP tool) unless AGENTIC_SDLC_ROLE=review: only the review runtime approves.
// No dependencies: a plugin installed from git has no node_modules.
// ponytail: a token scan, not a shell parser; the ruleset and the token split are the real defence.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const block = (why) => { process.stderr.write(`agentic-sdlc guard: ${why}\n`); process.exit(2); };

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const dir = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const review = process.env.AGENTIC_SDLC_ROLE === 'review';
const APPROVE = 'forge approve is for the review runtime only (AGENTIC_SDLC_ROLE=review).';

if (/forge_approve$/.test(input.tool_name ?? '')) {
  if (!review) block(APPROVE);
  process.exit(0);
}
const command = String(input.tool_input?.command ?? '');
if (!command) process.exit(0);

const gitOut = (cwd, ...args) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
};
const headOf = (cwd) => gitOut(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');

// The binding lives at the project root: the repo top, the main checkout of a linked worktree, the plugin's project dir, or cwd.
const common = gitOut(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir');
const trunks = new Set(['main', 'master']);
for (const c of [gitOut(dir, 'rev-parse', '--show-toplevel'), common && dirname(common), process.env.CLAUDE_PROJECT_DIR, dir]) {
  if (!c) continue;
  let text;
  try { text = readFileSync(join(c, '.agents', 'binding.yml'), 'utf8'); } catch { continue; }
  const m = /^\s*trunk:\s*["']?([^\s"'#]+)/m.exec(text);
  if (m) { trunks.clear(); trunks.add(m[1]); }
  break;
}
const CLI = /(^|[/\\])agentic-sdlc$|agentic-sdlc[/\\]dist[/\\]bin\.js$/;
const GIT = /(^|[/\\])git(\.exe)?$/;
const WITH_VALUE = ['-C', '-c', '--git-dir', '--work-tree', '--namespace'];

for (const seg of command.split(/&&|\|\||[;|&\n]/)) {
  // Quotes, parentheses, `$(` and backticks dropped, so `bash -c 'git push ...'`, `(git push ...)`, `$(git push ...)` and `` `git push ...` `` are scanned too.
  const t = seg.trim().split(/\s+/).map((x) => x.replace(/^['"(`$]+|['")`]+$/g, '')).filter(Boolean);
  const cli = t.findIndex((x) => CLI.test(x));
  if (cli >= 0) {
    const rest = t.slice(cli + 1).filter((x, i, a) => !(x === '--root' || a[i - 1] === '--root'));
    if (rest[0] === 'forge' && rest[1] === 'approve' && !review) block(APPROVE);
  }
  const g = t.findIndex((x) => GIT.test(x));
  if (g < 0) continue;
  // Skip git's global options (-C <dir>, -c <k=v>, --git-dir <d> ...) to reach the subcommand.
  let i = g + 1, cwd = dir;
  while (t[i]?.startsWith('-')) {
    if (t[i] === '-C') cwd = resolve(cwd, t[i + 1] ?? '');
    i += WITH_VALUE.includes(t[i]) ? 2 : 1;
  }
  if (t[i] !== 'push') continue;
  const args = t.slice(i + 1);
  if (args.some((x) => x === '--all' || x === '--mirror' || x === '--branches')) block('push of all branches is not allowed: push your change line by name.');
  const refs = args.filter((x) => !x.startsWith('-'));
  if (refs.some((r) => r.includes('*'))) block('glob refspecs are not allowed: push your change line by name.');
  const head = headOf(cwd);
  const dst = (r) => {
    const d = r.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '');
    return d === 'HEAD' || d === '@' ? head : d;
  };
  const hit = refs.slice(1).map(dst).find((d) => trunks.has(d));
  if (hit) block(`push to the trunk '${hit}' is not allowed: open a CR.`);
  if (refs.length <= 1 && trunks.has(head)) block(`push from the trunk '${head}' is not allowed: start a change line and open a CR.`);
}
process.exit(0);

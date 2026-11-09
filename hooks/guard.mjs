#!/usr/bin/env node
// PreToolUse guard of the agentic-sdlc plugin. Exit 2 (stderr shown to the agent) blocks the call:
// - `git push` to the trunk (vcs.trunk in .agents/binding.yml, default main): delivery goes through a CR;
// - `agentic-sdlc forge approve` (Bash or the MCP tool) unless AGENTIC_SDLC_ROLE=review: only the review runtime approves.
// No dependencies: a plugin installed from git has no node_modules.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const block = (why) => { process.stderr.write(`agentic-sdlc guard: ${why}\n`); process.exit(2); };

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const dir = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const review = process.env.AGENTIC_SDLC_ROLE === 'review';

if (/forge_approve$/.test(input.tool_name ?? '')) {
  if (!review) block('forge approve is for the review runtime only (AGENTIC_SDLC_ROLE=review).');
  process.exit(0);
}
const command = String(input.tool_input?.command ?? '');
if (!command) process.exit(0);

let trunk = 'main';
try {
  const m = /^\s*trunk:\s*["']?([^\s"'#]+)/m.exec(readFileSync(join(dir, '.agents', 'binding.yml'), 'utf8'));
  if (m) trunk = m[1];
} catch { /* no binding: default trunk */ }

for (const seg of command.split(/&&|\|\||[;|\n]/)) {
  const t = seg.trim().split(/\s+/).filter(Boolean);
  const cli = t.indexOf('agentic-sdlc');
  if (cli >= 0) {
    const rest = t.slice(cli + 1).filter((x, i, a) => !(x === '--root' || a[i - 1] === '--root'));
    if (rest[0] === 'forge' && rest[1] === 'approve' && !review) block('forge approve is for the review runtime only (AGENTIC_SDLC_ROLE=review).');
  }
  const g = t.indexOf('git');
  if (g < 0 || t[g + 1] !== 'push') continue;
  const refs = t.slice(g + 2).filter((x) => !x.startsWith('-'));
  const toTrunk = (r) => r.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '') === trunk;
  if (refs.slice(1).some(toTrunk)) block(`push to the trunk '${trunk}' is not allowed: open a CR.`);
  if (refs.length <= 1) {
    let head = '';
    try { head = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a repo */ }
    if (head === trunk) block(`push from the trunk '${trunk}' is not allowed: start a change line and open a CR.`);
  }
}
process.exit(0);

#!/usr/bin/env node
// PreToolUse guard of the agentic-sdlc plugin. Exit 2 (stderr shown to the agent) blocks the call:
// - `git push` to the trunk (vcs.trunk in .agents/binding.yml, default main): delivery goes through a CR;
// - `agentic-sdlc forge approve` (Bash or the MCP tool) unless AGENTIC_SDLC_ROLE=review: only the review runtime approves;
// - `agentic-sdlc forge status` (Bash or the MCP tool) unless AGENTIC_SDLC_ROLE=review or AGENTIC_SDLC_ALLOW_STATUS=1
//   (the runner sets it for a one-identity cycle that starts `mcp --allow status`): an implementer never posts a status.
// - any Bash command that is not an agentic-sdlc CLI call, from the `sdlc-reviewer` agent.
// No dependencies: a plugin installed from git has no node_modules.
// ponytail: a token scan, not a shell parser, and it fails closed on what it cannot resolve (a variable, a cd to a computed path).
// The trunk ruleset and the absence of the review token are the real boundary; this hook is a second line of defence.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const block = (why) => { process.stderr.write(`agentic-sdlc guard: ${why}\n`); process.exit(2); };

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const dir = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const review = process.env.AGENTIC_SDLC_ROLE === 'review';
const status = review || process.env.AGENTIC_SDLC_ALLOW_STATUS === '1';
// The sdlc-reviewer agent (plugin-scoped agent_type) runs only the agentic-sdlc CLI from PATH in Bash: review/review never runs the CR's code.
const reviewer = /(^|:)sdlc-reviewer$/.test(input.agent_type ?? '');
const REVIEWER = 'the sdlc-reviewer agent runs only agentic-sdlc commands in Bash: review/review never runs the change request\'s code.';
const APPROVE = 'forge approve is for the review runtime only (AGENTIC_SDLC_ROLE=review).';
const STATUS = 'forge status is for the review runtime only (AGENTIC_SDLC_ROLE=review, or AGENTIC_SDLC_ALLOW_STATUS=1 set by the runner for a one-identity cycle).';

if (/forge_approve$/.test(input.tool_name ?? '')) {
  if (!review) block(APPROVE);
  process.exit(0);
}
if (/forge_status$/.test(input.tool_name ?? '')) {
  if (!status) block(STATUS);
  process.exit(0);
}
const command = String(input.tool_input?.command ?? '');
if (!command) process.exit(0);

const gitOut = (cwd, ...args) => {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
};
const headOf = (cwd, extra = []) => gitOut(cwd, ...extra, 'rev-parse', '--abbrev-ref', 'HEAD');

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
const CLI = /[^/\\]*agentic-sdlc[^/\\]*$|(^|[/\\])bin\.js$|agentic-sdlc[/\\](.*[/\\])?dist[/\\](bin|cli)\.js$/;
const GIT = /(^|[/\\])git(\.exe)?$/;
const WITH_VALUE = ['-C', '-c', '--git-dir', '--work-tree', '--namespace'];
const WRAP = /(^|[/\\])(eval|sh|bash|zsh|dash|ksh)$/;
const PUSH_WORD = /(^|[^\w-])push([^\w-]|$)/;
const NOCD = 'cannot tell which checkout this push runs in: run the push from the change worktree without cd, -C, --git-dir or --work-tree on a computed path.';

// Split into segments of tokens. Quotes are dropped and not respected for splitting (so `bash -c 'a && git push'` is scanned);
// `#` starts a comment only at the start of an unquoted word. `$(` and backticks open a new segment and mark the one they leave.
const scan = (cmd) => {
  const segs = [];
  let seg = { t: [], subst: false }, tok = '', started = false, q = '', bt = false;
  const endTok = () => { if (tok) seg.t.push({ s: tok, dyn: tok.includes('$') }); tok = ''; started = false; };
  const endSeg = (mark) => { endTok(); if (mark) seg.subst = true; segs.push(seg); seg = { t: [], subst: false }; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") { if (c === "'") q = ''; else if (/\s/.test(c)) endTok(); else if (/[;|&<>()]/.test(c)) endSeg(); else tok += c; continue; }
    if (c === '\\') { const n = cmd[++i]; if (n && n !== '\n') { tok += n; started = true; } continue; }
    if (c === '"' || c === "'") { q = q === '"' && c === '"' ? '' : q || c; started = true; continue; }
    if (c === '$' && cmd[i + 1] === '(') { endSeg(true); i++; continue; }
    if (c === '`') { const open = !bt; bt = !bt; endSeg(open); continue; }
    if (/\s/.test(c) && c !== '\n') { endTok(); continue; }
    if (c === '#' && !q && !started && !tok) { while (i < cmd.length && cmd[i] !== '\n') i++; i--; continue; }
    if (c === '\n' || /[;|&<>()]/.test(c)) { endSeg(); continue; }
    tok += c; started = true;
  }
  endSeg();
  return segs;
};

// The reviewer's one allowed shape: a command word that is exactly `agentic-sdlc`, or `npx [--no|--no-install] agentic-sdlc`.
const reviewerOk = (tt, seg) => {
  if (seg.subst || tt.some((x) => x.dyn)) return false;
  const t = tt.map((x) => x.s);
  if (t[0] === 'agentic-sdlc') return true;
  if (t[0] !== 'npx') return false;
  let i = 1;
  while (t[i] === '--no' || t[i] === '--no-install') i++;
  return t[i] === 'agentic-sdlc';
};
const lit = (p, base) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : resolve(base, p));
const pushy = PUSH_WORD.test(command);
let cwd = dir; // where the next command runs; null when a cd went to a path that is not a literal, existing directory
// The reviewer's command is scanned with its /dev/null redirections removed; any other redirection or `$` or backtick blocks it.
const scanned = reviewer ? command.replace(/\s\d*>>?\s*\/dev\/null/g, '').replace(/\s2>&1/g, '') : command;
if (reviewer && /[<>$`]/.test(scanned)) block(REVIEWER);
for (const seg of scan(scanned)) {
  const tt = seg.t, t = tt.map((x) => x.s);
  let ci = 0;
  while (ci < t.length && /^[A-Za-z_]\w*=/.test(t[ci])) ci++;
  const envMoved = t.slice(0, ci).some((x) => /^GIT_(DIR|WORK_TREE)=/.test(x));
  if (t[ci] === 'builtin') ci++;
  const cmd = t[ci] ?? '';
  if (reviewer && t.length && !(ci === 0 && reviewerOk(tt, seg))) block(REVIEWER);
  if (tt[ci]?.dyn && pushy) block('a command word built from a variable in a command that pushes is not allowed: write the git push out literally.');
  if (WRAP.test(cmd) && pushy && (seg.subst || tt.some((x) => x.dyn))) block('a shell expansion inside eval or sh -c in a command that pushes is not allowed: write the git push out literally.');
  if (cmd === 'cd' || cmd === 'pushd' || cmd === 'popd') {
    const a = t.slice(ci + 1).map((x, k) => [x, tt[ci + 1 + k].dyn]).filter(([x]) => x === '-' || !x.startsWith('-'));
    const [x, dyn] = a[0] ?? [cmd === 'cd' ? '~' : '', false];
    const next = !x || dyn || x === '-' || seg.subst || cmd === 'popd' ? null : lit(x, cwd ?? '/');
    cwd = next && (cwd !== null || isAbsolute(next)) && existsSync(next) ? next : null;
    continue;
  }
  const cli = t.findIndex((x) => CLI.test(x));
  if (cli >= 0) {
    const rest = tt.slice(cli + 1).filter((x, i, a) => !(x.s === '--root' || a[i - 1]?.s === '--root'));
    if (rest[0]?.s === 'forge') {
      const verb = rest[1]?.s ?? '', unknown = seg.subst || /[$`]/.test(verb);
      if ((verb === 'approve' || unknown) && !review) block(APPROVE);
      if ((verb === 'status' || unknown) && !status) block(STATUS);
    }
  }
  const g = t.findIndex((x) => GIT.test(x));
  if (g < 0) continue;
  // Skip git's global options (-C <dir>, -c <k=v>, --git-dir <d> ...) to reach the subcommand.
  let i = g + 1, unresolved = cwd === null || envMoved;
  let bases = [...new Set([cwd, dir].filter((x) => x !== null))], gitDir = '';
  while (t[i]?.startsWith('-')) {
    const o = t[i], v = t[i + 1] ?? '', vd = tt[i + 1]?.dyn;
    const eq = /^--(git-dir|work-tree)=(.*)$/.exec(o);
    if (o === '-c' && /^alias\./i.test(v)) block('git -c alias.* can hide a push: write the git push out literally.');
    if (o === '-C' || o === '--work-tree' || o === '--git-dir' || eq) {
      const name = eq ? '--' + eq[1] : o, val = eq ? eq[2] : v, d = eq ? tt[i].dyn : vd;
      if (d || !val) unresolved = true;
      else if (name === '--git-dir') gitDir = bases.length ? resolve(bases[0], val) : '';
      else bases = bases.map((b) => resolve(b, val));
    }
    i += WITH_VALUE.includes(o) ? 2 : 1;
  }
  if (tt[i]?.dyn && pushy) block('a git subcommand built from a variable in a command that pushes is not allowed: write the git push out literally.');
  if (t[i] !== 'push') continue;
  if (unresolved) block(NOCD);
  const targs = tt.slice(i + 1), args = targs.map((x) => x.s);
  if (seg.subst || targs.some((x) => x.dyn && (!x.s.startsWith('-') || x.s.startsWith('--repo')))) block('a push whose remote or refspec uses a shell expansion is not allowed: name the remote and the change line literally.');
  if (args.some((x) => x === '--all' || x === '--mirror' || x === '--branches')) block('push of all branches is not allowed: push your change line by name.');
  // With --repo=<remote> every non-flag argument is a refspec.
  const refs = [...(args.some((x) => x.startsWith('--repo=')) ? ['<repo>'] : []), ...args.filter((x) => !x.startsWith('-'))];
  if (refs.some((r) => /[*{}]/.test(r))) block('glob or brace refspecs are not allowed: push your change line by name.');
  for (const head of new Set(bases.map((b) => headOf(b, gitDir ? [`--git-dir=${gitDir}`] : [])))) {
    const dst = (r) => {
      const d = r.replace(/^\+/, '').split(':').pop().replace(/#.*$/, '').replace(/^refs\/heads\//, '');
      return d === 'HEAD' || d === '@' ? head : d;
    };
    const hit = refs.slice(1).map(dst).find((d) => trunks.has(d));
    if (hit) block(`push to the trunk '${hit}' is not allowed: open a CR.`);
    if (refs.length <= 1 && trunks.has(head)) block(`push from the trunk '${head}' is not allowed: start a change line and open a CR.`);
  }
}
process.exit(0);

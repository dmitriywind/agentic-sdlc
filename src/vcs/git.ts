import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AdapterContext, Vcs } from '../ports.ts';

export function git(ctx: AdapterContext): Vcs {
  const { trunk, release_prefix } = ctx.binding.vcs;
  const g = (...a: string[]) => ctx.exec('git', a, { cwd: ctx.root }).trim();
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const base = () => g('merge-base', 'HEAD', `origin/${trunk}`);
  return {
    async start(name) {
      g('fetch', 'origin', trunk);
      const workdir = join(ctx.root, '.agents', 'work', name);
      // Only a missing remote branch means 'start from trunk'; a network or auth error is not.
      const fetchBranch = () => {
        try { g('fetch', 'origin', name); return true; } catch (e) {
          if (/couldn't find remote ref|could not find remote ref/i.test(String((e as Error).message) + String((e as { stderr?: unknown }).stderr ?? ''))) return false;
          throw e;
        }
      };
      // Reuse: take remote commits; a non-fast-forward keeps local work and the later push reports it.
      const catchUp = () => {
        if (!fetchBranch()) return;
        try { ctx.exec('git', ['merge', '--ff-only', `origin/${name}`], { cwd: workdir }); } catch { /* diverged */ }
      };
      if (existsSync(workdir)) { catchUp(); return { workdir, ref: name }; }
      g('worktree', 'prune');
      const has = (ref: string) => { try { g('rev-parse', '--verify', '--quiet', ref); return true; } catch { return false; } };
      if (has(`refs/heads/${name}`)) { g('worktree', 'add', workdir, name); catchUp(); }
      else {
        const remote = fetchBranch();
        if (remote) g('worktree', 'add', '-b', name, workdir, `origin/${name}`);
        else g('worktree', 'add', '-b', name, workdir, `origin/${trunk}`);
      }
      return { workdir, ref: name };
    },
    async head() { return { ref: g('rev-parse', '--abbrev-ref', 'HEAD'), sha: g('rev-parse', 'HEAD') }; },
    async changed(since) { return lines(g('diff', '--name-only', `${since ?? `origin/${trunk}`}...HEAD`)); },
    async base() { return { sha: base() }; },
    async push() {
      const ref = g('rev-parse', '--abbrev-ref', 'HEAD');
      // Delivery to the trunk goes through a CR; the ruleset is not on every forge or profile.
      if (ref === trunk || ref === 'HEAD') throw new Error(`vcs push: refusing to push ${ref === 'HEAD' ? 'a detached HEAD' : `the trunk '${trunk}'`}: start a change line`);
      g('push', '-u', 'origin', ref);
    },
    async cut(rev, release) {
      const ref = `refs/heads/${release_prefix}${release}`;
      g('push', 'origin', `${rev}:${ref}`);
      return { ref };
    },
    async tag(name, rev) {
      g('tag', '-a', name, rev, '-m', name);
      g('push', 'origin', `refs/tags/${name}`);
    },
    async tags(prefix) {
      const out = g('tag', '--sort=-creatordate', '--format=%(refname:short) %(*objectname) %(objectname)', '-l', `${prefix ?? ''}*`);
      return out.split('\n').filter(Boolean).map((l) => { const [name, a, b] = l.split(' '); return { name, sha: a || b }; });
    },
    async drop(name) {
      g('worktree', 'remove', '--force', join(ctx.root, '.agents', 'work', name));
      try { g('branch', '-D', name); } catch { /* branch already gone */ }
    },
    async checkoutTests(rev, paths) {
      // read-tree also removes files HEAD added that rev lacks, so a proof cannot lean on new product code.
      g('read-tree', '-u', '--reset', rev);
      if (paths.length) g('checkout', 'HEAD', '--', ...paths);
    },
    async snapshot(rev) {
      // ponytail: a linked worktree shares the repo's .git object DB, so `git log` / `git show`
      // still reach every later commit; agent_command must sandbox the agent away from git.
      const workdir = mkdtempSync(join(tmpdir(), 'agentic-bench-'));
      g('worktree', 'add', '--detach', workdir, rev);
      const w = (...a: string[]) => ctx.exec('git', a, { cwd: workdir });
      return {
        workdir,
        async changed() { w('add', '-A'); return lines(w('diff', '--cached', '--name-only', '--no-renames', rev)); },
        async drop() {
          try { g('worktree', 'remove', '--force', workdir); } catch { /* removed below */ }
          rmSync(workdir, { recursive: true, force: true });
          try { g('worktree', 'prune'); } catch { /* best effort */ }
        },
      };
    },
  };
}

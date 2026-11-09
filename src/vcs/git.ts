import { mkdtempSync, rmSync } from 'node:fs';
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
      g('worktree', 'add', '-b', name, workdir, `origin/${trunk}`);
      return { workdir, ref: name };
    },
    async head() { return { ref: g('rev-parse', '--abbrev-ref', 'HEAD'), sha: g('rev-parse', 'HEAD') }; },
    async changed(since) { return lines(g('diff', '--name-only', `${since ?? `origin/${trunk}`}...HEAD`)); },
    async base() { return { sha: base() }; },
    async push() { g('push', '-u', 'origin', g('rev-parse', '--abbrev-ref', 'HEAD')); },
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
      g('checkout', rev, '--', '.');
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

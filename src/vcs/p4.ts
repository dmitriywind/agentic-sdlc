import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AdapterContext, Vcs } from '../ports.ts';

// ponytail: p4 output is parsed from plain text; verify against your server before relying on it.
export function p4(ctx: AdapterContext): Vcs {
  const o = ctx.options as { mainline?: string; depot?: string; mode?: string };
  const depot = o.depot ?? 'depot';
  const mainline = o.mainline ?? `//${depot}/${ctx.binding.vcs.trunk}`;
  const stream = (o.mode ?? 'stream') === 'stream';
  const p = (a: string[], input?: string, cwd = ctx.root) => ctx.exec('p4', a, { cwd, input }).trim();
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const client = () => ctx.env.P4CLIENT ?? p(['-F', '%clientName%', 'info']);
  const pending = () => /^Change (\d+)/.exec(p(['changes', '-m1', '-s', 'pending', '-c', client()]))?.[1];
  const ensureChange = () => {
    const n = pending();
    if (n) return n;
    const out = p(['change', '-i'], p(['--field', 'Description=agentic-sdlc change', '--field', 'Files=', 'change', '-o']));
    const c = /Change (\d+)/.exec(out)![1];
    p(['reopen', '-c', c, '//...']);
    return c;
  };
  const paths = (s: string) => lines(s).map((l) => /^(\/\/.+?)#\d+/.exec(l)?.[1]).filter((x): x is string => !!x);
  return {
    async start(name) {
      if (!stream) {
        const out = p(['change', '-i'], p(['--field', `Description=${name}`, '--field', 'Files=', 'change', '-o']));
        return { workdir: ctx.root, ref: /Change (\d+)/.exec(out)![1] };
      }
      const ref = `//${depot}/${name}`;
      p(['stream', '-i'], p(['stream', '-o', '-t', 'task', '-P', mainline, ref]));
      const workdir = join(ctx.root, '.agents', 'work', name);
      const c = `agentic-${name}`;
      p(['client', '-i'], p(['--field', `Root=${workdir}`, '--field', `Stream=${ref}`, 'client', '-o', c]));
      ctx.exec('p4', ['-c', c, '-d', workdir, 'sync'], { cwd: ctx.root });
      return { workdir, ref };
    },
    async head() {
      const sha = /^Change (\d+)/.exec(p(['changes', '-m1', '#have']))?.[1] ?? '';
      return { ref: stream ? /^Stream:\s*(\S+)/m.exec(p(['client', '-o']))?.[1] ?? mainline : pending() ?? '', sha };
    },
    async changed(since) {
      return paths(since ? p(['files', `//...@${since},@now`]) : p(['opened']));
    },
    async base() { return { sha: /^Change (\d+)/.exec(p(['changes', '-m1', '#have']))?.[1] ?? '' }; },
    async push() { p(['shelve', '-f', '-c', ensureChange()]); },
    async cut(rev, release) {
      const name = `${ctx.binding.vcs.release_prefix}${release}`;
      if (stream) {
        const ref = `//${depot}/${name}`;
        p(['stream', '-i'], p(['stream', '-o', '-t', 'release', '-P', mainline, ref]));
        p(['populate', '-d', `cut ${name}`, `${mainline}/...@${rev}`, `${ref}/...`]);
        return { ref };
      }
      p(['tag', '-l', name, `//${depot}/...@${rev}`]);
      return { ref: name };
    },
    async tag(name, rev) { p(['tag', '-l', name, `${stream ? mainline : `//${depot}`}/...@${rev}`]); },
    async tags(prefix) {
      // ponytail: p4 labels have no stable creation order; reversed name order
      return lines(p(['labels', '-e', `${prefix ?? ''}*`])).map((l) => /^Label (\S+)/.exec(l)?.[1]).filter((x): x is string => !!x).map((name) => ({ name, sha: '' })).reverse();
    },
    async drop(name) {
      if (!stream) {
        // changelist mode: the pending changelist whose description is the name
        const n = lines(p(['changes', '-s', 'pending', '-c', client()])).map((l) => new RegExp(`^Change (\d+) .*'${name}`).exec(l)?.[1]).find(Boolean);
        if (n) { p(['revert', '-c', n, '//...']); p(['change', '-d', n]); }
        return;
      }
      const c = `agentic-${name}`;
      p(['-c', c, 'revert', '//...']);
      p(['client', '-d', '-f', c]);
      rmSync(join(ctx.root, '.agents', 'work', name), { recursive: true, force: true });
    },
    async checkoutTests(rev, keep) {
      p(['sync', `${stream ? mainline : `//${depot}`}/...@${rev}`]);
      for (const k of keep) p(['sync', '-f', k]);
    },
  };
}

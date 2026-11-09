import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AdapterContext, Vcs } from '../ports.ts';

export function hg(ctx: AdapterContext): Vcs {
  const { trunk, release_prefix } = ctx.binding.vcs;
  const topic = (ctx.options.mode ?? 'topic') === 'topic';
  const h = (a: string[], cwd = ctx.root) => ctx.exec('hg', a, { cwd }).trim();
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const anc = `ancestor(., ${trunk})`;
  const ref = () => h(['log', '-r', '.', '-T', topic ? '{topic}' : '{activebookmark}']);
  return {
    async start(name) {
      h(['pull']);
      const workdir = join(ctx.root, '.agents', 'work', name);
      h(['share', ctx.root, workdir]);
      h(['update', trunk], workdir);
      h(topic ? ['topic', name] : ['bookmark', name], workdir);
      return { workdir, ref: name };
    },
    async head() { return { ref: ref(), sha: h(['log', '-r', '.', '-T', '{node}']) }; },
    async changed(since) { return lines(h(['status', '--rev', since ?? anc, '-n'])); },
    async base() { return { sha: h(['log', '-r', anc, '-T', '{node}']) }; },
    async push() { h(topic ? ['push', '-r', '.'] : ['push', '-B', ref()]); },
    async cut(rev, release) {
      const name = `${release_prefix}${release}`;
      h(['bookmark', '-f', '-r', rev, name]);
      h(['push', '-B', name]);
      return { ref: name };
    },
    async tag(name, rev) {
      h(['tag', '-r', rev, name]);
      h(['push', '-r', 'tip']);
    },
    async tags(prefix) {
      const out = h(['tags', '-T', '{tag} {node}\n']);
      return lines(out).map((l) => { const [name, sha] = l.split(' '); return { name, sha }; }).filter((t) => t.name !== 'tip' && t.name.startsWith(prefix ?? ''));
    },
    async drop(name) { rmSync(join(ctx.root, '.agents', 'work', name), { recursive: true, force: true }); },
    async checkoutTests(rev, paths) {
      h(['revert', '--no-backup', '-r', rev, '--all']);
      if (paths.length) h(['revert', '--no-backup', '-r', '.', ...paths]);
    },
  };
}

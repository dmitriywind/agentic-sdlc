// Append the hashes of every released version of every installable file to templates/known-hashes.json.
// `npm run build` runs it; CI fails when the committed list is stale. It reads git and the working tree, never the network.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInstallable, shippedHashes } from '../src/pristine.ts';

const root = join(import.meta.dirname, '..');
const OUT = join(root, 'templates', 'known-hashes.json');
const git = (args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 1 << 30 });

const found = new Set(existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []);
const before = found.size;

// Every blob in every commit, with the path it had.
const blobs = new Map();
// The trunk's history and the release tags: what a pin (a tag or a commit sha) can install. Other branches are drafts.
for (const l of git(['rev-list', '--objects', 'HEAD', '--tags']).toString().split('\n')) {
  const i = l.indexOf(' ');
  if (i > 0 && isInstallable(l.slice(i + 1))) blobs.set(l.slice(0, i), l.slice(i + 1));
}
const ids = [...blobs.keys()];
if (ids.length) {
  const out = git(['cat-file', '--batch'], ids.join('\n') + '\n');
  let at = 0;
  for (const id of ids) {
    const nl = out.indexOf(10, at);
    const [, type, size] = out.subarray(at, nl).toString().split(' ');
    const body = out.subarray(nl + 1, nl + 1 + Number(size));
    at = nl + 1 + Number(size) + 1;
    if (type === 'blob') for (const h of shippedHashes(blobs.get(id), body)) found.add(h); // a folder (tree) matches the path test too

  }
}

// The working tree: the version about to be released.
const walk = (dir, rel) => readdirSync(join(dir, rel)).flatMap((n) => {
  const r = `${rel}/${n}`;
  return statSync(join(dir, r)).isDirectory() ? walk(dir, r) : [r];
});
for (const p of ['skills', 'scorers', 'templates'].flatMap((d) => walk(root, d)).filter(isInstallable))
  for (const h of shippedHashes(p, readFileSync(join(root, p)))) found.add(h);

writeFileSync(OUT, JSON.stringify([...found].sort(), null, 0).replaceAll('","', '",\n  "').replace('["', '[\n  "').replace('"]', '"\n]') + '\n');
console.log(`known-hashes: ${found.size} hashes (${found.size - before} new)`);

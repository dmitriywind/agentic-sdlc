// Builds docs/guide.html: scripts/guide.template.html plus the chapters in docs/guide/*.md.
// The Markdown stays the one source of the text; the template holds the page and its interactive parts.
// Run by `npm run build`; CI checks the page is fresh.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const root = join(import.meta.dirname, '..');
const BLOB = 'https://github.com/dmitriywind/agentic-sdlc/blob/master/';
const dir = 'docs/guide';
const files = readdirSync(join(root, dir)).filter((f) => /^\d+-.*\.md$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
const ids = new Set(files.map((f) => f.replace(/\.md$/, '')));
// A link to another chapter stays on the page; any other relative link goes to GitHub.
const links = (md) => md.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, href) => {
  const [path, hash] = href.split('#');
  const id = path.replace(/\.md$/, '');
  if (ids.has(id)) return `](#${id})`;
  return `](${BLOB}${posix.normalize(posix.join(dir, path))}${hash ? `#${hash}` : ''})`;
});
const chapters = files.map((f) => {
  const md = readFileSync(join(root, dir, f), 'utf8').replace(/\r\n/g, '\n');
  const title = /^# (.*)$/m.exec(md)[1];
  const lead = md.split('\n\n').find((p) => p && !p.startsWith('#') && !p.startsWith('<!--') && !p.startsWith('```')) ?? '';
  return { id: f.replace(/\.md$/, ''), file: `${dir}/${f}`, title, lead: lead.replace(/\s+/g, ' ').replace(/[`*]/g, ''), md: links(md) };
});
const data = JSON.stringify({ chapters, blob: BLOB }).replaceAll('</', '<\\/');
const page = readFileSync(join(root, 'scripts', 'guide.template.html'), 'utf8').replace(/\r\n/g, '\n').replace('/*GUIDE_DATA*/null', () => data);
writeFileSync(join(root, 'docs', 'guide.html'), page);
console.log('wrote docs/guide.html');

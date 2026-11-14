// Builds docs/guide.html from three sources:
//   docs/guide/*.md               the chapters (the one source of the text; `<!-- group: X -->` sets the rail group,
//                                 `<!-- viz: name -->` places an interactive part, the glossary chapter's table feeds the hovers)
//   scripts/guide/shell.html      the page: layout, styles, renderer, routing
//   scripts/guide/components/*.js the interactive parts (VIZ.<name>)
// Run by `npm run build`; CI checks the page is fresh.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8').replace(/\r\n/g, '\n');
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
const plain = (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
const chapters = files.map((f) => {
  const md = read(dir, f);
  const title = /^# (.*)$/m.exec(md)[1];
  const lead = md.split('\n\n').find((p) => p && !/^(#|<!--|```|\||- |\d+\. )/.test(p)) ?? '';
  return {
    id: f.replace(/\.md$/, ''), n: parseInt(f), file: `${dir}/${f}`, title, short: title.replace(/^\d+\.\s*/, ''),
    group: /<!-- group: (.+?) -->/.exec(md)?.[1] ?? 'Guide', lead: plain(lead), md: links(md),
  };
});
const groups = [...new Set(chapters.map((c) => c.group))];
// The glossary chapter's table rows (| Term | Means |) become the hover definitions.
const glossaryMd = chapters.find((c) => c.id.endsWith('glossary'))?.md ?? '';
const glossary = [...glossaryMd.matchAll(/^\| ([^|]+?) \| ([^|]+?) \|$/gm)]
  .map((m) => ({ term: plain(m[1]), def: plain(m[2]) })).filter((g) => g.term !== 'Term' && !/^-+$/.test(g.term));
const components = readdirSync(join(root, 'scripts', 'guide', 'components')).filter((f) => f.endsWith('.js')).sort()
  .map((f) => `/* ---------- ${f} ---------- */\n${read('scripts', 'guide', 'components', f)}`).join('\n');
if (/<\/script/i.test(components)) throw new Error('a component contains </script>');
const data = JSON.stringify({ chapters, groups, glossary, blob: BLOB }).replaceAll('</', '<\\/');
const page = read('scripts', 'guide', 'shell.html').replace('/*COMPONENTS*/', () => components).replace('/*GUIDE_DATA*/null', () => data);
// GUIDE_OUT writes a preview copy elsewhere (for parallel work); the committed page is docs/guide.html.
const out = process.env.GUIDE_OUT || join(root, 'docs', 'guide.html');
writeFileSync(out, page);
console.log(`wrote ${out}: ${chapters.length} chapters, ${glossary.length} glossary terms`);

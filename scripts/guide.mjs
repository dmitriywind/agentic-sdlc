// Builds docs/guide.html from the guide chapters in docs/guide/*.md: one page, a chapter list, the diagrams drawn.
// The Markdown stays the one source; this page only embeds it. Run by `npm run build`; CI checks the page is fresh.
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
  return { id: f.replace(/\.md$/, ''), file: `${dir}/${f}`, title: /^# (.*)$/m.exec(md)[1], md: links(md) };
});
const data = JSON.stringify(chapters).replaceAll('</', '<\\/');

writeFileSync(join(root, 'docs', 'guide.html'), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentic-sdlc guide</title>
<meta name="description" content="How agentic-sdlc works and how to use it, in ten chapters with every diagram drawn. Generated from docs/guide/*.md by scripts/guide.mjs.">
<style>
:root { color-scheme: light; --bg: #f6f7f9; --panel: #fff; --line: #e2e5ea; --fg: #1a1c21; --muted: #5a606c; --accent: #4f46e5; --accent-fg: #fff; --code: #eef0f3; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --bg: #0e0f12; --panel: #16181c; --line: #2a2d33; --fg: #e8e9ec; --muted: #a2a7b1; --accent: #a5a6ff; --accent-fg: #111; --code: #1f2126; } }
:root[data-theme="dark"] { color-scheme: dark; --bg: #0e0f12; --panel: #16181c; --line: #2a2d33; --fg: #e8e9ec; --muted: #a2a7b1; --accent: #a5a6ff; --accent-fg: #111; --code: #1f2126; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
.wrap > * { min-width: 0; }
.wrap { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 24px; max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
nav { position: sticky; top: 24px; align-self: start; }
nav strong { display: block; margin: 0 0 12px 8px; font-size: 18px; }
nav ol { list-style: none; margin: 0; padding: 0; }
nav a { display: block; padding: 6px 10px; border-radius: 8px; color: var(--fg); text-decoration: none; }
nav a:hover { background: var(--code); }
nav a[aria-current="page"] { background: var(--accent); color: var(--accent-fg); }
nav select { display: none; width: 100%; max-width: 100%; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--fg); }
article { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 8px 32px 32px; min-width: 0; overflow-wrap: break-word; }
article h1 { font-size: 30px; margin: 24px 0 12px; }
article h2 { margin-top: 36px; padding-top: 12px; border-top: 1px solid var(--line); }
a { color: var(--accent); }
code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: .88em; }
pre { background: var(--code); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
.diagram { margin: 20px 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; overflow-x: auto; text-align: center; }
.diagram pre.mermaid { background: none; padding: 0; margin: 0; overflow: visible; }
.diagram svg { max-width: 100%; height: auto; }
table { border-collapse: collapse; display: block; overflow-x: auto; margin: 16px 0; font-size: 15px; }
th, td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; min-width: 7em; }
td code, th code { white-space: nowrap; }
th { background: var(--code); }
.pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--line); }
.pager a { text-decoration: none; }
.source { color: var(--muted); font-size: 14px; margin-top: 16px; }
@media (max-width: 1000px) {
  .wrap { grid-template-columns: 1fr; padding-top: 12px; }
  nav { position: static; } nav ol, nav strong { display: none; } nav select { display: block; }
  article { padding: 4px 16px 24px; }
}
</style>
<div class="wrap">
  <nav aria-label="Chapters"><strong>agentic-sdlc</strong><ol id="toc"></ol><select id="pick" aria-label="Chapter"></select></nav>
  <main><article id="doc"><p>Loading…</p></article><p class="source" id="source"></p></main>
</div>
<script type="module">
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@18.1.1/lib/marked.esm.js';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs';
const chapters = ${data};
const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
mermaid.initialize({
  startOnLoad: false, securityLevel: 'strict', theme: 'base',
  themeVariables: { fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: '15px', darkMode: dark,
    primaryColor: dark ? '#2b2d55' : '#e0e7ff', primaryTextColor: dark ? '#e8e9ec' : '#1a1c21', primaryBorderColor: dark ? '#a5a6ff' : '#4f46e5',
    lineColor: dark ? '#9aa0ab' : '#5a606c', textColor: dark ? '#e8e9ec' : '#1a1c21', background: 'transparent',
    actorBkg: dark ? '#2b2d55' : '#e0e7ff', actorBorder: dark ? '#a5a6ff' : '#4f46e5', noteBkgColor: dark ? '#3a3320' : '#fef3c7', noteTextColor: dark ? '#f5e7c0' : '#1a1c21',
    edgeLabelBackground: dark ? '#16181c' : '#ffffff' },
  flowchart: { curve: 'basis', padding: 12, nodeSpacing: 40, rankSpacing: 48, wrappingWidth: 240 },
  sequence: { mirrorActors: false, messageMargin: 32, useMaxWidth: false, actorFontSize: 15, messageFontSize: 15, noteFontSize: 14 },
});
marked.use({ renderer: { code({ text, lang }) { return lang === 'mermaid' ? '<div class="diagram"><pre class="mermaid">' + text.replace(/</g, '&lt;') + '</pre></div>' : false; } } });
const toc = document.getElementById('toc'), pick = document.getElementById('pick'), doc = document.getElementById('doc'), src = document.getElementById('source');
for (const c of chapters) {
  toc.insertAdjacentHTML('beforeend', '<li><a href="#' + c.id + '">' + c.title + '</a></li>');
  pick.add(new Option(c.title, c.id));
}
pick.onchange = () => go(pick.value);
// Chapter links switch in the page; the hash follows when the browser allows it (not in a data: URL).
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || !chapters.some((c) => '#' + c.id === a.getAttribute('href'))) return;
  e.preventDefault(); go(a.getAttribute('href').slice(1));
});
function go(id) { try { history.pushState(null, '', '#' + id); } catch {} show(id); }
async function show(id = location.hash.slice(1)) {
  const i = Math.max(0, chapters.findIndex((c) => c.id === id));
  const c = chapters[i], prev = chapters[i - 1], next = chapters[i + 1];
  for (const a of toc.querySelectorAll('a')) {
    if (a.getAttribute('href') === '#' + c.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  pick.value = c.id;
  doc.innerHTML = marked.parse(c.md) + '<div class="pager"><span>' + (prev ? '<a href="#' + prev.id + '">← ' + prev.title + '</a>' : '') + '</span><span>' + (next ? '<a href="#' + next.id + '">' + next.title + ' →</a>' : '') + '</span></div>';
  src.innerHTML = 'Source: <a href="${BLOB}' + c.file + '">' + c.file + '</a>';
  await mermaid.run({ nodes: doc.querySelectorAll('pre.mermaid') });
  scrollTo(0, 0);
}
addEventListener('popstate', () => show());
show();
</script>
</html>
`);
console.log('wrote docs/guide.html');

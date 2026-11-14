// Builds docs/guide.html: the README, the adoption guide and the flow and component diagrams on one page.
// The Markdown files stay the one source; this page only embeds them. Run by `npm run build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const root = join(import.meta.dirname, '..');
const BLOB = 'https://github.com/dmitriywind/agentic-sdlc/blob/master/';
const TABS = [
  ['start', 'Start', 'README.md'],
  ['setup', 'Set up', 'docs/adoption.md'],
  ['flows', 'Flows', 'docs/architecture/flows.md'],
  ['parts', 'Parts', 'docs/architecture/components.md'],
];
// Relative links point at GitHub, so they work from the page wherever it is opened.
const absolute = (md, file) => md.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, href) =>
  `](${BLOB}${posix.normalize(posix.join(dirname(file).replaceAll('\\', '/'), href))})`);
const docs = TABS.map(([id, label, file]) => ({ id, label, file, md: absolute(readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n'), file) }));
const data = JSON.stringify(docs).replaceAll('</', '<\\/');

writeFileSync(join(root, 'docs', 'guide.html'), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentic-sdlc guide</title>
<meta name="description" content="How to set up and run agentic-sdlc, with every flow. Generated from README.md, docs/adoption.md and docs/architecture by scripts/guide.mjs.">
<style>
:root { color-scheme: light; --bg: #f7f7f8; --panel: #fff; --line: #e3e5e9; --fg: #1b1d22; --muted: #565c68; --accent: #4f46e5; --code: #f1f2f4; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; --bg: #0f1012; --panel: #16171a; --line: #2a2c31; --fg: #e7e8eb; --muted: #a3a7b0; --accent: #9b9cff; --code: #1f2025; } }
:root[data-theme="dark"] { color-scheme: dark; --bg: #0f1012; --panel: #16171a; --line: #2a2c31; --fg: #e7e8eb; --muted: #a3a7b0; --accent: #9b9cff; --code: #1f2025; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, -apple-system, Segoe UI, sans-serif; }
header { position: sticky; top: 0; z-index: 1; background: var(--panel); border-bottom: 1px solid var(--line); padding: 12px 16px; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
header strong { margin-right: 8px; }
nav { display: flex; flex-wrap: wrap; gap: 4px; }
nav button { font: inherit; border: 1px solid var(--line); background: none; color: var(--fg); padding: 4px 12px; border-radius: 999px; cursor: pointer; }
nav button[aria-current="page"] { background: var(--accent); border-color: var(--accent); color: #fff; }
main { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
article { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 8px 24px 24px; overflow-wrap: anywhere; }
a { color: var(--accent); }
code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: .9em; }
pre { background: var(--code); padding: 12px; border-radius: 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
pre.mermaid { background: none; text-align: center; }
pre.mermaid svg { min-width: 560px; } /* readable on a phone: the diagram scrolls in its box, not the page */
table { border-collapse: collapse; display: block; overflow-x: auto; margin: 12px 0; }
th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }
blockquote { margin: 0; padding: 4px 16px; border-left: 3px solid var(--accent); color: var(--muted); }
.source { color: var(--muted); font-size: .9em; }
</style>
<header><strong>agentic-sdlc</strong><nav id="nav" aria-label="Sections"></nav></header>
<main><p class="source" id="source"></p><article id="doc"><p>Loading…</p></article></main>
<script type="module">
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs';
const docs = ${data};
const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light';
mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict' });
marked.use({ renderer: { code(text, lang) { return lang === 'mermaid' ? '<pre class="mermaid">' + text.replace(/</g, '&lt;') + '</pre>' : false; } } });
const nav = document.getElementById('nav'), doc = document.getElementById('doc'), src = document.getElementById('source');
async function show(id) {
  const d = docs.find((x) => x.id === id) ?? docs[0];
  for (const b of nav.children) b.setAttribute('aria-current', b.dataset.id === d.id ? 'page' : 'false');
  src.innerHTML = 'Source: <a href="${BLOB}' + d.file + '">' + d.file + '</a>';
  doc.innerHTML = marked.parse(d.md);
  await mermaid.run({ nodes: doc.querySelectorAll('pre.mermaid') });
  if (location.hash.slice(1) !== d.id) history.replaceState(null, '', '#' + d.id);
}
for (const d of docs) {
  const b = document.createElement('button');
  b.textContent = d.label; b.dataset.id = d.id; b.onclick = () => show(d.id);
  nav.append(b);
}
show(location.hash.slice(1));
</script>
</html>
`);
console.log('wrote docs/guide.html');

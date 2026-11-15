/* ---------- The hold: a skill asks, you answer, the cycle resumes ---------- */
VIZ.hold = function hold(el) {
  addStyle('hold', `
.hd > * { min-width: 0; }
.hd-grid { display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 18px; align-items: start; }
.hd-main { display: grid; gap: 14px; min-width: 0; }
.hd-card { display: grid; gap: 8px; padding: 12px 14px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--paper); }
.hd-card .hd-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.hd-card .hd-id { font: 500 13px var(--mono); color: var(--muted); }
.hd-card .hd-t { font-weight: 600; }
.hd-card .hd-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; color: var(--muted); align-items: center; }
.hd-card .hd-meta > span { display: inline-flex; gap: 6px; align-items: center; }
.hd-flash { animation: hd-flash 1.2s ease-out; }
@keyframes hd-flash { from { box-shadow: 0 0 0 3px var(--accent); } to { box-shadow: 0 0 0 0 transparent; } }
.hd-track { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.hd-track li { display: grid; gap: 4px; font-size: 12px; color: var(--muted); line-height: 1.3; }
.hd-track li::before { content: ""; height: 4px; border-radius: 2px; background: var(--rule); }
.hd-track li.done::before { background: var(--idle); }
.hd-track li.now::before { background: var(--accent); }
.hd-track li.now { color: var(--ink); font-weight: 600; }
.hd-now { display: grid; gap: 6px; }
.hd-now p { margin: 0; }
.hd-work { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
.hd-work li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 10px; align-items: baseline; padding: 8px 10px; border-radius: 8px; background: var(--well); }
.hd-work li .dot { align-self: center; }
.hd-work li.hd-q { background: var(--you-soft); }
.hd-thread { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.hd-thread:empty { display: none; }
.hd-c { border: 1px solid var(--rule); border-radius: var(--r); background: var(--sheet); overflow: hidden; }
.hd-c > header { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 7px 12px; background: var(--well); font-size: 13px; color: var(--muted); }
.hd-c > div { padding: 10px 12px; font-size: 14px; display: grid; gap: 6px; overflow-wrap: anywhere; }
.hd-c h5 { margin: 0; font-size: 15px; }
.hd-c ul { margin: 0; padding-left: 18px; display: grid; gap: 3px; }
.hd-c ol { margin: 2px 0 0; padding-left: 20px; display: grid; gap: 2px; }
.hd-c.hd-ignored { opacity: .72; border-style: dashed; }
.hd-c.hd-ignored > div { text-decoration: line-through; text-decoration-color: var(--fail); }
.hd-ev { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 13px; padding: 6px 12px; border-radius: 8px; border-left: 3px solid var(--agent); background: var(--agent-soft); }
.hd-ev.hd-ok { border-left-color: var(--ci); background: var(--ci-soft); }
.hd-ev code { background: none; padding: 0; }
.hd-reply { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--you); border-radius: var(--r); background: var(--you-soft); }
.hd-reply[hidden] { display: none; }
.hd-reply .hd-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 13px; }
.hd-reply textarea { width: 100%; min-height: 64px; resize: vertical; font: 14px/1.5 var(--font); color: var(--ink); background: var(--sheet); border: 1px solid var(--rule); border-radius: 8px; padding: 8px 10px; }
.hd-ctl { display: flex; flex-wrap: wrap; gap: 8px; }
.hd-why { display: grid; gap: 10px; padding: 12px; border-radius: var(--r); background: var(--well); }
.hd-why h4 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.hd-why p { margin: 0; font-size: 13px; color: var(--muted); }
.hd-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.hd-chips li { font-size: 13px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--rule); background: var(--sheet); transition: background .2s, color .2s; }
.hd-chips li.on { background: var(--you); color: var(--sheet); border-color: var(--you); font-weight: 600; }
@media (max-width: 760px) {
  .hd-grid { grid-template-columns: minmax(0, 1fr); }
}
`);

  const TRIGGERS = [['arch', 'Architecture or scope change'], ['undo', 'Cannot be undone'], ['sec', 'Security'], ['data', 'Personal data'],
    ['money', 'Money'], ['legal', 'Legal duty'], ['sign', 'Sign-off'], ['access', 'Missing access or credential'], ['ruling', 'Product ruling'],
    ['regr', 'Regression'], ['twice', 'The same failure past its limit'], ['p0', 'P0']];
  const TRACK = ['Unsure', 'Search', 'Ask', 'Cycle skips', 'Your reply'];
  const OWNER = '@ana', OTHER = '@sam';

  el.className = 'panel hd';
  el.innerHTML = '<div class="legend"><span class="actor agent">agents</span><span class="actor you">you</span><span>Example ticket; the names are made up.</span></div>'
    + '<div class="hd-grid"><div class="hd-main">'
    + '<article class="hd-card" id="hd-card" aria-label="Ticket #7"></article>'
    + '<ol class="hd-track" aria-label="Steps">' + TRACK.map((t) => '<li><span>' + t + '</span></li>').join('') + '</ol>'
    + '<div class="hd-now" id="hd-now" aria-live="polite"></div>'
    + '<ol class="hd-thread" id="hd-thread" aria-label="Ticket #7 comments"></ol>'
    + '<form class="hd-reply" id="hd-reply" hidden><div class="hd-row"><b>Reply on #7 as</b>'
    + '<div class="seg" role="radiogroup" aria-label="Reply as">'
    + '<label><input type="radio" name="hd-as" id="hd-as-owner" value="owner" checked><span>the owner (owners.product)</span></label>'
    + '<label><input type="radio" name="hd-as" id="hd-as-other" value="other"><span>someone else</span></label></div></div>'
    + '<label class="muted" for="hd-text" style="font-size:13px">Your comment</label>'
    + '<textarea id="hd-text">JSON and CSV, as you propose. No other formats for now.</textarea>'
    + '<div class="hd-row"><button class="btn primary" type="submit" id="hd-send">Send</button></div></form>'
    + '<div class="hd-ctl"><button class="btn" type="button" id="hd-back">Back</button><button class="btn primary" type="button" id="hd-next">Next step</button><button class="btn" type="button" id="hd-reset">Reset</button></div>'
    + '</div><aside class="hd-why" aria-label="What makes a skill ask"><h4>What makes a skill ask</h4><ul class="hd-chips" id="hd-chips">'
    + TRIGGERS.map(([k, t]) => '<li data-k="' + k + '">' + t + '</li>').join('') + '</ul>'
    + '<p>Any step, at any status, runs escalate when one of these may hold. A routine step is never escalated.</p></aside></div>'
    + '<div class="callout rule">A hold is a label, not a status. Only a reply from someone in <code>owners</code> counts. You need no label rights: the cycle removes <code>needs-human</code> after your reply.</div>';

  const card = $('#hd-card', el), now = $('#hd-now', el), thread = $('#hd-thread', el), reply = $('#hd-reply', el);
  const next = $('#hd-next', el), back = $('#hd-back', el), text = $('#hd-text', el);
  // step 0..4 as in TRACK; 5 = after a reply was sent. sent: list of { who, text } replies, newest last.
  let step = 0, sent = [];

  const comment = (who, role, when, body, cls = '') => '<li class="hd-c ' + cls + '"><header><span class="actor ' + role + '">' + who + '</span><span>' + when + '</span></header><div>' + body + '</div></li>';
  const event = (body, cls = '') => '<li class="hd-ev ' + cls + '"><span class="actor agent">cycle</span>' + body + '</li>';
  const ASK = comment('escalate', 'agent', 'commented · 09:04',
    '<h5>Needs human: which formats should data export offer?</h5><ul>'
    + '<li><b>Asked by</b>: plan/shape, 09:04</li>'
    + '<li><b>Overview</b>: #7 lets users download their data. The criteria cannot say what the file looks like until someone picks the formats. The importance doc and past answers do not say.</li>'
    + '<li><b>Options</b>:<ol><li><b>JSON and CSV</b> (proposed): JSON keeps every field, CSV opens in a spreadsheet. Two formats to test.</li><li><b>JSON only</b>: smallest change; hard to read without tools.</li><li><b>CSV only</b>: easy to read; nested data gets flattened.</li></ol></li>'
    + '<li><b>Ask</b>: Which formats should the export offer?</li>'
    + '<li><b>Default</b>: #7 stays on hold; nothing is built until an owner replies.</li></ul>');

  function render(flash) {
    const owner = sent.length && sent[sent.length - 1].who === 'owner';
    const held = step >= 2 && !(step === 5 && owner);
    const status = step === 5 && owner ? 'Ready' : 'Backlog';
    card.innerHTML = '<div class="hd-top"><span class="hd-id">#7</span><span class="hd-t">Let users export their data</span></div>'
      + '<div class="hd-meta"><span>Status <span class="state">' + status + '</span></span><span>Priority <span class="tag">High</span></span>'
      + '<span>Labels ' + (held ? '<span class="tag hold">needs-human</span>' : '<span class="tag">feature</span>') + '</span>'
      + '<span>Assignee ' + (held ? '<i>none</i>' : 'plan/shape') + '</span></div>';
    if (flash && !reduced) { card.classList.remove('hd-flash'); void card.offsetWidth; card.classList.add('hd-flash'); }
    el.querySelectorAll('.hd-track li').forEach((li, i) => { const at = [0, 1, 2, 2, 3, 4][step]; li.className = i < at ? 'done' : i === at ? 'now' : ''; if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    el.querySelectorAll('#hd-chips li').forEach((li) => li.classList.toggle('on', step >= 1 && (li.dataset.k === 'ruling' || li.dataset.k === 'data')));

    const say = (who, role, p) => '<div><span class="actor ' + role + '">' + who + '</span></div><p>' + p + '</p>';
    if (step === 0) now.innerHTML = say('plan/shape', 'agent', 'plan/shape is writing the acceptance criteria for #7. One criterion needs a <b>product ruling</b>: which formats may a user export? plan/shape may not pick that itself.')
      + '<ul class="hd-work"><li><span class="dot pass"></span><span>A signed-in user can ask for an export of all their data.</span></li>'
      + '<li class="hd-q"><span class="dot pend"></span><span>The export arrives as a file in format <b>?</b> (CSV, JSON, both)</span></li></ul>';
    if (step === 1) now.innerHTML = say('escalate', 'agent', 'Before it asks anyone, escalate searches. None of the sources settles it, and two triggers hold: a product ruling, and personal data.')
      + '<ul class="hd-work"><li><span class="dot na"></span><span><code>paths.importance_doc</code>: marks data export as important; silent on formats.</span></li>'
      + '<li><span class="dot na"></span><span><code>paths.sources_before_question</code>: the product doc names no export format.</span></li>'
      + '<li><span class="dot na"></span><span>Past answers: no owner reply on #7 after a Needs human comment.</span></li>'
      + '<li class="hd-q"><span class="dot fail"></span><span>Result: <b>escalate</b> (Ruling, Data).</span></li></ul>';
    if (step === 2) now.innerHTML = say('escalate', 'agent', 'It runs <code>board hold</code>: <b>one</b> comment headed "Needs human" and the label <span class="tag hold">needs-human</span>. It clears the assignee and stops. The status stays <b>Backlog</b>.');
    if (step === 3) now.innerHTML = say('you', 'you', 'The ticket now waits on you. Every step skips it until an owner replies. Run the next cycle to see.');
    if (step === 4) now.innerHTML = say('cycle', 'agent', 'The next cycle routes the board and skips #7: it is on hold, and no owner has replied. Now reply as an owner, or as someone else.');
    if (step === 5 && owner) now.innerHTML = say('cycle', 'agent', 'Your reply is from <code>owners.product</code>, so it is trusted. The next cycle sees it in <code>board holds</code> and runs <code>board release</code>, which removes <span class="tag hold">needs-human</span>; plan/shape finishes the criteria with your answer. #7 moves on to <b>Ready</b>.');
    if (step === 5 && !owner) now.innerHTML = say('cycle', 'agent', OTHER + ' is not in <code>owners</code>, so the reply is untrusted and ignored. The hold stays and the next cycle skips #7 again. Reply as the owner to release it.');

    let t = '';
    if (step >= 2) t += ASK;
    if (step >= 4) t += event('10:00 <code>skipped #7: on hold</code>');
    sent.forEach((r, i) => {
      const own = r.who === 'owner';
      t += comment(own ? OWNER : OTHER, own ? 'you' : 'world', 'commented · ' + (10 + i) + ':20 ' + (own ? '<span class="tag">owners.product · trusted</span>' : '<span class="tag">not in owners · ignored</span>'), esc(r.text) || '<i>(empty)</i>', own ? '' : 'hd-ignored');
      t += own ? event((11 + i) + ':00 <code>board release #7: needs-human removed; plan/shape resumes</code>') + event((11 + i) + ':12 <code>plan/shape: criteria done (JSON and CSV) · Backlog → Ready</code>', 'hd-ok')
        : event((11 + i) + ':00 <code>skipped #7: on hold</code>');
    });
    thread.innerHTML = t;

    reply.hidden = !(step === 4 || (step === 5 && !owner));
    back.disabled = step === 0;
    next.textContent = step === 3 ? 'Run the next cycle' : 'Next step';
    next.disabled = step >= 4;
    next.hidden = step >= 4;
  }

  next.onclick = () => { step = Math.min(4, step + 1); render(step === 2); if (step === 4) text.focus({ preventScroll: true }); };
  back.onclick = () => { if (step === 5) { sent = []; step = 4; } else step = Math.max(0, step - 1); render(); (next.hidden ? back : next).focus({ preventScroll: true }); };
  $('#hd-reset', el).onclick = () => { step = 0; sent = []; text.value = 'JSON and CSV, as you propose. No other formats for now.'; $('#hd-as-owner', el).checked = true; render(); next.focus({ preventScroll: true }); };
  reply.onsubmit = (e) => {
    e.preventDefault();
    sent.push({ who: reply.elements['hd-as'].value, text: text.value.trim() });
    step = 5; render(true);
    if (reply.hidden) back.focus({ preventScroll: true });
  };
  render();
};

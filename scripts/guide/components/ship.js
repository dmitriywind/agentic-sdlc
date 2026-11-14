/* ---------- Shipping: merge, deploy each environment, a release line, a failed deploy (chapter 7) ---------- */
{
  const VERSION = '1.4.0';
  const SHIPPED = ['Not shipped', 'On staging', 'On production'];
  const ENVS = ['staging', 'production'];

  VIZ.ship = function ship(el) {
    addStyle('ship', `
.sh { container-type: inline-size; display: grid; gap: 14px; }
.sh-top { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; justify-content: space-between; }
.sh fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sh legend { float: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 0; margin-right: 4px; }
.sh-ticket { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 10px 12px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--well); }
.sh-ticket b { font-size: 14px; }
.sh-ticket b small { font: 500 12px var(--mono); color: var(--muted); margin-right: 4px; }
.sh-ticket .sh-kv { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.sh-pill { font: 500 12px var(--mono); padding: 2px 9px; border-radius: 999px; background: var(--sheet); border: 1px solid var(--rule); color: var(--muted); transition: background-color .3s, color .3s; }
.sh-pill.on { background: var(--ci-soft); border-color: var(--ci); color: var(--ci); }
.sh-pill.done { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.sh-track { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.sh-node { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; align-items: center; align-content: start; padding: 8px 10px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--sheet); position: relative; transition: border-color .3s, background-color .3s; }
.sh-node .dot { grid-row: span 2; }
.sh-node b { font-size: 14px; line-height: 1.3; }
.sh-node span.muted { font-size: 12px; line-height: 1.35; grid-column: 2; }
.sh-node .actor { font-size: 11px; padding: 0 7px; justify-self: start; grid-column: 2; }
.sh-node .btn { grid-column: 2; justify-self: start; min-height: 32px; padding: 4px 10px; font-size: 13px; }
.sh-node.done { border-color: var(--ci); }
.sh-node.cur { border-color: var(--pend); background: var(--you-soft); }
.sh-node.fail { border-color: var(--fail); background: var(--fail-soft); }
.sh-node.env b { font-family: var(--mono); font-weight: 500; }
.sh-rel { display: grid; gap: 6px; padding: 8px; border: 1px dashed var(--you); border-radius: var(--r); position: relative; }
.sh-rel > small { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--you); }
.sh-track > li + li::before { content: "↓"; display: block; font-size: 12px; color: var(--muted); padding-left: 14px; line-height: 1; margin: -2px 0 4px; }
.sh-btns { display: flex; flex-wrap: wrap; gap: 8px; }
.sh-next { font-size: 13px; color: var(--muted); margin: 0; }
.sh-sig { display: grid; gap: 6px; }
.sh-sig .callout { font-size: 14px; line-height: 1.5; }
.sh-sig .sh-card { display: grid; gap: 4px; padding: 10px 12px; border-radius: var(--r); background: var(--fail-soft); border-left: 3px solid var(--fail); }
.sh-sig .sh-card b { font-size: 14px; }
.sh-sig .sh-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.sh-log { list-style: none; margin: 0; padding: 4px 0; max-height: 220px; overflow-y: auto; display: grid; gap: 2px; border-top: 1px solid var(--rule); counter-reset: sh; }
.sh-log li { display: grid; grid-template-columns: 26px auto minmax(0, 1fr); gap: 8px; align-items: baseline; font-size: 13.5px; line-height: 1.45; padding: 4px 0; }
.sh-log li::before { counter-increment: sh; content: counter(sh); font: 500 11px var(--mono); color: var(--muted); text-align: right; }
.sh-log .actor { font-size: 11px; padding: 0 7px; }
.sh-log li.sh-bad { color: var(--fail); }
.sh-log:empty::after { content: "Nothing has happened yet. Press Merge."; font-size: 13px; color: var(--muted); }
@container (min-width: 640px) {
  .sh-track { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); align-items: center; gap: 22px; }
  .sh-track.rel { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr); grid-auto-flow: row; }
  .sh-track > li { position: relative; }
  .sh-track > li + li::before { content: "→"; position: absolute; left: -17px; top: 50%; transform: translateY(-50%); padding: 0; margin: 0; }
}
`);
    el.className = 'panel';
    el.innerHTML = '<div class="sh">'
      + '<div class="sh-top"><fieldset id="sh-mode"><legend>Delivery</legend><div class="seg">'
      + '<label><input type="radio" id="sh-mode-continuous" name="sh-mode" value="continuous" checked><span>Continuous</span></label>'
      + '<label><input type="radio" id="sh-mode-release" name="sh-mode" value="release"><span>Release line</span></label></div></fieldset>'
      + '<div class="sh-ticket" id="sh-ticket"></div></div>'
      + '<ol class="sh-track" id="sh-track" aria-label="Environments"></ol>'
      + '<div class="sh-btns"><button class="btn primary" type="button" id="sh-merge">Merge</button>'
      + '<button class="btn" type="button" id="sh-deploy">Deploy next environment</button>'
      + '<button class="btn" type="button" id="sh-fail">A deploy fails</button>'
      + '<button class="btn" type="button" id="sh-reset">Reset</button></div>'
      + '<p class="sh-next" id="sh-next"></p>'
      + '<div class="sh-sig" id="sh-sig"></div>'
      + '<ol class="sh-log" id="sh-log" aria-live="polite" aria-label="What happened, in order"></ol>'
      + '</div>';
    let s;
    const log = (actor, kind, text, bad) => s.log.push([actor, kind, text, bad]);
    function reset() {
      // shipped: index into SHIPPED; rel: 0 none, 1 requested (the skill picked), 2 approved and cut.
      s = { mode: s ? s.mode : 'continuous', merged: false, shipped: 0, rel: 0, failed: null, log: [] };
    }
    const nextEnv = () => (s.shipped < ENVS.length ? s.shipped : -1);
    // The release line sits before production: production deploys only once the line is cut.
    const blocked = () => s.mode === 'release' && nextEnv() === 1 && s.rel < 2;
    function draw() {
      const rel = s.mode === 'release', ne = s.merged && !s.failed ? nextEnv() : -1;
      $('#sh-ticket', el).innerHTML = '<b><small>#2</small>Show a goodbye message</b>'
        + '<span class="sh-kv">Status <span class="sh-pill' + (s.merged ? ' done' : '') + '">' + (s.merged ? 'Done' : 'In review') + '</span></span>'
        + '<span class="sh-kv">Shipped <span class="sh-pill' + (s.shipped ? ' on' : '') + '" id="sh-shipped">' + (s.merged ? SHIPPED[s.shipped] : '—') + '</span></span>';
      const env = (i) => {
        const st = s.failed === i ? 'fail' : s.shipped > i ? 'done' : ne === i && !blocked() ? 'cur' : '';
        const dot = st === 'fail' ? 'fail' : st === 'done' ? 'pass' : st === 'cur' ? 'pend' : '';
        const sub = st === 'fail' ? 'Deploy failed' : st === 'done' ? (i === 1 && rel ? 'Deployed, tag v' + VERSION + ' created' : 'Deployed') : st === 'cur' ? 'Next to deploy' : 'Waiting';
        return '<li><div class="sh-node env ' + st + '"><span class="dot ' + dot + '"></span><b>' + ENVS[i] + '</b><span class="muted">' + sub + '</span></div></li>';
      };
      const node = (st, title, sub, actor, extra = '') => '<div class="sh-node ' + st + '"><span class="dot ' + ({ done: 'pass', cur: 'pend', fail: 'fail' }[st] || '') + '"></span><b>' + title + '</b>'
        + '<span class="actor ' + actor[0] + '">' + actor[1] + '</span>' + (sub ? '<span class="muted">' + sub + '</span>' : '') + extra + '</div>';
      const atRel = s.merged && s.shipped === 1 && !s.failed;
      const relFailed = rel && s.failed === 1;
      const track = $('#sh-track', el);
      track.classList.toggle('rel', rel);
      track.innerHTML = '<li>' + node(s.merged ? 'done' : 'cur', 'Merge to trunk', s.merged ? 'merged gate: Done, Not shipped' : '', ['ci', 'CI']) + '</li>'
        + env(0)
        + (rel ? '<li><div class="sh-rel" role="group" aria-label="Release line"><small>Release line, before production</small>'
          + node(s.rel >= 1 ? 'done' : atRel ? 'cur' : '', 'Release request', s.rel >= 1 ? 'Backlog ticket, label release' : 'You open it; a P0 fix on staging opens one by itself', ['you', 'you'],
            atRel && s.rel === 0 ? '<button class="btn" type="button" id="sh-request">Open release request</button>' : '')
          + node(s.rel >= 1 ? 'done' : '', 'release skill', 'Picks the commit and the version' + (s.rel >= 1 ? ': v' + VERSION : ''), ['agent', 'agent'])
          + node(s.rel >= 2 ? 'done' : atRel && s.rel === 1 ? 'cur' : '', 'Product owner approves', 'Agents never approve the last environment', ['you', 'you'],
            (s.rel >= 2 ? '' : '<button class="btn primary" type="button" id="sh-approve"' + (atRel && s.rel === 1 ? '' : ' disabled') + '>Approve</button>'))
          + node(relFailed ? 'fail' : s.rel >= 2 ? 'done' : '', 'Release line cut', relFailed ? 'Failed: left as it is' : 'release/v' + VERSION, ['ci', 'CI'])
          + '</div></li>' : '')
        + env(1);
      $('#sh-merge', el).disabled = s.merged;
      $('#sh-deploy', el).disabled = ne < 0 || blocked();
      $('#sh-fail', el).disabled = ne < 0 || blocked();
      $('#sh-next', el).textContent = !s.merged ? 'Next: merge the change request.'
        : s.failed === 1 ? 'Next: the Signal waits on hold for you; after an owner replies, triage-signal turns it into a new ticket with a regression case. Reset to start over.'
        : s.failed === 0 ? 'Next: the Signal is not held; triage-signal turns it into a new ticket with a regression case in the next cycle. Reset to start over.'
        : ne < 0 ? 'Shipped to every environment.'
        : blocked() ? (s.rel === 0 ? 'Next: production ships only from a release line. Open a release request.' : 'Next: the Product owner approves the release.')
        : 'Next: deploy ' + ENVS[ne] + '.';
      $('#sh-sig', el).innerHTML = s.failed === null ? '' : '<div class="sh-card"><b>New Signal: deploy to ' + ENVS[s.failed] + ' failed</b><div class="sh-tags"><span class="tag">signal:deploy</span><span class="tag">env:' + ENVS[s.failed] + '</span>'
        + (s.failed === 1 ? '<span class="tag hold">needs-human</span>' : '') + '</div><span class="muted" style="font-size:13px">Evidence attached.' + (s.failed === 1 ? ' A production failure also gets needs-human.' : ' Only a production failure also gets needs-human.') + '</span></div>'
        + '<div class="callout warn">The original ticket stays Done: a failure never reopens it.' + (rel && s.failed === 1 ? ' A failed release line is left as it is; the fix ships under the next version.' : '') + '</div>';
      $('#sh-log', el).innerHTML = s.log.map(([a, k, t, bad]) => '<li' + (bad ? ' class="sh-bad"' : '') + '><span class="actor ' + k + '">' + a + '</span><span>' + esc(t) + '</span></li>').join('');
      const lg = $('#sh-log', el); lg.scrollTop = lg.scrollHeight;
    }
    // Redraw replaces the buttons, so keyboard focus is put back on the control that had it (or the next useful one).
    function act(fn) {
      const id = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
      fn(); draw();
      const back = id && el.querySelector('#' + id);
      (back && !back.disabled ? back : [...el.querySelectorAll('.sh-btns .btn, .sh-node .btn')].find((b) => !b.disabled))?.focus({ preventScroll: true });
    }
    el.addEventListener('change', (e) => { if (e.target.name === 'sh-mode') { s.mode = e.target.value; reset(); draw(); } });
    el.addEventListener('click', (e) => {
      const id = e.target.closest('button')?.id;
      if (id === 'sh-merge') act(() => { s.merged = true; log('CI', 'ci', 'Merged to trunk. The merged gate sets #2 to Done, Shipped: Not shipped.'); });
      if (id === 'sh-deploy') act(() => {
        const i = nextEnv(); s.shipped = i + 1;
        log('CI', 'ci', 'Deploy ' + ENVS[i] + ' reports success to the shipped gate: #2 is ' + SHIPPED[i + 1] + (i === 1 && s.mode === 'release' ? ', tag v' + VERSION + ' created.' : '.'));
      });
      if (id === 'sh-request') act(() => {
        s.rel = 1;
        log('you', 'you', 'You open a release request: a Backlog ticket labelled release.');
        log('agent', 'agent', 'The release skill picks the commit and the version: v' + VERSION + '.');
      });
      if (id === 'sh-approve') act(() => {
        s.rel = 2;
        log('you', 'you', 'The Product owner approves the release workflow run.');
        log('CI', 'ci', 'The release line release/v' + VERSION + ' is cut.');
      });
      if (id === 'sh-fail') act(() => {
        const i = nextEnv(); s.failed = i;
        log('CI', 'ci', 'Deploy ' + ENVS[i] + ' fails. #2 stays at the last good environment: ' + SHIPPED[s.shipped] + '.', true);
        log('CI', 'ci', 'One new Signal opens: signal:deploy, env:' + ENVS[i] + (i === 1 ? ', needs-human' : '') + '.', true);
      });
      if (id === 'sh-reset') act(reset);
    });
    reset(); draw();
  };
}

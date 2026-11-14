/* ---------- One cycle: claim, read, triage, route, chain, heartbeat ---------- */
VIZ.cycle = function cycle(el) {
  addStyle('cycle', `
.cy > *, .cy-cmds > * { min-width: 0; }
.cy-bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
.cy-bar > b { font-size: 13px; }
.cy-bind { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; color: var(--muted); align-items: center; }
.cy-phases { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
.cy-phases button { width: 100%; height: 100%; display: grid; gap: 2px; align-content: start; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
  padding: 8px 10px; border-radius: 8px; border: 1px solid var(--rule); border-top: 4px solid var(--rule); background: var(--sheet); transition: background .2s, border-color .2s; }
.cy-phases button:hover { border-color: var(--accent); }
.cy-phases b { font-size: 14px; display: flex; gap: 6px; align-items: baseline; }
.cy-phases b i { font: 500 12px var(--mono); font-style: normal; color: var(--muted); }
.cy-phases small { font-size: 12px; color: var(--muted); line-height: 1.35; }
.cy-phases .done button { border-top-color: var(--idle); }
.cy-phases .now button { border-color: var(--accent); border-top-color: var(--accent); background: var(--accent-soft); }
.cy-phases .stop button { border-top-color: var(--fail); background: var(--fail-soft); }
.cy-phases .off button { opacity: .5; }
.cy-phases .off small::after { content: " · not run"; }
.cy-clock { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
.cy-track { position: relative; height: 8px; border-radius: 4px; background: var(--well); overflow: hidden; }
.cy-fill { position: absolute; inset: 0 auto 0 0; background: var(--accent); border-radius: 4px; transition: width .4s ease; }
.cy-fill.over { background: var(--pend); }
.cy-budget { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--fail); left: 75%; }
.cy-clock div:last-child { display: flex; justify-content: space-between; gap: 8px; }
.cy-now { display: grid; gap: 6px; min-height: 3.2em; }
.cy-now p { margin: 0; }
.cy-work { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 14px; align-items: start; }
.cy-board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cy-col { display: grid; gap: 6px; align-content: start; padding: 8px; border-radius: var(--r); background: var(--well); min-width: 0; }
.cy-col > header { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.cy-item { position: relative; display: grid; gap: 4px; padding: 7px 9px; border-radius: 8px; background: var(--sheet); border: 1px solid var(--rule); font-size: 13px; line-height: 1.35; transition: border-color .2s, background .2s; }
.cy-item .cy-id { font: 500 12px var(--mono); color: var(--muted); }
.cy-item .cy-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.cy-item .cy-to { font: 500 12px var(--mono); color: var(--agent); }
.cy-item .cy-n { position: absolute; top: -7px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font: 600 11px/20px var(--mono); text-align: center; }
.cy-item.picked { border-color: var(--agent); background: var(--agent-soft); }
.cy-item.fail { border-color: var(--fail); background: var(--fail-soft); }
.cy-item.fail .cy-to { color: var(--fail); }
.cy-item.wait .cy-to { color: var(--pend); }
.cy-item.flash { animation: cy-flash 1s ease-out; }
@keyframes cy-flash { from { box-shadow: 0 0 0 3px var(--accent); } to { box-shadow: 0 0 0 0 transparent; } }
.cy-order { padding: 12px; border-radius: var(--r); background: var(--well); display: grid; gap: 6px; font-size: 13px; line-height: 1.4; }
.cy-order ol { margin: 0; padding-left: 22px; display: grid; gap: 6px; }
.cy-order h4 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.cy-order li { color: var(--muted); }
.cy-order li::marker { font: 600 12px var(--mono); }
.cy-order li.done { color: var(--ink); }
.cy-order li.now { color: var(--ink); font-weight: 600; }
.cy-order li.now::marker { color: var(--accent); }
.cy-order li.off { text-decoration: line-through; }
.cy-ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.cy-ctl .muted { font-size: 13px; margin-left: auto; }
.cy-hb { border: 1px solid var(--rule); border-radius: var(--r); background: var(--sheet); overflow: hidden; }
.cy-hb > header { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 8px 12px; background: var(--well); font-size: 13px; color: var(--muted); }
.cy-hb > div { padding: 12px; display: grid; gap: 10px; font-size: 14px; min-width: 0; }
.cy-hb .cy-mark { font: 13px var(--mono); color: var(--muted); }
.cy-hb dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 14px; margin: 0; }
.cy-hb dt { color: var(--muted); }
.cy-hb dd { margin: 0; overflow-wrap: anywhere; }
.cy-tw { overflow-x: auto; max-width: 100%; }
.cy-hb table { border-collapse: collapse; width: 100%; font-size: 13px; }
.cy-hb th, .cy-hb td { text-align: left; padding: 5px 12px 5px 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
.cy-hb td:first-child { white-space: nowrap; }
.cy-hb th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
.cy-hb td.cy-bad { color: var(--fail); font-weight: 600; }
.cy-hb .cy-err { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.cy-hb .cy-err li { padding: 6px 10px; border-radius: 8px; background: var(--fail-soft); overflow-wrap: anywhere; }
.cy-hb details summary { cursor: pointer; font-size: 13px; color: var(--muted); }
.cy-hb details pre { margin: 8px 0 0; background: var(--well); padding: 10px 12px; border-radius: 8px; overflow: auto; max-height: 320px; font: 12px/1.5 var(--mono); }
.cy-none { padding: 14px; border: 1px dashed var(--rule); border-radius: var(--r); color: var(--muted); font-size: 14px; }
.cy-cmds { display: grid; gap: 4px; }
.cy-cmds .codeblock { margin: 0; }
.cy-cmds p { margin: 0; font-size: 13px; color: var(--muted); }
@media (max-width: 860px) { .cy-work { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 640px) {
  .cy-hb th, .cy-hb td { padding-right: 8px; }
  .cy-phases { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .cy-phases button { grid-template-columns: 130px minmax(0, 1fr); align-items: baseline; border-top-width: 1px; border-left: 4px solid var(--rule); padding: 6px 10px; }
  .cy-phases .done button { border-left-color: var(--idle); }
  .cy-phases .now button { border-left-color: var(--accent); }
  .cy-phases .stop button { border-left-color: var(--fail); }
  .cy-board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`);

  const PHASES = [['Claim', 'one cycle at a time'], ['Read state', 'board, open CRs, heartbeats'], ['Triage Signals', 'each Signal, in order'],
    ['Route', 'each ticket to its skill'], ['Chain', 'a finished step starts the next'], ['Heartbeat', 'one comment, always']];
  const ORDER = ['Release requests, and P0 fixes ready to release', 'Change requests a person opened', 'Tickets In progress',
    'Ready from the top, at most <code>cycle.max_implementations</code> new', 'Backlog: grooming for no Priority, then shape while fewer than <code>cycle.min_ready</code> are Ready',
    'Change requests that need a review (one identity)'];
  const COLS = ['Signals', 'Backlog', 'Ready', 'In progress', 'In review', 'Done'];
  const TIER = { 'triage-signal': 'fast', release: 'balanced', 'implement-spec': 'balanced', 'backlog-grooming': 'balanced', shape: 'deep', 'review-pr': 'balanced' };
  const BOARD = [
    ['24', 'Signals', 'User report: upload hangs', ['signal:bug']],
    ['20', 'Backlog', 'Release request: v1.4', ['release']],
    ['21', 'Backlog', 'Plan: offline mode', ['no Priority']],
    ['22', 'Backlog', 'Idea: team spaces', ['no Priority']],
    ['23', 'Backlog', 'Export to CSV', ['Priority: Default']],
    ['15', 'Ready', 'Add dark mode', ['top']],
    ['16', 'Ready', 'Search by tag', []],
    ['17', 'Ready', 'Paginate the feed', []],
    ['18', 'Ready', 'Show order history', ['CR #31 by a person']],
    ['12', 'In progress', 'Password reset email', ['rework']],
    ['11', 'In review', 'Rate limit the API', ['draft CR #29']],
    ['14', 'Done', 'Fix: sign-in fails on Safari', ['P0', 'On staging']],
  ];
  const IDLE_BOARD = [
    ['7', 'Backlog', 'Let users export their data', ['needs-human', 'no reply']],
    ['10', 'In review', 'Audit log', ['waits for approval']],
    ['9', 'Done', 'Add a farewell message', ['On production']],
    ['14', 'Done', 'Fix: sign-in fails on Safari', ['P0', 'On production']],
  ];
  const SCEN = [['normal', 'A normal hour'], ['running', 'Another cycle is running'], ['idle', 'Nothing to do'], ['budget', 'Time budget runs out'], ['fail', 'A step fails']];
  const SHA = '4f9c2e1a7d3b5c8e0f6a9b2d4c7e1f3a5b8d0c2e';

  // A scenario is a list of steps. A step: ph (phase index), rank (route order, 1..6), min (minute), say, picks [{ id, skill, to, wait, fail }].
  function plan(sc) {
    const S = [];
    if (sc === 'running') {
      S.push({ ph: 0, min: 0, stop: true, say: '<code>dispatch sdlc --ticket 1</code> prints <code>{ skipped: true }</code>: another cycle holds the claim. This start stops here and writes nothing, so two cycles never claim the same ticket.' });
      return S;
    }
    S.push({ ph: 0, min: 0, say: 'The scheduler starts the cycle. <code>dispatch sdlc --ticket 1</code> claims it; no other cycle is running.' });
    if (sc === 'idle') {
      S.push({ ph: 1, min: 1, say: 'It lists the board once and reads the open CRs, the last heartbeats and <code>ledger summary</code>. Nothing matches a routing row: #7 is held with no owner reply, #10 waits for a person, the rest is Done.' });
      S.push({ ph: 5, min: 2, say: 'Nothing to do: it writes a short heartbeat with <code>runs: []</code> and stops. The heartbeat still proves the factory is alive.' });
      return S;
    }
    S.push({ ph: 1, min: 1, say: 'It lists the board once and reads the open CRs, the last heartbeats and <code>ledger summary</code>. Every decision below comes from this one read.' });
    S.push({ ph: 2, min: 2, say: 'Every Signal is triaged first. triage-signal finds #24 real and wanted, and moves it to Backlog.', picks: [{ id: '24', skill: 'triage-signal', to: 'triage-signal · to Backlog' }] });
    S.push({ ph: 3, rank: 1, min: 3, say: 'Route, in order. First what is ready to release: the release request #20, and #14, a P0 fix that is Done and On staging.', picks: [{ id: '20', skill: 'release', to: 'release' }, { id: '14', skill: 'release', to: 'release · opens the request' }] });
    S.push({ ph: 3, rank: 2, min: 3, say: 'Then hand-offs: #18 has CR #31 that a person opened. implement-spec hands it to review; this does not count against the cap.', picks: [{ id: '18', skill: 'implement-spec', to: 'implement-spec · hand-off' }] });
    S.push({ ph: 3, rank: 3, min: 4, say: 'Then every ticket In progress: #12 was sent back by review, so implement-spec reworks it.', picks: [{ id: '12', skill: 'implement-spec', to: 'implement-spec · rework' }] });
    S.push({ ph: 3, rank: 4, min: 4, say: 'Then Ready from the top. <code>cycle.max_implementations</code> is 1: #15 is claimed, #16 and #17 wait for the next cycle.', picks: [{ id: '15', skill: 'implement-spec', to: 'implement-spec' }, { id: '16', wait: true, to: 'wait: cap' }, { id: '17', wait: true, to: 'wait: cap' }] });
    S.push({ ph: 3, rank: 5, min: 5, say: 'Then Backlog: grooming for #21 and #22, which have no Priority. Only two tickets are still Ready, fewer than <code>cycle.min_ready</code> (3), so shape takes #23.', picks: [{ id: '21', skill: 'backlog-grooming', to: 'backlog-grooming' }, { id: '22', skill: 'backlog-grooming', to: 'backlog-grooming' }, { id: '23', skill: 'shape', to: 'shape' }] });
    S.push({ ph: 3, rank: 6, min: 5, say: 'Last, with one identity, every change request that needs a review: draft CR #29 for #11 goes to review-pr, in a fresh context.', picks: [{ id: '11', skill: 'review-pr', to: 'review-pr' }] });
    if (sc === 'fail') {
      S.push({ ph: 4, min: 27, say: 'implement-spec on #12 fails: its tests do not pass. The failure goes into the heartbeat\'s errors and the cycle goes on; the other runs finish. Nothing that finished matches a further row.', fail: '12' });
      S.push({ ph: 5, min: 39, say: 'It writes the heartbeat with one row per run and the failed step in <code>errors</code>. A step that fails in the last <code>cycle.failure_limit</code> heartbeats on the same trunk commit is held for a person.' });
    } else if (sc === 'budget') {
      S.push({ ph: 4, min: 47, over: true, say: 'The runs take longer today. #12 finishes rework at minute 47, after <code>cycle.time_budget_minutes</code> (45). Its review would be next, but nothing new starts now; the next cycle picks it up.', blocked: true });
      S.push({ ph: 5, min: 50, over: true, say: 'The heartbeat is still written, at minute 50, before the runner job times out at 60. Every run that started is in it.' });
    } else {
      S.push({ ph: 4, min: 28, say: 'A step finished while time is left: #12 is reworked and In review. With one identity, review-pr starts on it in this cycle, under the same caps.', picks: [{ id: '12', skill: 'review-pr', to: 'then review-pr', chain: true }] });
      S.push({ ph: 5, min: 41, say: 'It writes one heartbeat on the heartbeat ticket: when it ran, the trunk commit its skills came from, one row per run and its errors.' });
    }
    return S;
  }

  el.className = 'panel cy';
  el.innerHTML = '<div class="cy-bar"><b id="cy-scen-label">Replay the cycle with</b><div class="seg" role="radiogroup" aria-labelledby="cy-scen-label">'
    + SCEN.map(([v, t], i) => '<label><input type="radio" name="cy-scen" id="cy-scen-' + v + '" value="' + v + '"' + (i ? '' : ' checked') + '><span>' + t + '</span></label>').join('') + '</div></div>'
    + '<div class="cy-bind"><span>Example binding:</span><span class="tag">cycle.max_implementations: 1</span><span class="tag">cycle.min_ready: 3</span><span class="tag">cycle.time_budget_minutes: 45</span><span class="tag">one identity</span></div>'
    + '<ol class="cy-phases" id="cy-phases" aria-label="Phases of one cycle">' + PHASES.map(([n, h], i) => '<li><button type="button" data-ph="' + i + '"><b><i>' + (i + 1) + '</i>' + n + '</b><small>' + h + '</small></button></li>').join('') + '</ol>'
    + '<div class="cy-clock"><div class="cy-track" role="img" id="cy-track"><div class="cy-fill" id="cy-fill"></div><div class="cy-budget" title="time budget: 45 minutes"></div></div><div><span id="cy-min"></span><span>budget 45 · job timeout 60</span></div></div>'
    + '<div class="cy-now" id="cy-now" aria-live="polite"></div>'
    + '<div class="cy-ctl"><button class="btn" type="button" id="cy-back">Back</button><button class="btn primary" type="button" id="cy-next">Next step</button><button class="btn" type="button" id="cy-play">Play</button><span class="muted" id="cy-count"></span></div>'
    + '<div class="cy-work"><div class="cy-board" id="cy-board" aria-label="Board snapshot (example)"></div>'
    + '<div class="cy-order"><h4 id="cy-order-h">Route: the order</h4><ol id="cy-order" aria-labelledby="cy-order-h">' + ORDER.map((t) => '<li>' + t + '</li>').join('') + '</ol></div></div>'
    + '<div id="cy-hb" aria-live="polite"></div>'
    + '<div class="cy-cmds"><p>Read the heartbeats back as the run ledger:</p>'
    + ['npx --no agentic-sdlc ledger summary', 'npx --no agentic-sdlc ledger stale --max-hours 3'].map((c) => '<div class="codeblock"><pre><code>' + esc(c) + '</code></pre><button class="btn copy" type="button">Copy</button></div>').join('')
    + '<p><code>ledger stale</code> is the dead-man check: it fails when no heartbeat arrived in the last 3 hours.</p></div>';

  const board = $('#cy-board', el), now = $('#cy-now', el), hb = $('#cy-hb', el), playBtn = $('#cy-play', el);
  let sc = 'normal', steps = plan(sc), i = 0, timer = null;

  function picksUpTo(n) {
    const out = new Map(), runs = [];
    for (const s of steps.slice(0, n + 1)) {
      for (const p of s.picks || []) {
        const prev = out.get(p.id);
        out.set(p.id, { ...p, rank: s.rank ?? prev?.rank, to: prev && p.chain ? prev.to + ' · ' + p.to : p.to });
        if (!p.wait) runs.push({ skill: p.skill, ticket: '#' + p.id, model: TIER[p.skill] + '-model', outcome: 'done' });
      }
      if (s.fail) { out.get(s.fail).fail = true; runs.find((r) => r.ticket === '#' + s.fail).outcome = 'failed'; }
    }
    return { out, runs };
  }

  function render(flash) {
    const s = steps[i], last = steps[steps.length - 1];
    const { out, runs } = picksUpTo(i);
    el.querySelectorAll('#cy-phases li').forEach((li, k) => {
      const ran = steps.some((x) => x.ph === k);
      li.className = k === s.ph ? (s.stop ? 'stop' : 'now') : !ran ? 'off' : k < s.ph ? 'done' : '';
      const b = li.firstChild; b.disabled = !ran; if (k === s.ph) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    const fill = $('#cy-fill', el); fill.style.width = (Math.max(s.min, 1) / 60 * 100) + '%'; fill.classList.toggle('over', s.min > 45);
    $('#cy-track', el).setAttribute('aria-label', 'Minute ' + s.min + ' of 60; the time budget ends at 45');
    $('#cy-min', el).textContent = 'minute ' + s.min;
    now.innerHTML = '<div><span class="actor ' + (s.ph === 0 && i === 0 && !s.stop ? 'you' : 'agent') + '">' + (s.ph === 0 && i === 0 && !s.stop ? 'scheduler' : 'sdlc cycle') + '</span> <span class="state">' + (s.ph + 1) + ' · ' + PHASES[s.ph][0] + (s.rank ? ' · order ' + s.rank : '') + '</span></div><p>' + s.say + '</p>';
    $('#cy-count', el).textContent = 'Step ' + (i + 1) + ' of ' + steps.length;
    $('#cy-back', el).disabled = i === 0;
    $('#cy-next', el).disabled = i === steps.length - 1;

    const items = sc === 'idle' ? IDLE_BOARD : BOARD;
    const fresh = new Set((flash && s.picks || []).map((p) => p.id));
    board.innerHTML = COLS.map((c) => '<section class="cy-col"><header>' + c + '</header>' + items.filter((x) => x[1] === c).map(([id, , t, tags]) => {
      const p = out.get(id);
      const cls = p ? (p.fail ? 'fail' : p.wait ? 'wait' : 'picked') : '';
      return '<div class="cy-item ' + cls + (fresh.has(id) && !reduced ? ' flash' : '') + '" id="cy-i-' + id + '"><span class="cy-id">#' + id + '</span><span>' + esc(t) + '</span>'
        + (tags.length ? '<span class="cy-tags">' + tags.map((g) => '<span class="tag' + (g === 'needs-human' ? ' hold' : '') + '">' + esc(g) + '</span>').join('') + '</span>' : '')
        + (p ? '<span class="cy-to">' + esc(p.fail ? p.to + ' · failed' : p.to) + '</span>' : '')
        + (p && p.rank && !p.wait ? '<span class="cy-n" aria-label="route order ' + p.rank + '">' + p.rank + '</span>' : '') + '</div>';
    }).join('') + '</section>').join('');

    const routes = steps.filter((x) => x.rank);
    el.querySelectorAll('#cy-order li').forEach((li, k) => {
      const r = k + 1, planned = routes.some((x) => x.rank === r);
      li.className = !planned ? 'off' : s.rank === r ? 'now' : (s.ph > 3 || (s.rank && s.rank > r)) ? 'done' : '';
    });

    if (s.ph !== 5) {
      hb.innerHTML = '<div class="cy-none">' + (last.stop ? 'No heartbeat from this start: it stopped at Claim and wrote nothing. The cycle that holds the claim writes its own.'
        : 'The heartbeat appears when the cycle writes it, in phase 6.') + '</div>';
      return;
    }
    const at = '2026-11-14T10:' + String(s.min).padStart(2, '0') + ':00Z';
    const errors = steps.some((x) => x.fail) ? [{ step: 'implement-spec', id: '12', msg: 'npm test: 2 failing in reset-email.test.ts' }] : [];
    const json = { at, factory: SHA, runs: runs.map((r) => ({ id: at + '-' + r.skill + '-' + r.ticket.slice(1), skill: r.skill, ticket: r.ticket.slice(1), tier: TIER[r.skill], model: r.model, executor: 'harness', outcome: r.outcome, ...(r.outcome === 'failed' ? { error: errors[0].msg } : {}) })), errors };
    hb.innerHTML = '<article class="cy-hb" aria-label="Heartbeat comment"><header><span class="actor agent">factory-bot</span><span>commented on #1 Heartbeat · ' + at.slice(11, 16) + ' UTC</span><span class="tag">owners.bots</span></header><div>'
      + '<span class="cy-mark">' + esc('<!-- heartbeat -->') + '</span>'
      + '<dl><dt>Time</dt><dd>' + at + '</dd><dt>Trunk commit</dt><dd><code>' + SHA.slice(0, 7) + '</code> (the skills it read)</dd></dl>'
      + (runs.length ? '<div class="cy-tw"><table><thead><tr><th>Skill</th><th>Ticket</th><th>Model</th><th>Outcome</th></tr></thead><tbody>'
        + runs.map((r) => '<tr><td>' + r.skill + '</td><td>' + r.ticket + '</td><td><code>' + r.model + '</code></td><td' + (r.outcome === 'done' ? '' : ' class="cy-bad"') + '>' + r.outcome + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div><b>Runs</b>: none (idle cycle)</div>')
      + '<div><b>Errors</b>: ' + (errors.length ? '</div><ul class="cy-err">' + errors.map((e) => '<li><code>' + e.step + '</code> on #' + e.id + ': ' + esc(e.msg) + '</li>').join('') + '</ul>' : 'none</div>')
      + '<details><summary>The comment body as stored</summary><pre>' + esc('<!-- heartbeat -->\n```json\n' + JSON.stringify(json, null, 2) + '\n```') + '</pre></details>'
      + '</div></article>';
  }

  function go(n, flash = true) { i = Math.max(0, Math.min(steps.length - 1, n)); render(flash); }
  function stop() { clearInterval(timer); timer = null; playBtn.textContent = 'Play'; }
  function play() {
    if (timer) return stop();
    if (reduced) return go(steps.length - 1, false);
    if (i === steps.length - 1) go(0);
    playBtn.textContent = 'Pause';
    timer = setInterval(() => { if (!el.isConnected) return stop(); go(i + 1); if (i === steps.length - 1) stop(); }, 1600);
  }
  $('#cy-next', el).onclick = () => { stop(); go(i + 1); };
  $('#cy-back', el).onclick = () => { stop(); go(i - 1); };
  playBtn.onclick = play;
  el.querySelectorAll('#cy-phases button').forEach((b) => (b.onclick = () => { stop(); go(steps.findIndex((x) => x.ph === +b.dataset.ph)); }));
  el.querySelectorAll('input[name="cy-scen"]').forEach((r) => (r.onchange = () => { stop(); sc = r.value; steps = plan(sc); go(0, false); play(); }));
  render(false);
};

/* ---------- Review and merge: swimlanes for one or two identities, Fast or Full lane (chapter 5) ---------- */
{
  const LANES = [
    ['impl', 'build', 'agent'],
    ['ci', 'CI gates', 'ci'],
    ['rev', 'review/review', 'agent'],
    ['you', 'You / a human', 'you'],
    ['gh', 'GitHub', 'world'],
  ];
  const COL = Object.fromEntries(LANES.map(([k], i) => [k, i]));
  const NAME = Object.fromEntries(LANES.map(([k, n]) => [k, n]));
  const KIND = Object.fromEntries(LANES.map(([k, , c]) => [k, c]));

  // Each step: [key, from, to, text, note]. The key stays when only the wording around it stays; a new key or text is a change.
  function steps(ids, lane) {
    const s = [
      ['open', 'impl', 'gh', 'Opens a draft change request'],
      ['run', 'gh', 'ci', 'Runs CI: Required (tests, no secrets), proofs-on-base, ticket-linkage'],
      ['ci-done', 'ci', 'gh', 'Posts Required, proofs-on-base, ticket-linkage'],
      ['read', 'rev', 'gh', 'Reads the diff, the criteria and the CI results', 'It never runs the change\'s code.'],
    ];
    if (ids === 'one') {
      s.push(['post', 'rev', 'gh', 'forge verdict posts the report with Verdict: PASS, and no status, no approval',
        'GitHub refuses an approval from the change\'s author; a cloud session cannot write statuses.']);
      s.push(['ready', 'rev', 'gh', 'forge ready marks the change request ready']);
      s.push(['gate', 'gh', 'ci', 'The review gate reads the report']);
      s.push(['status', 'ci', 'gh', 'Posts review = success']);
    } else {
      s.push(['post', 'rev', 'gh', 'forge verdict posts the report, the review status and an approving review, as the review app']);
      s.push(['ready', 'rev', 'gh', 'forge ready marks the change request ready']);
    }
    if (lane === 'full') {
      s.push(['wait', 'ci', 'gh', 'human-approval waits for a human']);
      s.push(['land', 'rev', 'gh', 'forge land: only human-approval is missing, so it reports who must approve',
        'escalate asks that person and holds the ticket.']);
      s.push(ids === 'one'
        ? ['human', 'you', 'gh', 'A collaborator approves the head, or you merge as admin']
        : ['human', 'you', 'gh', 'A human owner approves the head']);
      s.push(['ha', 'ci', 'gh', 'Posts human-approval = success']);
      s.push(['merge', 'gh', 'gh', 'The next cycle\'s forge land merges: all six checks are green']);
    } else {
      s.push(['ha', 'ci', 'gh', 'human-approval passes with no human']);
      s.push(['land', 'rev', 'gh', 'forge land sees every check green and turns on auto-merge',
        'It waits up to cycle.land_wait_minutes; if a check is still pending, the queue says land next cycle.']);
      s.push(['merge', 'gh', 'gh', 'Auto-merges when all six checks are green']);
    }
    return s;
  }
  function checks(ids, lane) {
    return [
      ['Required', 'CI job, no secrets'],
      ['proofs-on-base', 'CI gate'],
      ['ticket-linkage', 'CI gate'],
      ['review', ids === 'one' ? 'CI review gate, from the report' : 'forge verdict, as the review app'],
      ['human-approval', 'approval gate, ' + (lane === 'full' ? 'after a human approves' : 'no human needed')],
      ['skill-regression', 'CI gate'],
    ];
  }
  const PROVES = {
    one: 'The review is a separate agent context. Your account does everything, so GitHub cannot prove that no agent posted its own review status.',
    two: 'No implementer can post the review status or approve its own change: only the review app holds that token.',
  };

  VIZ.review = function review(el) {
    addStyle('review', `
.rv { container-type: inline-size; display: grid; gap: 14px; }
.rv-ctl { display: flex; flex-wrap: wrap; gap: 12px 24px; }
.rv-ctl fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; min-width: 0; }
.rv-ctl legend { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); padding: 0; margin-bottom: 6px; }
.rv-lanes { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin: 0; padding: 0; list-style: none; }
.rv-lanes li { display: grid; gap: 2px; justify-items: start; min-width: 0; }
.rv-lanes small { font-size: 12px; color: var(--muted); line-height: 1.35; }
.rv-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; counter-reset: rv; }
.rv-step { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 2px 10px; padding: 10px 12px; border-radius: var(--r); background: var(--well); align-items: start; }
.rv-n { grid-row: span 2; width: 24px; height: 24px; border-radius: 50%; background: var(--sheet); border: 1px solid var(--rule); font: 500 12px/22px var(--mono); text-align: center; }
.rv-who { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); }
.rv-who .actor { font-size: 12px; padding: 1px 8px; }
.rv-txt { font-size: 14px; line-height: 1.45; }
.rv-msg { grid-column: 2; }
.rv-msg > .rv-n { display: none; }
.rv-txt small { display: block; color: var(--muted); font-size: 12.5px; margin-top: 2px; }
.rv-new { animation: rv-fade 1.6s ease-out; }
@keyframes rv-fade { from { background-color: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); } }
.rv-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.rv-checks li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0 8px; align-items: center; padding: 8px 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--sheet); }
.rv-checks code { background: none; padding: 0; font-size: 13px; }
.rv-checks .rv-who2 { grid-column: 2; font-size: 12px; color: var(--muted); line-height: 1.35; }
.rv-checks li.rv-new { animation-name: rv-fade2; }
@keyframes rv-fade2 { from { background-color: var(--accent-soft); border-color: var(--accent); } }
.rv-h { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0; }
@container (min-width: 620px) {
  .rv-lanes, .rv-step { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0 8px; }
  .rv-lanes li { justify-items: center; text-align: center; }
  .rv-lanes .actor { white-space: normal; text-align: center; justify-content: center; }
  .rv-steps { gap: 0; padding-block: 4px; background-image: ${LANES.map(() => 'linear-gradient(var(--rule), var(--rule))').join(', ')};
    background-size: 1px 100%; background-repeat: no-repeat; background-position: ${LANES.map((_, i) => (10 + i * 20) + '% 0').join(', ')}; }
  .rv-step { background: none; padding: 4px 0; border-radius: 0; }
  .rv-step > .rv-n, .rv-step > .rv-who { display: none; }
  .rv-msg { grid-column: var(--c); position: relative; padding: 2px 4px 14px; text-align: center; }
  .rv-msg::before { content: ""; position: absolute; left: calc(50% / var(--n)); right: calc(50% / var(--n)); bottom: 6px; border-top: 2px solid var(--muted); }
  .rv-msg::after { content: ""; position: absolute; bottom: 2px; border: 5px solid transparent; }
  .rv-msg.rv-r::after { right: calc(50% / var(--n) - 2px); border-left: 8px solid var(--muted); border-right: 0; }
  .rv-msg.rv-l::after { left: calc(50% / var(--n) - 2px); border-right: 8px solid var(--muted); border-left: 0; }
  .rv-msg.rv-self { background: var(--world-soft); border-radius: 8px; padding: 6px 8px; margin: 4px 0; }
  .rv-msg.rv-self::before, .rv-msg.rv-self::after { display: none; }
  .rv-msg .rv-n { display: inline-block; vertical-align: 1px; margin-right: 6px; width: 20px; height: 20px; line-height: 18px; font-size: 11px; }
  .rv-step.rv-new { animation: none; }
  .rv-step.rv-new .rv-msg { animation: rv-fade 1.6s ease-out; border-radius: 6px; }
}
`);
    el.className = 'panel';
    const radio = (name, v, t, on) => '<label><input type="radio" id="rv-' + name + '-' + v + '" name="rv-' + name + '" value="' + v + '"' + (on ? ' checked' : '') + '><span>' + t + '</span></label>';
    el.innerHTML = '<div class="rv">'
      + '<form class="rv-ctl" id="rv-ctl"><fieldset><legend>Identities</legend><div class="seg">' + radio('ids', 'one', 'One', true) + radio('ids', 'two', 'Two') + '</div></fieldset>'
      + '<fieldset><legend>Lane</legend><div class="seg">' + radio('lane', 'fast', 'Fast', true) + radio('lane', 'full', 'Full') + '</div></fieldset></form>'
      + '<ul class="rv-lanes" id="rv-lanes" aria-label="Lanes"></ul>'
      + '<ol class="rv-steps" id="rv-steps"></ol>'
      + '<div class="callout rule" id="rv-proves" aria-live="polite"></div>'
      + '<p class="rv-h">The six required checks, and who posts each</p><ul class="rv-checks" id="rv-checks"></ul>'
      + '</div>';
    const form = $('#rv-ctl', el);
    let prevSteps = null, prevChecks = null;
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('change', draw);
    function draw() {
      const ids = form.elements['rv-ids'].value, lane = form.elements['rv-lane'].value;
      $('#rv-lanes', el).innerHTML = LANES.map(([k, n, c]) => '<li><span class="actor ' + c + '">' + esc(n) + '</span>'
        + (k === 'rev' ? '<small>' + (ids === 'one' ? 'in the cycle' : 'separate review run, holds the review token') + '</small>' : '') + '</li>').join('');
      const list = steps(ids, lane);
      $('#rv-steps', el).innerHTML = list.map(([key, from, to, text, note], i) => {
        const a = COL[from], b = COL[to], lo = Math.min(a, b), hi = Math.max(a, b), self = a === b;
        const start = self ? 4 : lo + 1, end = self ? 6 : hi + 2;
        const isNew = prevSteps && prevSteps.get(key) !== text + note;
        return '<li class="rv-step' + (isNew && !reduced ? ' rv-new' : '') + '"><span class="rv-n" aria-hidden="true">' + (i + 1) + '</span>'
          + '<span class="rv-who"><span class="actor ' + KIND[from] + '">' + esc(NAME[from]) + '</span>' + (self ? '' : '<span aria-hidden="true">→</span><span class="actor ' + KIND[to] + '">' + esc(NAME[to]) + '</span>') + '</span>'
          + '<div class="rv-txt rv-msg ' + (self ? 'rv-self' : a < b ? 'rv-r' : 'rv-l') + '" style="--c:' + start + ' / ' + end + ';--n:' + (end - start) + '">'
          + '<span class="rv-n" aria-hidden="true">' + (i + 1) + '</span>'
          + '<span class="rv-sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">' + esc(NAME[from]) + (self ? '' : ' to ' + esc(NAME[to])) + ': </span>'
          + esc(text) + (note ? '<small>' + esc(note) + '</small>' : '') + '</div></li>';
      }).join('');
      prevSteps = new Map(list.map(([key, , , text, note]) => [key, text + note]));
      $('#rv-proves', el).innerHTML = '<b>What this proves.</b> ' + esc(PROVES[ids]);
      const cs = checks(ids, lane);
      $('#rv-checks', el).innerHTML = cs.map(([n, who]) => '<li class="' + (prevChecks && prevChecks.get(n) !== who && !reduced ? 'rv-new' : '') + '"><span class="dot pass"></span><code>' + esc(n) + '</code><span class="rv-who2">' + esc(who) + '</span></li>').join('');
      prevChecks = new Map(cs);
    }
    draw();
  };
}

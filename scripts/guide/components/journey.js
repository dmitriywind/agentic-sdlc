/* ---------- A ticket's journey: one ticket, six scenarios you step through ---------- */
// The facts come from docs/guide/2-a-ticket.md, 3-your-part.md, 5-review-and-merge.md and 6-shipping.md; the times are an example.
{
const COLS = ['Signals', 'Backlog', 'Ready', 'In progress', 'In review', 'Done'];
const CHECKS = ['Required', 'proofs-on-base', 'ticket-linkage', 'review', 'human-approval', 'skill-regression'];
const C = {
  run: ['pend', 'running'],
  req: ['pass', 'pass · commands.verify, no secrets'],
  red: ['fail', 'fail · a test is red on the new head'],
  proof: ['pass', 'pass · the new test fails on the old code'],
  link: ['pass', 'pass · closes one open ticket, #2'],
  revWait: ['pend', 'pending · waits for the review report'],
  revNew: ['pend', 'pending · needs a report on the new head'],
  revPass: ['pass', 'pass · built by CI from the report'],
  revFail: ['fail', 'fail · Verdict REMEDIATION REQUIRED'],
  fast: ['pass', 'pass · no human needed in the Fast lane'],
  humWait: ['pend', 'pending · waits for a human'],
  humPass: ['pass', 'pass · a person approved this head'],
  skill: ['pass', 'pass · only checks factory changes'],
};
const allRun = Object.fromEntries(CHECKS.map((c) => [c, C.run]));
const green = (human) => ({ Required: C.req, 'proofs-on-base': C.proof, 'ticket-linkage': C.link, review: C.revWait, 'human-approval': human, 'skill-regression': C.skill });
const CRIT = [
  ['Signing out shows “Goodbye, see you soon.”', 'test'],
  ['With a known first name it says “Goodbye, Ada.”; with none, just “Goodbye.”', 'test'],
  ['The message reads well in the light and the dark theme.', 'visual'],
];
const COMMITS = [['a41c9e2', 'test: goodbye on sign-out', 'fails on the old code'], ['7d03b51', 'feat: show the goodbye message', 'makes it pass']];

// Steps shared by the scenarios. A step: t (clock tick), who (actor chips), label (step chip), col (ticket status),
// focus (column to light, when not the ticket's), add (tags, only ever added), ck (check patches), commit, set (other state), art, say.
const signal = () => ({ t: 'Any time', who: [['world', 'A user']], label: 'Signal', col: 'Signals', add: ['signal:feedback'], art: 'signal',
  say: 'A user asks for a goodbye message when they sign out. The request lands on the board as a Signal labelled signal:feedback.' });
const triage = (t) => ({ t, who: [['agent', 'triage-signal']], label: 'Triage', col: 'Backlog', add: ['feature', 'Default'], art: 'triage',
  say: 'triage-signal reads the signal as data: it is real and wanted. It accepts it into Backlog as a feature with Priority Default.' });
const shape = (t) => ({ t, who: [['agent', 'shape']], label: 'Shape', col: 'Ready', add: ['XS', 'Fast'], art: 'shape',
  say: 'shape writes three acceptance criteria, each with the proof that will show it done, and sets Size XS and Lane Fast. The ticket is Ready.' });
const build = (t) => ({ t, who: [['agent', 'implement-spec']], label: 'Build', col: 'In progress', commit: COMMITS, art: 'branch',
  say: 'implement-spec claims the ticket and starts a change line named after it. It commits the failing test first, then the code.' });
const draft = (t) => ({ t, who: [['agent', 'implement-spec']], label: 'Draft CR', col: 'In review', ck: allRun, set: { cr: 'draft' }, art: 'cr',
  say: 'It opens draft change request #3 and moves the ticket to In review. CI starts on the new head.' });
const ci = (human = C.fast) => ({ t: 'CI', who: [['ci', 'CI gates']], label: 'CI', ck: green(human), art: 'cr',
  say: 'Required runs the tests with no secrets: green. The new test fails on the old code, so it proves the change. The change closes one open ticket. review waits for a report.' });
const review = (t) => ({ t, who: [['agent', 'review-pr']], label: 'Review', set: { verdict: 'PASS', finding: null }, art: 'review',
  say: 'review-pr starts in a fresh context. It grades each criterion against the diff and the CI results, without running the code: Verdict PASS.' });
const ready = (t) => ({ t, who: [['agent', 'review-pr']], label: 'Ready', set: { cr: 'ready' }, art: 'cr',
  say: 'review-pr marks the change ready and asks the forge to merge it once all six checks are green.' });
const merge = () => ({ t: 'CI', who: [['ci', 'CI gates']], label: 'Merge', ck: { review: C.revPass }, set: { cr: 'merged' }, art: 'cr',
  say: 'With one identity nothing may approve its own change, so CI turns the report into the review status. All six checks are green: the change merges.' });
const done = () => ({ t: 'CI', who: [['ci', 'merged gate']], label: 'Done', col: 'Done', set: { shipped: 'Not shipped' }, art: 'ticket',
  say: 'The merged gate moves the ticket to Done and sets Shipped to Not shipped. Done is final.' });
const staging = () => ({ t: 'Deploy', who: [['world', 'staging deploy'], ['ci', 'shipped gate']], label: 'Staging', set: { shipped: 'On staging' }, art: 'ticket',
  say: 'The staging deploy job reports to the shipped gate, which sets Shipped to On staging.' });
const prod = () => ({ t: 'Deploy', who: [['world', 'production deploy'], ['ci', 'shipped gate']], label: 'Production', set: { shipped: 'On production' }, art: 'ticket',
  say: 'The production deploy reports too: Shipped becomes On production. The ticket’s journey is over.' });
const c1 = 'Cycle 1 · 09:00', c2 = 'Cycle 2 · 10:00', c3 = 'Cycle 3 · 11:00', c4 = 'Cycle 4 · 12:00';
const upToCi = () => [signal(), triage(c1), shape(c1), build(c1), draft(c1), ci()];

const SCENARIOS = [
  ['happy', 'Happy path', [...upToCi(), review(c2), ready(c2), merge(), done(), staging(), prod()]],
  ['bug', 'Review finds a bug', [...upToCi(),
    { ...review(c2), set: { verdict: 'REMEDIATION REQUIRED', finding: 'Criterion 2 not met: with no name the message reads “Goodbye, undefined.”' }, ck: { review: C.revFail },
      say: 'review-pr grades the criteria against the diff and CI: criterion 2 is not met. Verdict REMEDIATION REQUIRED, with one finding.' },
    { t: c2, who: [['agent', 'review-pr']], label: 'Back', col: 'In progress', art: 'review',
      say: 'review-pr sends the ticket back to In progress with the finding. The change request stays a draft; nothing merges.' },
    { t: c2, who: [['agent', 'implement-spec']], label: 'Fix', col: 'In review', commit: [['c95e017', 'fix: no name, no comma', 'answers the finding']], art: 'branch',
      say: 'implement-spec reads the finding, fixes it on the same branch and pushes. The ticket returns to In review.' },
    { ...ci(), ck: { ...green(C.fast), review: C.revNew }, label: 'CI again',
      say: 'CI runs again on the new head: Required, proofs-on-base and ticket-linkage are green again. The old verdict does not count for a new head.' },
    { ...review(c3), set: { verdict: 'PASS', finding: null, cr: 'ready' }, say: 'review-pr grades the new head in a fresh context: every criterion is DONE, Verdict PASS. It marks the change ready.' },
    merge(), done()]],
  ['red', 'Red CI', [...upToCi(), review(c2), ready(c2),
    { t: 'CI', who: [['ci', 'CI gates']], label: 'Red', ck: { Required: C.red, review: C.revNew }, art: 'cr',
      say: 'The trunk moved, so the change is synced and CI runs on the new head. The review status does not carry over to a new head. Required goes red: a test fails. A red required check blocks the merge.' },
    { t: c3, who: [['agent', 'review-pr']], label: 'Back to draft', col: 'In progress', set: { cr: 'draft' }, art: 'cr',
      say: 'review-pr moves the change request back to draft. The cause is in the code, so the ticket goes to In progress. A cause outside the code would become a new Signal instead.' },
    { t: c3, who: [['agent', 'implement-spec']], label: 'Fix', col: 'In review', commit: [['e2b7f40', 'fix: goodbye after the trunk sync', 'makes Required green']], art: 'branch',
      say: 'implement-spec fixes the test failure on the same branch and pushes. The ticket returns to In review.' },
    { ...ci(), ck: { ...green(C.fast), review: C.revNew }, label: 'CI again', say: 'CI runs on the new head: every check is green again, and review needs a report on this head.' },
    { ...review(c4), set: { verdict: 'PASS', finding: null, cr: 'ready' }, say: 'review-pr grades the new head in a fresh context: Verdict PASS. It marks the change ready again.' },
    merge(), done()]],
  ['hold', 'Needs a human', [signal(), triage(c1),
    { t: c1, who: [['agent', 'shape'], ['agent', 'escalate-to-human']], label: 'Hold', set: { hold: true }, art: 'hold',
      say: 'shape is not sure it may decide criterion 2: may the goodbye show the user’s name? escalate-to-human finds no source that settles it, adds needs-human and posts one comment. The status stays Backlog.' },
    { t: c2, who: [['agent', 'sdlc']], label: 'Skipped', skip: true, art: 'hold', cap: 'Cycle 2: the cycle reads the board and skips every ticket that carries needs-human.',
      say: 'The next cycle reads the board, sees needs-human and skips the ticket. Other work goes on.' },
    { t: 'Any time', who: [['you', 'You']], label: 'You reply', set: { reply: true }, art: 'hold',
      say: 'You reply in a comment: first name only. Your reply counts because you are in owners. You need no label rights.' },
    { t: c3, who: [['agent', 'sdlc']], label: 'Unhold', set: { hold: false }, art: 'hold',
      say: 'The next cycle sees your trusted reply and removes needs-human. The hold is over.' },
    { ...shape(c3), say: 'shape continues with your ruling in criterion 2 and sets Size XS and Lane Fast. The ticket is Ready; from here it runs as in the happy path.' }]],
  ['full', 'Full lane', [signal(), triage(c1),
    { ...shape(c1), add: ['XS', 'Full'], set: { lane: 'Full', spec: true },
      say: 'Sign-out lives under auth/, a path listed in paths.lane_areas, so shape sets Lane Full and writes a spec next to the three criteria. Size XS.' },
    build(c1), { ...draft(c1), set: { cr: 'draft', cls: 'product-full' } },
    { ...ci(C.humWait), say: 'Required, proofs-on-base and ticket-linkage pass. human-approval waits: a product-full change needs a person.' },
    { ...review(c2), set: { verdict: 'PASS', finding: null, cr: 'ready' }, say: 'review-pr grades each criterion in a fresh context: Verdict PASS. It marks the change ready.' },
    { t: 'CI', who: [['ci', 'CI gates']], label: 'Waits', ck: { review: C.revPass }, art: 'cr',
      say: 'CI turns the report into the review status. Five checks are green; human-approval still waits, so nothing merges.' },
    { t: 'Any time', who: [['you', 'A collaborator']], label: 'Approve', art: 'cr',
      say: 'A collaborator approves the head (with one identity you cannot approve your own change; an admin merge is the fallback).' },
    { t: 'CI', who: [['ci', 'CI gates']], label: 'Merge', ck: { 'human-approval': C.humPass }, set: { cr: 'merged' }, art: 'cr',
      say: 'human-approval finds the collaborator’s approval on this head and passes. All six checks are green: the change merges.' },
    done()]],
  ['deploy', 'Deploy fails', [...upToCi(), review(c2), ready(c2), merge(), done(), staging(),
    { t: 'Deploy', who: [['world', 'production deploy'], ['ci', 'shipped gate']], label: 'Deploy fails', focus: 'Signals', set: { shipped: 'On staging', sig2: true }, art: 'signal2',
      say: 'The production deploy fails. The shipped gate keeps Shipped at the last good environment, On staging, and opens Signal #4 with the evidence and needs-human. Ticket #2 stays Done: a later failure never reopens it. #4 waits on hold for you; after an owner replies, triage-signal turns it into a new ticket with a regression case.' }]],
];

function stateAt(steps, i) {
  const s = { col: 'Signals', tags: [], hold: false, cr: null, cls: 'product-fast', lane: 'Fast', spec: false, ck: {}, commits: [], verdict: null, finding: null, shipped: null, reply: false, sig2: false };
  for (const st of steps.slice(0, i + 1)) {
    if (st.col) s.col = st.col;
    for (const t of st.add ?? []) if (!s.tags.includes(t)) s.tags.push(t);
    if (st.commit) s.commits = [...s.commits, ...st.commit];
    if (st.ck) s.ck = { ...s.ck, ...st.ck };
    Object.assign(s, st.set);
  }
  return s;
}
// Consecutive steps with the same tick share one tick on the clock; its caption names what runs there.
function ticks(steps) {
  const segs = [];
  steps.forEach((st, k) => { if (!segs.length || segs.at(-1).t !== st.t) segs.push({ t: st.t, steps: [] }); segs.at(-1).steps.push(st); st.seg = segs.length - 1; });
  for (const g of segs) {
    const name = g.t.split(' · ')[0], kind = g.steps[0].who[0][0];
    const skills = [...new Set(g.steps.flatMap((st) => st.who.filter((w) => w[0] === 'agent').map((w) => w[1])))];
    g.cap = g.steps.find((st) => st.cap)?.cap
      ?? (name.startsWith('Cycle') ? name + ': ' + skills.join(', then ') + (skills.length > 1 ? ': a finished step starts the next one while time is left.' : '. The scheduler starts one cycle at a time, for example every hour.')
      : g.t === 'CI' ? 'CI: runs on the forge on every push and every status change, between cycles. No agent runs it.'
      : g.t === 'Deploy' ? 'Deploy: your deploy jobs run after the merge and report each environment to the shipped gate.'
      : kind === 'you' ? 'Any time: you answer when you like; the next cycle reads your reply.'
      : 'Any time: input arrives on its own and waits on the board for the next cycle.');
  }
  return segs;
}

const tags = (list) => list.map((t) => '<span class="tag' + (t === 'needs-human' ? ' hold' : '') + '">' + esc(t) + '</span>').join('');
const comment = (by, body, you) => '<div class="jr-cm"><span class="jr-by"><i class="' + (you ? 'you' : '') + '"></i>' + by + '</span><div>' + body + '</div></div>';
const head = (kind, title) => '<div class="jr-ah"><span class="jr-kind">' + kind + '</span><b>' + title + '</b></div>';
const ART = {
  signal: (s) => head('Issue #2 · a Signal', 'Show a goodbye message')
    + comment('a user', 'When I sign out, the page just goes blank. Could it say goodbye?') + '<div class="jr-tags">' + tags(['signal:feedback']) + '</div>',
  triage: () => head('Comment on #2', 'Triage decision') + comment('factory bot · triage-signal', '<b>Accepted:</b> real and wanted. Label <code>feature</code>, Priority <code>Default</code>.'),
  shape: (s) => head('Comment on #2', 'Acceptance criteria') + comment('factory bot · shape', '<ol class="jr-crit">' + CRIT.map(([c, p]) =>
    '<li><span>' + esc(c) + '</span><span class="tag jr-proof">proof: ' + p + '</span></li>').join('') + '</ol>')
    + '<div class="jr-kv"><span>Size <b>XS</b></span><span>Lane <b>' + s.lane + '</b></span>' + (s.spec ? '<span>Spec <b>written</b> · touches <code>auth/</code></span>' : '') + '</div>',
  hold: (s) => head('Comment on #2', 'Needs human')
    + comment('factory bot · escalate-to-human', '<span class="tag hold">Needs human</span> Criterion 2 needs a product ruling: may the goodbye show the user’s first name on a shared screen? Reply here; every skill skips #2 until then.')
    + (s.reply ? comment('you · owner', 'Yes, first name only.', true) : '<p class="muted jr-p">No reply yet. The ticket waits in Backlog.</p>')
    + (s.reply && !s.hold ? '<p class="muted jr-p">The cycle removed <code>needs-human</code>.</p>' : ''),
  branch: (s) => head('Change line', '<code>feature/2-show-goodbye-message</code>') + '<ol class="jr-commits">' + s.commits.map(([h, m, n]) =>
    '<li><code>' + h + '</code><span>' + esc(m) + '</span><small class="muted">' + esc(n) + '</small></li>').join('') + '</ol>'
    + '<p class="muted jr-p">The proof comes first: the test is committed before the code that makes it pass.</p>',
  cr: (s) => head('Change request #3', 'Show a goodbye message') + '<div class="jr-kv"><span class="tag">' + s.cls + '</span><span class="jr-st ' + s.cr + '">' + s.cr + '</span><span class="muted">closes #2</span></div>'
    + '<ul class="jr-checks">' + CHECKS.map((c) => { const [st, txt] = s.ck[c] ?? ['na', 'not run']; return '<li><span class="dot ' + st + '"></span><code>' + c + '</code><small>' + esc(txt) + '</small></li>'; }).join('') + '</ul>',
  review: (s) => head('Comment on CR #3', 'Review report') + comment('factory bot · review-pr', '<ul class="jr-rows">' + CRIT.map(([c], k) => {
    const bad = s.finding && k === 1; return '<li><span>' + (k + 1) + '. ' + esc(c) + '</span><b class="' + (bad ? 'jr-bad' : 'jr-ok') + '">' + (bad ? 'NOT MET' : 'DONE') + '</b></li>'; }).join('') + '</ul>'
    + '<p class="jr-verdict ' + (s.finding ? 'jr-bad' : 'jr-ok') + '">Verdict: ' + s.verdict + '</p>' + (s.finding ? '<p class="jr-find">' + esc(s.finding) + '</p>' : '')),
  ticket: (s) => head('Ticket #2', 'Fields') + '<dl class="jr-fields"><dt>Status</dt><dd>' + s.col + '</dd><dt>Lane</dt><dd>' + s.lane + '</dd><dt>Change request</dt><dd>#3 · ' + s.cr + '</dd><dt>Shipped</dt><dd><b>' + esc(s.shipped ?? '—') + '</b></dd></dl>',
  signal2: (s) => head('Issue #4 · a new Signal', 'Production deploy failed') + comment('factory bot · shipped gate', 'The production deploy of the merge of #3 failed its health check on <code>/signout</code> (HTTP 500). Ticket #2 is back at its last good environment: On staging. Evidence: the deploy run log.')
    + '<div class="jr-tags">' + tags(['signal:deploy', 'env:production', 'needs-human']) + '</div><p class="muted jr-p">Ticket #2 stays Done. It waits on hold for you; after an owner replies, triage-signal turns #4 into a new ticket with a regression case.</p>',
};

addStyle('journey', `
.jr { container-type: inline-size; }
.jr-top { display: grid; gap: 10px; }
.jr-ctl { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.jr-ctl .btn { min-width: 76px; }
.jr-hint { margin-left: auto; font-size: 13px; color: var(--muted); white-space: nowrap; }
.jr-steps { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.jr-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--rule); background: var(--sheet); color: var(--muted); font: 500 13px var(--font); cursor: pointer; }
.jr-chip b { font: 500 12px var(--mono); }
.jr-chip:hover { border-color: var(--accent); }
.jr-chip.done { background: var(--accent-soft); color: var(--ink); border-color: transparent; }
.jr-chip[aria-current="step"] { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.jr-clock { display: grid; gap: 6px; padding: 10px 12px; border-radius: var(--r); background: var(--well); }
.jr-clockh { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
.jr-clockh i { font-style: normal; text-transform: none; letter-spacing: 0; font-weight: 400; }
.jr-ticks { display: flex; flex-wrap: wrap; gap: 4px 2px; align-items: center; list-style: none; margin: 0; padding: 0; }
.jr-ticks li { display: inline-flex; align-items: center; gap: 2px; }
.jr-ticks li + li::before { content: ""; width: 10px; height: 1px; background: var(--idle); margin-right: 2px; }
.jr-tick { font: 500 12px var(--mono); padding: 3px 9px; border-radius: 999px; border: 1px solid var(--rule); color: var(--muted); background: var(--sheet); white-space: nowrap; }
.jr-tick.past { color: var(--ink); }
.jr-tick.on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.jr-cap { margin: 0; font-size: 14px; min-height: 2.9em; }
.jr-board { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
.jr-col { display: grid; grid-template-rows: auto 1fr; gap: 6px; min-width: 0; padding: 8px 6px; border-radius: var(--r); background: var(--well); transition: background .25s; }
.jr-col h4 { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; line-height: 1.3; overflow-wrap: anywhere; }
.jr-col.on { background: var(--accent-soft); }
.jr-col.on h4 { color: var(--ink); }
.jr-cell { display: grid; align-content: start; gap: 6px; min-height: 150px; min-width: 0; }
.jr-card { display: grid; gap: 4px; min-width: 0; padding: 8px; border-radius: 8px; background: var(--sheet); border: 1px solid var(--rule); box-shadow: 0 1px 2px rgba(0,0,0,.06); font-size: 13px; line-height: 1.35; transition: opacity .25s; }
.jr-card .jr-id { font: 500 11px var(--mono); color: var(--muted); }
.jr-card b { font-weight: 600; overflow-wrap: anywhere; }
.jr-card.skip { opacity: .5; }
.jr-card small { font: 500 11px var(--mono); color: var(--you); }
.jr-card.new { border-color: var(--fail); }
.jr-tags { display: flex; flex-wrap: wrap; gap: 3px; min-width: 0; }
.jr-card .tag { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; border-radius: 6px; }
.jr-detail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 14px; align-items: start; }
.jr-now { display: grid; gap: 8px; align-content: start; min-height: 170px; }
.jr-who { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; color: var(--muted); }
.jr-who .actor { white-space: normal; }
.jr-now p { margin: 0; font-size: 16px; }
.jr-meta { font-size: 12px; color: var(--muted); font-family: var(--mono); }
.jr-art { display: grid; gap: 10px; align-content: start; min-width: 0; min-height: 300px; padding: 12px 14px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--paper); font-size: 14px; line-height: 1.45; }
.jr-ah { display: grid; gap: 1px; }
.jr-ah b { font-size: 15px; overflow-wrap: anywhere; }
.jr-kind { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 600; }
.jr-cm { display: grid; gap: 4px; padding: 8px 10px; border-radius: 8px; background: var(--sheet); border: 1px solid var(--rule); min-width: 0; overflow-wrap: break-word; }
.jr-by { display: flex; align-items: center; gap: 6px; font: 500 12px var(--mono); color: var(--muted); }
.jr-by i { width: 14px; height: 14px; border-radius: 50%; background: var(--agent-soft); border: 1px solid var(--agent); flex: none; }
.jr-by i.you { background: var(--you-soft); border-color: var(--you); }
.jr-p { margin: 0; font-size: 13px; }
.jr-crit, .jr-commits, .jr-checks, .jr-rows { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.jr-crit { counter-reset: c; }
.jr-crit li { counter-increment: c; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: start; }
.jr-crit li::before { content: counter(c) "."; font: 500 12px var(--mono); color: var(--muted); padding-top: 2px; }
.jr-proof { background: var(--ci-soft); color: var(--ci); }
.jr-kv { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; font-size: 13px; }
.jr-st { font: 500 11px var(--mono); padding: 2px 8px; border-radius: 999px; text-transform: uppercase; letter-spacing: .04em; background: var(--well); color: var(--muted); border: 1px solid var(--rule); }
.jr-st.ready { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
.jr-st.merged { background: var(--ci-soft); color: var(--ci); border-color: transparent; }
.jr-commits li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0 10px; }
.jr-commits code { grid-row: span 2; align-self: start; }
.jr-commits small { font-size: 12px; }
.jr-checks li { display: grid; grid-template-columns: 10px minmax(0, 9.5em) minmax(0, 1fr); gap: 8px; align-items: center; }
.jr-checks code { background: none; padding: 0; font-size: 13px; overflow-wrap: anywhere; }
.jr-checks small { font-size: 12px; color: var(--muted); }
.jr-rows li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: baseline; font-size: 13px; }
.jr-rows b, .jr-verdict { font: 600 12px var(--mono); }
.jr-verdict { margin: 6px 0 0; font-size: 13px; }
.jr-ok { color: var(--pass); } .jr-bad { color: var(--fail); }
.jr-find { margin: 4px 0 0; padding: 6px 8px; border-radius: 6px; background: var(--fail-soft); font-size: 13px; }
.jr-fields { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 16px; margin: 0; }
.jr-fields dt { color: var(--muted); font-size: 13px; } .jr-fields dd { margin: 0; }
.jr-foot { font-size: 13px; }
@container (max-width: 640px) {
  .jr-board { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .jr-col { grid-template-columns: 92px minmax(0, 1fr); grid-template-rows: none; align-items: center; padding: 6px 8px; }
  .jr-cell { min-height: 0; }
  /* On a phone the step text sits under the clock, so Next and its effect stay on one screen. */
  .jr-detail { display: contents; }
  .jr-now { min-height: 150px; order: 1; }
  .jr-board, .jr-art, .jr > .legend { order: 2; }
  .jr-col { min-height: 36px; padding-block: 4px; }
  .jr-art { min-height: 0; }
  .jr-hint { display: none; }
  .jr-checks li { grid-template-columns: 10px minmax(0, 1fr); }
  .jr-checks small { grid-column: 2; }
}
`);

let jrCount = 0;
VIZ.journey = function journey(el) {
  const id = 'jr' + ++jrCount;
  el.className = 'panel jr';
  el.tabIndex = 0;
  el.setAttribute('aria-label', 'A ticket’s journey, step by step. Use the left and right arrow keys to step.');
  el.innerHTML = '<div class="seg" role="radiogroup" aria-label="Scenario">' + SCENARIOS.map(([k, label], n) =>
    '<label><input type="radio" name="' + id + '" value="' + n + '"' + (n ? '' : ' checked') + '><span>' + label + '</span></label>').join('') + '</div>'
    + '<div class="jr-top"><div class="jr-ctl"><button class="btn" type="button" data-go="-1">Back</button><button class="btn primary" type="button" data-go="1">Next</button>'
    + '<button class="btn" type="button" data-play aria-pressed="false">Play</button><span class="jr-hint"><kbd>←</kbd> <kbd>→</kbd> to step</span></div>'
    + '<ol class="jr-steps" aria-label="Steps"></ol></div>'
    + '<div class="jr-clock"><div class="jr-clockh"><span>The clock</span><i>example times</i></div><ol class="jr-ticks"></ol><p class="jr-cap"></p></div>'
    + '<div class="jr-board">' + COLS.map((c) => '<section class="jr-col" data-col="' + c + '"><h4>' + c + '</h4><div class="jr-cell"></div></section>').join('') + '</div>'
    + '<div class="jr-detail"><div class="jr-now" aria-live="polite"></div><div class="jr-art"></div></div>'
    + '<div class="legend"><span>Who acts:</span><span class="actor world">the world</span><span class="actor agent">an agent skill</span><span class="actor ci">a CI gate</span><span class="actor you">you</span><span>Example ticket #2 of a pilot run.</span></div>';
  const card = document.createElement('article'), card2 = document.createElement('article');
  card.className = 'jr-card';
  card2.className = 'jr-card new';
  card2.innerHTML = '<span class="jr-id">#4</span><b>Production deploy failed</b><span class="jr-tags">' + tags(['signal:deploy', 'env:production', 'needs-human']) + '</span>';
  const cell = (c) => el.querySelector('[data-col="' + c + '"] .jr-cell');
  let sc = 0, steps = SCENARIOS[0][2], segs = ticks(steps), i = 0, timer = null;

  function load(n) {
    sc = n; steps = SCENARIOS[n][2]; segs = ticks(steps); i = 0;
    $('.jr-steps', el).innerHTML = steps.map((st, k) => '<li><button class="jr-chip" type="button" data-step="' + k + '"><b>' + (k + 1) + '</b>' + esc(st.label) + '</button></li>').join('');
    $('.jr-ticks', el).innerHTML = segs.map((g) => '<li><span class="jr-tick">' + esc(g.t) + '</span></li>').join('');
    card.remove(); card2.remove();
    render(false);
  }
  function render(move = true) {
    const st = steps[i], s = stateAt(steps, i);
    const before = move && card.isConnected ? card.getBoundingClientRect() : null;
    card.classList.toggle('skip', !!st.skip);
    card.innerHTML = '<span class="jr-id">#2</span><b>Show a goodbye message</b><span class="jr-tags">' + tags(s.hold ? [...s.tags, 'needs-human'] : s.tags) + '</span>' + (st.skip ? '<small>skipped: on hold</small>' : '');
    const target = cell(s.col);
    if (card.parentElement !== target) target.append(card);
    if (s.sig2) { if (card2.parentElement !== cell('Signals')) cell('Signals').append(card2); } else card2.remove();
    if (before && !reduced) {
      const after = card.getBoundingClientRect(), dx = before.left - after.left, dy = before.top - after.top;
      if (dx || dy) card.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    const focus = st.focus ?? s.col;
    el.querySelectorAll('.jr-col').forEach((c) => c.classList.toggle('on', c.dataset.col === focus));
    el.querySelectorAll('.jr-tick').forEach((t, k) => { t.classList.toggle('on', k === st.seg); t.classList.toggle('past', k < st.seg); });
    $('.jr-cap', el).textContent = segs[st.seg].cap;
    $('.jr-now', el).innerHTML = '<span class="jr-meta">Step ' + (i + 1) + ' of ' + steps.length + ' · ' + esc(st.t) + '</span>'
      + '<div class="jr-who">' + st.who.map(([k, n]) => '<span class="actor ' + k + '">' + esc(n) + '</span>').join('<span aria-hidden="true">→</span>') + '</div>'
      + '<p>' + esc(st.say) + '</p>';
    $('.jr-art', el).innerHTML = ART[st.art](s);
    el.querySelectorAll('.jr-chip').forEach((b, k) => { b.classList.toggle('done', k < i); if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    const prevB = $('[data-go="-1"]', el), nextB = $('[data-go="1"]', el);
    // A button that turns disabled while focused would drop focus to the page: hand it to the other one first.
    if (i === 0 && document.activeElement === prevB) nextB.focus({ preventScroll: true });
    if (i === steps.length - 1 && document.activeElement === nextB) prevB.focus({ preventScroll: true });
    prevB.disabled = i === 0;
    nextB.disabled = i === steps.length - 1;
  }
  const go = (n) => { const m = Math.max(0, Math.min(steps.length - 1, n)); if (m !== i) { i = m; render(); } };
  function stop() { clearInterval(timer); timer = null; const p = $('[data-play]', el); p.textContent = 'Play'; p.setAttribute('aria-pressed', 'false'); }
  function play() {
    if (i === steps.length - 1) { i = 0; render(false); }
    const p = $('[data-play]', el); p.textContent = 'Pause'; p.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => { if (!el.isConnected) return stop(); go(i + 1); if (i === steps.length - 1) stop(); }, 2600);
  }
  // Any click other than Play stops the playback, inside the panel or out of it.
  const outside = (e) => { if (!el.isConnected) return document.removeEventListener('pointerdown', outside, true); if (timer && !e.target.closest?.('[data-play]')) stop(); };
  document.addEventListener('pointerdown', outside, true);
  el.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]'), k = e.target.closest('[data-step]');
    if (g) { stop(); go(i + Number(g.dataset.go)); }
    if (k) { stop(); go(Number(k.dataset.step)); }
    if (e.target.closest('[data-play]')) { if (timer) stop(); else play(); }
  });
  el.addEventListener('change', (e) => { if (e.target.name === id) { stop(); load(Number(e.target.value)); } });
  el.addEventListener('keydown', (e) => {
    if (e.target.matches('input') || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault(); stop(); go(i + (e.key === 'ArrowRight' ? 1 : -1));
  });
  load(0);
};
}

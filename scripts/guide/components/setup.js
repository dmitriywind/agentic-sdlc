/* ---------- Choose your setup: eight answers in; the init command, the binding and the runner template out ---------- */
VIZ.setup = (el) => {
  const RUNNER = 'https://github.com/dmitriywind/agentic-sdlc/blob/master/templates/runner/';
  const KEY = 'agentic-sdlc-guide-setup';
  // [key, legend, hint, [[value, label, pick it when / limits]]]
  const Q = [
    ['pays', 'Who pays for the agents?', 'Sets profile: the defaults init writes and what validate checks.', [
      ['sub', 'Subscriptions only', 'Pick it when you or a small team run agents on subscriptions. Limits: no API key anywhere.'],
      ['mix', 'Subscriptions + API keys for some stages', 'Pick it when most stages run on subscriptions and a few on managed agents or bots. Limits: each key is named in its executor.'],
      ['api', 'API keys', 'Pick it when a team pays per use and runs belong to service accounts. Limits: a separate review app is required.']]],
    ['ids', 'Forge identities', 'Sets forge.review_identity: whether the account that writes a change can also approve it.', [
      ['one', 'One (yours)', 'Pick it when you work alone or a collaborator can approve. Limits: the review is a separate agent context, not a separate account.'],
      ['two', 'Two (plus a review app)', 'Pick it when no implementer may approve its own change. Limits: a second scheduled run holds the review token.']]],
    ['repos', 'Repos', 'Every repo has its own install, binding and cycle; this decides how they share a board.', [
      ['one', 'One repo', 'Pick it when one repo holds the product. Limits: none; nothing extra in the binding.'],
      ['many', 'Many repos, one board', 'Pick it when several repos share one backlog. Limits: each repo scopes the board; one home repo triages new work.']]],
    ['runs', 'Where the cycle runs', 'Picks the runner template. The gates run in CI whatever you pick.', [
      ['claude', 'Claude cloud routine', 'Pick it when you want no machine of your own, on subscription usage. Limits: no GitHub Project, no Docker (verify runs in CI), at most hourly.'],
      ['vendor', 'Codex or Cursor cloud task', 'Pick it when your agent is Codex or Cursor and you want no machine of your own. Limits: the vendor\'s schedule and network rules.'],
      ['actions', 'GitHub Actions', 'Pick it when you want any board, a GitHub Project included. Limits: a subscription token or an API key in a repo secret.'],
      ['local', 'Your own machine', 'Pick it when the code, tools or network are reachable only from your machine. Limits: no sandbox; the machine must be on.'],
      ['managed', 'Managed agents', 'Pick it when stages run as hosted agents. Limits: API billing.']]],
    ['board', 'Where tickets live', 'Sets board.adapter and its options. The process statuses are the same on every board.', [
      ['issues', 'GitHub issues', 'Pick it when the repo\'s issues are enough. Limits: status and fields are labels.'],
      ['project', 'GitHub Project', 'Pick it when you want a Project board with fields and views. Limits: a token with project scope.'],
      ['jira', 'Jira', 'Pick it when the team already plans in Jira. Limits: an email and an API token in env vars.'],
      ['linear', 'Linear', 'Pick it when the team already plans in Linear. Limits: an API key in an env var.'],
      ['local', 'A local file', 'Pick it to try the factory. Limits: one file, .agents/board.json; no scheduler, no shared board.']]],
    ['agent', 'Which agent', 'Sets --harness: which agent\'s files init writes.', [
      ['claude', 'Claude Code', 'Pick it when you run Claude Code. The plugin carries the skills, except on a Claude cloud routine.'],
      ['codex', 'Codex', 'Pick it when you run Codex. It reads AGENTS.md and .agents/skills/.'],
      ['cursor', 'Cursor', 'Pick it when you run Cursor. It reads AGENTS.md and .agents/skills/.'],
      ['other', 'Another agent', 'Pick it when your agent reads AGENTS.md and .agents/skills/. Limits: no vendor cloud here.']]],
    ['team', 'Team shape', 'Sets owners and forge.human_approval.', [
      ['solo', 'Solo', 'You are product, factory and bot. Limits: with one identity you merge Full-lane changes as admin.'],
      ['small', 'Small team', 'The lead owns the product, a second engineer the factory. A second person approves Full-lane changes.'],
      ['org', 'Organization', 'A product role and a platform team. A human approves every product change.'],
      ['steward', 'Non-developer owner with a steward', 'The owner acts only through board comments and Idea moves; a technical steward runs the factory.']]],
    ['ship', 'What you ship', 'Sets product.environments, delivery and proofs. The skills are the same for every product.', [
      ['webcd', 'Web service, continuous', 'Every merge deploys to staging, then production.'],
      ['webrel', 'Web product with approved releases', 'Production deploys from a release line the Product owner approves.'],
      ['mobile', 'Mobile app', 'Builds go to internal, beta, then the store, each release approved.'],
      ['lib', 'Library or package', 'Every merge publishes to the registry.'],
      ['data', 'Data or ML pipeline', 'Every merge deploys; proofs are evals and data checks.'],
      ['docs', 'Docs site', 'Every merge publishes; proofs are visual and manual checks.']]],
  ];
  const DEF = { pays: 'sub', ids: 'one', repos: 'one', runs: 'claude', board: 'issues', agent: 'claude', team: 'solo', ship: 'webcd' };
  const label = (k, v) => Q.find((q) => q[0] === k)[3].find((o) => o[0] === v)[1];
  const profileOf = (p) => ({ sub: 'individual', mix: 'individual-api', api: 'organization' })[p.pays];
  // Why an option cannot be picked with the other answers, or '' when it can.
  function why(k, v, p) {
    const prof = profileOf(p);
    if (k === 'ids' && v === 'one' && prof === 'organization') return 'organization needs a separate review app';
    if (k === 'runs' && v === 'managed' && prof === 'individual') return 'needs API keys (individual-api or organization)';
    if (k === 'runs' && v === 'claude' && p.agent !== 'claude') return 'needs agent Claude Code';
    if (k === 'runs' && v === 'vendor' && !['codex', 'cursor'].includes(p.agent)) return 'needs agent Codex or Cursor';
    if (k === 'board' && v === 'local' && p.repos === 'many') return 'a file in one repo cannot be shared';
    return '';
  }

  let pick = { ...DEF };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) for (const [k, , , o] of Q) if (o.some((x) => x[0] === s[k])) pick[k] = s[k]; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pick)); } catch {} };

  addStyle('setup', `
    .su { container-type: inline-size; }
    .su-head { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; }
    .su-head h3 { font-size: 17px; }
    .su-grid { display: grid; gap: 20px; align-items: start; }
    .su-qs { display: grid; gap: 18px; align-content: start; margin: 0; }
    .su-q { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 6px; }
    .su-q legend { padding: 0; font-weight: 600; font-size: 15px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 2px; }
    .su-hint, .su-when, .su-why { margin: 0; font-size: 13px; line-height: 1.45; }
    .su-hint, .su-why { color: var(--muted); }
    .su-when { padding: 6px 10px; border-radius: 8px; background: var(--well); }
    .su-q .seg span { line-height: 1.35; }
    .su-q .seg input:disabled { cursor: not-allowed; }
    .su-out { display: grid; gap: 14px; align-content: start; min-width: 0; }
    .su-out h4 { font-size: 15px; font-weight: 600; text-transform: none; letter-spacing: 0; }
    .su-blk { display: grid; gap: 6px; min-width: 0; }
    .su-bh { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
    .su-out pre { margin: 0; background: var(--well); border-radius: var(--r); padding: 10px 12px; font: 13px/1.55 var(--mono); white-space: pre; overflow-x: auto; max-width: 100%; }
    .su-out pre code { background: none; padding: 0; font-size: inherit; }
    .su-out p { margin: 0; font-size: 14px; }
    .su-notes { display: grid; gap: 8px; }
    .su-notes .callout { font-size: 14px; line-height: 1.5; padding: 9px 12px; }
    @container (min-width: 720px) {
      .su-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
      .su-out { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; padding-right: 2px; }
    }`);

  el.className = 'panel su';
  el.innerHTML = '<div class="su-head"><h3>Answer eight questions, get your install</h3><button class="btn" type="button" id="su-reset">Reset</button></div>'
    + '<div class="su-grid"><form class="su-qs" id="su-form">' + Q.map(([k, leg, hint, opts]) =>
      '<fieldset class="su-q" id="su-q-' + k + '" aria-describedby="su-hint-' + k + '"><legend>' + esc(leg) + (k === 'pays' ? ' <span class="tag" id="su-profile"></span>' : '') + '</legend>'
      + '<p class="su-hint" id="su-hint-' + k + '">' + esc(hint) + '</p><div class="seg">' + opts.map(([v, t]) =>
        '<label id="su-l-' + k + '-' + v + '"><input type="radio" id="su-' + k + '-' + v + '" name="' + k + '" value="' + v + '"><span>' + esc(t) + '</span></label>').join('')
      + '</div><div id="su-why-' + k + '"></div><p class="su-when" id="su-when-' + k + '" aria-live="polite"></p></fieldset>').join('')
    + '</form><div class="su-out" id="su-out" aria-live="polite"></div></div>';
  const form = $('#su-form', el), out = $('#su-out', el);
  form.addEventListener('submit', (e) => e.preventDefault());

  let moved = [];
  form.addEventListener('change', (e) => {
    const k = e.target.name, before = profileOf(pick);
    pick[k] = e.target.value;
    moved = [];
    if (k === 'pays' && profileOf(pick) !== before) {
      const def = { individual: 'one', organization: 'two' }[profileOf(pick)];
      if (def && pick.ids !== def) { pick.ids = def; moved.push('Forge identities moved to ' + label('ids', def) + ', the default for ' + profileOf(pick) + '.'); }
    }
    draw();
  });
  $('#su-reset', el).onclick = () => { pick = { ...DEF }; moved = []; draw(); };
  out.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copyText($('#' + b.dataset.copy, el).textContent, b);
  });

  function resolve() {
    for (const [k, leg, , opts] of Q) {
      if (!why(k, pick[k], pick)) continue;
      const first = opts.find((o) => !why(k, o[0], pick));
      moved.push(leg + ' moved from ' + label(k, pick[k]) + ' (' + why(k, pick[k], pick) + ') to ' + first[1] + '.');
      pick[k] = first[0];
    }
  }

  function draw() {
    resolve();
    save();
    for (const [k, , , opts] of Q) {
      const whys = [];
      for (const [v, t, when] of opts) {
        const i = $('#su-' + k + '-' + v, el), w = why(k, v, pick);
        i.disabled = !!w; i.checked = pick[k] === v;
        $('#su-l-' + k + '-' + v, el).title = w ? t + ': ' + w : '';
        if (w) { whys.push('<p class="su-why" id="su-why-' + k + '-' + v + '">' + esc(t) + ': ' + esc(w) + '.</p>'); i.setAttribute('aria-describedby', 'su-why-' + k + '-' + v); }
        else i.removeAttribute('aria-describedby');
        if (pick[k] === v) $('#su-when-' + k, el).textContent = when;
      }
      $('#su-why-' + k, el).innerHTML = whys.join('');
    }
    const prof = profileOf(pick);
    $('#su-profile', el).textContent = 'profile: ' + prof;
    out.innerHTML = output(prof);
  }

  function output(prof) {
    const p = pick;
    const harness = { claude: 'claude', codex: 'codex', cursor: 'cursor', other: 'generic' }[p.agent];
    const board = { issues: 'github-issues', project: 'github', jira: 'jira', linear: 'linear', local: 'local' }[p.board];
    const cmd = ['npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v0.1.2 init', '--profile ' + prof, '--harness ' + harness, '--board ' + board, '--forge github']
      .concat(p.agent === 'claude' && p.runs === 'claude' ? ['--no-plugin'] : []);

    const owners = {
      solo: ['your-login', 'your-login', 'your-login'],
      small: ['lead-login', 'engineer-login', 'your-factory-bot'],
      org: ['product-role-login', 'platform-team-login', 'your-factory-bot'],
      steward: ['owner-login', 'steward-login', 'your-factory-bot'],
    }[p.team];
    const shared = p.repos === 'many';
    const ship = {
      webcd: ['[staging, production]', 'continuous', '[test, visual, computer-use]'],
      webrel: ['[staging, production]', 'release-line', '[test, visual, computer-use]'],
      mobile: ['[internal, beta, store]', 'release-line', '[test, visual, manual]'],
      lib: ['[registry]', 'continuous', '[test]'],
      data: ['[staging, production]', 'continuous', '[eval, data-check]'],
      docs: ['[production]', 'continuous', '[visual, manual]'],
    }[p.ship];
    const y = ['profile: ' + prof, 'owners:', '  product: ' + owners[0], '  factory: ' + owners[1], '  bots: [' + owners[2] + ']'];
    if (p.board === 'jira' || p.board === 'linear') y.push('  # names differ? product: { board: <account id>, forge: <login> }');
    // forge: token_env only where gh has no login of its own, or to keep the implementer off commit statuses.
    const forgeToken = p.ids === 'two' || ['vendor', 'actions', 'managed'].includes(p.runs);
    y.push('forge:', '  adapter: github', '  options:', '    repo: your-org/your-repo');
    if (forgeToken) y.push('    token_env: AGENTIC_FORGE_TOKEN' + (p.ids === 'two' ? '   # Commit statuses: no access' : ''));
    if (p.ids === 'two') y.push('    review_token_env: AGENTIC_REVIEW_TOKEN', '  review_identity: your-review-app[bot]');
    else y.push('  review_identity: ""');
    y.push('  human_approval: ' + (p.team === 'org' ? 'always' : 'full-lane'));
    y.push('board:', '  adapter: ' + board);
    const bo = {
      issues: ['repo: your-org/your-repo'],
      project: ['owner: your-org', 'project_number: 1', 'repo: your-org/your-repo' + (shared ? '   # each repo sets its own' : ''), 'token_env: AGENTIC_BOARD_TOKEN'],
      jira: ['base_url: https://your-site.atlassian.net', 'project_key: PROJ', 'email_env: JIRA_EMAIL', 'token_env: JIRA_TOKEN'],
      linear: ['team_key: ENG', 'token_env: LINEAR_API_KEY'],
      local: [],
    }[p.board];
    if (bo.length) y.push('  options:', ...bo.map((l) => '    ' + l)); else y.push('  options: {}');
    if (shared && p.board !== 'project' && p.board !== 'local') y.push('  scope:', '    label: repo:your-repo', '    home: true   # only in the home repo', '    repos: [repo:your-repo, repo:other-repo]   # only in the home repo');
    y.push('  env_labels: [' + ship[0].slice(1, -1).split(', ').map((e) => 'env:' + e).join(', ') + ']   # one per product.environments');
    y.push('product:', '  environments: ' + ship[0], '  delivery: ' + ship[1], '  proofs: ' + ship[2]);
    y.push('executors:', '  default:', '    kind: harness', '    sandbox: ' + (p.runs === 'local' ? 'local' : prof === 'organization' ? 'container' : 'cloud'));
    if (prof === 'organization') y.push('  # validate warns until one stage runs on a managed agent, for example:', '  # build: { kind: managed, api: claude, agent_env: IMPL_AGENT_ID, environment_env: IMPL_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY }');

    const tpl = p.runs === 'local' ? 'local.md' : p.runs === 'actions' ? (p.agent === 'codex' ? 'github-actions-codex.yml' : 'github-actions-claude.yml')
      : p.runs === 'claude' ? 'claude-routine.md' : p.runs === 'vendor' && p.agent === 'cursor' ? 'cursor-automation.md' : 'routine.md';

    const warn = [], note = [], ok = [];
    note.push(...moved);
    if (p.runs === 'claude' && p.board === 'project') warn.push('A Claude cloud routine cannot reach a GitHub Project: its GitHub proxy refuses GraphQL. Pick GitHub issues, Jira or Linear, or run the cycle in GitHub Actions.');
    if (p.runs === 'claude' && (p.board === 'jira' || p.board === 'linear')) note.push('From a Claude cloud routine, ' + label('board', p.board) + ' needs its host in the environment\'s allowed domains, its token as a network secret, and NODE_USE_ENV_PROXY=1.');
    if (p.board === 'local' && p.runs !== 'local') warn.push('The local board is a file for trying the factory, not for a scheduler or many repos. Pick a shared board before you schedule the cycle.');
    if (p.runs === 'local') note.push('On your own machine: run the cycle in a separate clone, with AGENTIC_SDLC_UNATTENDED=1 and AGENTIC_SDLC_LOCAL=1 in the scheduler\'s environment. Agents run with your account and files.');
    if (p.runs === 'actions' && (p.agent === 'cursor' || p.agent === 'other')) note.push('The Actions template runs Claude Code. Replace its agent step with ' + (p.agent === 'cursor' ? 'Cursor\'s CLI' : 'your agent') + '.');
    if (prof === 'individual') note.push('Under individual the runner refuses ANTHROPIC_API_KEY, so the cycle stays on the subscription.');
    if (prof === 'individual-api') note.push('Under individual-api the runner refuses ANTHROPIC_API_KEY. Give a managed executor\'s key another name in its token_env.');
    if (p.ids === 'one') note.push('One identity: review/review runs in the cycle and CI posts the review status. A Full-lane change waits for a collaborator\'s approval or your admin merge.');
    else note.push('Two identities: schedule a second run with review-prompt.md. Only that run gets AGENTIC_REVIEW_TOKEN.');
    if (ship[1] === 'release-line') ok.push('Release-line delivery: the ship skill runs and you approve each release.');
    else ok.push('Continuous delivery: every merge ships.');

    const block = (id, h, text) => '<div class="su-blk"><div class="su-bh"><h4>' + h + '</h4><button class="btn" type="button" id="su-copy-' + id + '" data-copy="su-' + id + '">Copy</button></div>'
      + '<pre tabindex="0" aria-label="' + id + '"><code id="su-' + id + '">' + esc(text) + '</code></pre></div>';
    return block('cmd', 'Run', cmd.join(' \\\n  '))
      + block('yaml', 'Set in <code>.agents/binding.yml</code>', y.join('\n'))
      + '<p class="su-after">Then set <code>heartbeat.ticket</code> to the id of a ticket that holds heartbeat comments (validate fails while it is empty).</p>'
      + '<div class="su-blk"><h4>Schedule</h4><p>Follow <a id="su-tpl" href="' + RUNNER + tpl + '">templates/runner/' + tpl + '</a>.</p></div>'
      + '<div class="su-blk"><h4>Notes</h4><div class="su-notes">'
      + warn.map((t) => '<div class="callout warn">' + esc(t) + '</div>').join('')
      + note.map((t) => '<div class="callout">' + esc(t) + '</div>').join('')
      + ok.map((t) => '<div class="callout ok">' + esc(t) + '</div>').join('') + '</div></div>';
  }

  draw();
};

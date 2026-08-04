import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';
import { install } from '../scripts/install.mjs';
import { createRunner } from '../scripts/process-runner.mjs';
import { createSupervisor, validatePolicy } from '../scripts/supervisor.mjs';
import { formatExecutionHeader } from '../scripts/github-project.mjs';

const featurePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'process.feature');
const boundScenarios = new Set();
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function scenario(name, body) {
  boundScenarios.add(name);
  test(name, body);
}

function policy(overrides = {}) {
  return {
    tracker: { adapter: './tracker.mjs', options: {} },
    runner: {
      adapter: './runner.mjs',
      goal: { enabled: true, maxContinuations: 1 },
      workspace: { enabled: false, baseRef: 'develop', branchPrefix: 'agentic/' },
      routes: {
        reasoning: { why: 'bounded reasoning', primary: 'reasoning', fallbacks: [] },
        implementation: { why: 'repository editing', primary: 'implementation', fallbacks: [] },
        review: { why: 'independent judgment', primary: 'review', fallbacks: [] },
      },
      profiles: {
        reasoning: { model: 'reasoning-v1', effort: 'medium', command: 'fake', args: [] },
        implementation: { model: 'implementation-v1', effort: 'high', command: 'fake', args: [] },
        review: { model: 'review-v1', effort: 'high', command: 'fake', args: [] },
      },
    },
    process: {
      stages: ['Backlog', 'Ready', 'In progress', 'In review', 'Done', 'Live on staging'],
      conditions: ['waiting:decision', 'waiting:dependency'],
      transitions: [
        { from: 'Backlog', to: 'Ready', evidence: 'triage-ready' },
        { from: 'Ready', to: 'In progress', evidence: 'plan-ready' },
        { from: 'In progress', to: 'In review', evidence: 'change-open' },
        { from: 'In review', to: 'Ready', evidence: 'replan-requested' },
        { from: 'In review', to: 'Done', evidence: 'change-merged' },
        { from: 'Done', to: 'Live on staging', evidence: 'staging-live' },
      ],
      work: [
        {
          id: 'triage',
          stage: 'Backlog',
          run: 'triage',
          lane: 'reasoning',
          completionEvidence: 'triage-ready',
          produces: ['triage-ready'],
        },
        {
          id: 'plan',
          stage: 'Ready',
          run: 'plan',
          lane: 'reasoning',
          requiresPlan: true,
          completionEvidence: 'plan-ready',
          produces: ['plan-ready'],
        },
        {
          id: 'execute',
          stage: 'In progress',
          run: 'execute',
          lane: 'implementation',
          completionEvidence: 'change-open',
          produces: ['change-open'],
        },
        {
          id: 'fix',
          stage: 'In review',
          run: 'fix',
          lane: 'implementation',
          requiresEvidence: ['review-findings'],
          completionEvidence: 'fix-published',
          produces: ['fix-published'],
        },
        {
          id: 'review',
          stage: 'In review',
          run: 'review',
          lane: 'review',
          forbidsEvidence: ['review-findings'],
          completionEvidence: 'change-merged',
          produces: ['review-findings', 'replan-requested', 'change-merged'],
        },
      ],
    },
    limits: {
      maxParallel: 2,
      maxAttempts: 3,
      retryBackoffSeconds: 60,
      intervalSeconds: 60,
      runTimeoutSeconds: 60,
    },
    rules: { files: [], context: [], protectedPaths: ['protected/'] },
    runtime: { directory: '.agentic-sdlc' },
    ...overrides,
  };
}

function ticket(values = {}) {
  return {
    id: 'WORK-1',
    stage: 'Backlog',
    conditions: [],
    evidence: [],
    revision: 'r1',
    attempts: {},
    retryAt: {},
    escalations: [],
    ...values,
  };
}

function memoryTracker(initialTickets) {
  const tickets = new Map(initialTickets.map((item) => [item.id, structuredClone(item)]));
  const events = [];

  return {
    events,
    ticket(id = 'WORK-1') {
      return tickets.get(id);
    },
    clearCondition(id, condition) {
      const current = tickets.get(id);
      current.conditions = current.conditions.filter((value) => value !== condition);
    },
    addEvidence(id, evidence) {
      const current = tickets.get(id);
      current.evidence = [...new Set([...current.evidence, evidence])];
    },
    setRevision(id, revision, evidence = []) {
      const current = tickets.get(id);
      current.revision = revision;
      current.evidence = [...evidence];
    },
    async read() {
      events.push('read');
      return { revision: String(events.length), tickets: structuredClone([...tickets.values()]) };
    },
    async transition(action) {
      events.push(`transition:${action.ticket}:${action.to}`);
      tickets.get(action.ticket).stage = action.to;
    },
    async publish(result) {
      events.push(`publish:${result.ticket}:${result.outcome}`);
      const current = tickets.get(result.ticket);
      if (current.revision !== result.revision) {
        const error = new Error('stale result');
        error.code = 'STALE_RESULT';
        throw error;
      }
      if (result.outcome === 'completed') {
        if (result.nextRevision) {
          current.revision = result.nextRevision;
          current.evidence = [];
        }
        current.evidence = [...new Set([...current.evidence, ...(result.evidence ?? [])])];
        if (result.plan) {
          current.context = `${current.context ?? ''}\n\n## Current approved implementation plan\n\n${result.plan}`;
        }
      } else if (result.outcome === 'failed') {
        current.attempts[result.run] = result.attempt;
        if (result.retryAt) current.retryAt[result.run] = result.retryAt;
      } else {
        current.conditions = [...new Set([...current.conditions, 'waiting:decision'])];
        current.escalations.push(`needs-human:${result.run}`);
      }
    },
    async escalate(action) {
      events.push(`escalate:${action.ticket}:${action.reason}`);
      const current = tickets.get(action.ticket);
      if (!current.escalations.includes(action.reason)) current.escalations.push(action.reason);
    },
  };
}

function fakeRunner(results = []) {
  const queue = [...results];
  const calls = [];
  return {
    calls,
    async run(action) {
      calls.push(structuredClone(action));
      return {
        ticket: action.ticket,
        run: action.run,
        revision: action.revision,
        outcome: 'completed',
        evidence: [action.completionEvidence],
        summary: `${action.run} completed`,
        ...(action.requiresPlan ? { plan: '## Steps\n\n1. Implement the approved scope.\n\n## Acceptance scenarios\n\n- The acceptance criteria pass.' } : {}),
        ...(queue.shift() ?? {}),
      };
    },
  };
}

async function world(initialTicket, results = [], now = '2026-08-03T10:00:00.000Z') {
  const root = await mkdtemp(join(tmpdir(), 'agentic-sdlc-bdd-'));
  temporaryRoots.push(root);
  const tracker = memoryTracker([initialTicket]);
  const runner = fakeRunner(results);
  let currentTime = new Date(now);
  const supervisor = createSupervisor(policy(), {
    tracker,
    runner,
    root,
    clock: () => currentTime,
  });
  return {
    tracker,
    runner,
    supervisor,
    advance(seconds) {
      currentTime = new Date(currentTime.getTime() + seconds * 1000);
    },
  };
}

scenario('Complete normal work from triage through merge', async () => {
  const state = await world(ticket());
  await state.supervisor.tick();
  assert.equal(state.runner.calls[0].run, 'triage');

  await state.supervisor.tick();
  assert.deepEqual(state.tracker.events.slice(-2), ['read', 'transition:WORK-1:Ready']);
  assert.equal(state.tracker.ticket().stage, 'Ready');
  assert.equal(state.runner.calls.length, 1);

  for (let tick = 0; tick < 6; tick += 1) await state.supervisor.tick();
  assert.deepEqual(state.runner.calls.map((call) => call.run), ['triage', 'plan', 'execute', 'review']);
  assert.equal(state.tracker.ticket().stage, 'Done');
  assert.equal(state.tracker.ticket().evidence.includes('change-merged'), true);
});

scenario('A blocking condition preserves the current stage', async () => {
  const state = await world(ticket({ stage: 'In progress', conditions: ['waiting:decision'] }));
  await state.supervisor.tick();
  assert.equal(state.runner.calls.length, 0);
  assert.equal(state.tracker.ticket().stage, 'In progress');
});

scenario('User input resumes the run owed by the preserved stage', async () => {
  const state = await world(ticket({ stage: 'In progress', conditions: ['waiting:decision'] }));
  await state.supervisor.tick();
  state.tracker.clearCondition('WORK-1', 'waiting:decision');
  await state.supervisor.tick();
  assert.equal(state.runner.calls[0].run, 'execute');
});

scenario('A resolved dependency resumes the preserved stage', async () => {
  const state = await world(ticket({ stage: 'Ready', conditions: ['waiting:dependency'] }));
  await state.supervisor.tick();
  state.tracker.clearCondition('WORK-1', 'waiting:dependency');
  await state.supervisor.tick();
  assert.equal(state.runner.calls[0].run, 'plan');
});

scenario('Failed review is fixed and reviewed again', async () => {
  const state = await world(
    ticket({ stage: 'In review', evidence: ['review-findings'] }),
    [{ evidence: ['fix-published'], nextRevision: 'r2' }],
  );
  await state.supervisor.tick();
  assert.equal(state.runner.calls[0].run, 'fix');
  await state.supervisor.tick();
  assert.equal(state.runner.calls[1].run, 'review');
  assert.equal(state.runner.calls[1].revision, 'r2');
});

scenario('Requirement feedback returns work to planning', async () => {
  const state = await world(ticket({ stage: 'In review', evidence: ['replan-requested'] }));
  await state.supervisor.tick();
  assert.equal(state.tracker.ticket().stage, 'Ready');
  assert.equal(state.runner.calls.length, 0);
});

scenario('Current completion evidence prevents duplicate work', async () => {
  const state = await world(ticket({ stage: 'Ready', evidence: ['plan-ready'] }));
  await state.supervisor.tick();
  assert.equal(state.runner.calls.length, 0);
});

scenario('A plan cannot advance work without durable plan content', async () => {
  const state = await world(ticket({ stage: 'Ready' }), [{ plan: '' }]);
  await state.supervisor.tick();
  await state.supervisor.tick();
  assert.equal(state.tracker.ticket().evidence.includes('plan-ready'), false);
  assert.equal(state.tracker.ticket().stage, 'Ready');
  assert.equal(state.tracker.ticket().conditions.includes('waiting:decision'), true);
});

scenario('Execution receives the approved plan', async () => {
  const plan = '## Steps\n\n1. Update the component.\n\n## Acceptance scenarios\n\n- The scenario passes.';
  const state = await world(ticket({ stage: 'Ready' }), [{ plan }]);
  await state.supervisor.tick();
  await state.supervisor.tick();
  await state.supervisor.tick();
  assert.equal(state.runner.calls.at(-1).run, 'execute');
  assert.match(state.runner.calls.at(-1).context, /Update the component/);
});

scenario('A stale result cannot publish', async () => {
  const state = await world(ticket({ stage: 'In progress' }));
  await state.supervisor.tick();
  state.tracker.setRevision('WORK-1', 'r2');
  await state.supervisor.tick();
  assert.equal(state.tracker.ticket().evidence.includes('change-open'), false);
  assert.equal(state.runner.calls.at(-1).revision, 'r2');
});

scenario('A publication failure retains the result with its actionable cause', async () => {
  const state = await world(ticket({ stage: 'In progress' }));
  await state.supervisor.tick();
  state.tracker.publish = async () => {
    throw new Error('tracker unavailable');
  };

  await assert.rejects(
    state.supervisor.tick(),
    /WORK-1.*execute.*tracker unavailable/,
  );

  const runtime = JSON.parse(await readFile(join(temporaryRoots.at(-1), '.agentic-sdlc', 'state.json'), 'utf8'));
  assert.equal(runtime.pending.length, 1);
  assert.equal(runtime.pending[0].ticket, 'WORK-1');
});

scenario('A transient failure retries after backoff', async () => {
  const state = await world(
    ticket({ stage: 'In progress' }),
    [{ outcome: 'failed', retryable: true, evidence: [], summary: 'temporary failure' }],
  );
  await state.supervisor.tick();
  await state.supervisor.tick();
  assert.equal(state.runner.calls.length, 1);
  state.advance(60);
  await state.supervisor.tick();
  assert.equal(state.runner.calls[1].attempt, 2);
  assert.equal(state.runner.calls[1].revision, 'r1');
});

scenario('Exhausted attempts escalate once', async () => {
  const state = await world(ticket({ stage: 'In progress', attempts: { execute: 3 } }));
  await state.supervisor.tick();
  await state.supervisor.tick();
  assert.equal(
    state.tracker.events.filter((event) => event === 'escalate:WORK-1:attempts-exhausted:execute').length,
    1,
  );
  assert.equal(state.runner.calls.length, 0);
});

scenario('Protected path changes fail closed', async () => {
  const state = await world(
    ticket({ stage: 'In progress' }),
    [{ evidence: ['change-open'], changes: ['protected/secret.txt'] }],
  );
  await state.supervisor.tick();
  await state.supervisor.tick();
  assert.equal(state.tracker.ticket().evidence.includes('change-open'), false);
  assert.equal(state.tracker.ticket().conditions.includes('waiting:decision'), true);
  assert.equal(state.tracker.ticket().stage, 'In progress');
});

scenario('The dispatch kill switch keeps agent CLIs idle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-sdlc-bdd-'));
  temporaryRoots.push(root);
  const tracker = memoryTracker([ticket({ stage: 'In progress' })]);
  const runner = fakeRunner();
  const supervisor = createSupervisor(policy({
    runtime: { directory: '.agentic-sdlc', enabled: false },
  }), { tracker, runner, root });
  await supervisor.tick();
  assert.equal(tracker.events.includes('read'), true);
  assert.equal(runner.calls.length, 0);
});

scenario('A read-only tick reports actions without side effects', async () => {
  const state = await world(ticket({ stage: 'In progress' }));
  const report = await state.supervisor.tick({ readOnly: true });
  assert.equal(report.actions[0].type, 'dispatch');
  assert.deepEqual(state.tracker.events, ['read']);
  assert.equal(state.runner.calls.length, 0);
});

scenario('Installation owns one concise project-rules pointer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-sdlc-bdd-'));
  temporaryRoots.push(root);
  const first = await install({ root });
  const configured = JSON.parse(await readFile(first.policyPath, 'utf8'));
  configured.projectMarker = 'preserve';
  await writeFile(first.policyPath, `${JSON.stringify(configured, null, 2)}\n`, 'utf8');

  const second = await install({ root });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(JSON.parse(await readFile(first.policyPath, 'utf8')).projectMarker, 'preserve');
  for (const rulesPath of configured.rules.files) {
    const rules = await readFile(join(root, rulesPath), 'utf8');
    assert.equal(rules.match(/<!-- agentic-sdlc:start -->/g)?.length, 1);
    assert.match(rules, /## Agentic SDLC/);
  }
});

const SUCCESSFUL_CLI = `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log('AGENTIC_SDLC_RESULT ' + JSON.stringify({
    ticket: 'WORK-1',
    run: 'execute',
    revision: 'r1',
    outcome: 'completed',
    evidence: ['change-open'],
    summary: 'change published'
  }));
});
`;

const INCOMPLETE_CLI = `
process.stdin.resume();
process.stdin.on('end', () => console.log('goal still in progress'));
`;

const NEEDS_HUMAN_CLI = `
process.stdin.resume();
process.stdin.on('end', () => {
  console.log('AGENTIC_SDLC_RESULT ' + JSON.stringify({
    ticket: 'WORK-1',
    run: 'execute',
    revision: 'r1',
    outcome: 'needs-human',
    evidence: [],
    summary: 'A product decision is required.'
  }));
});
`;

function runnerAction() {
  return {
    type: 'dispatch',
    ticket: 'WORK-1',
    run: 'execute',
    lane: 'implementation',
    revision: 'r1',
    context: 'Implement the accepted plan.',
    attempt: 1,
    completionEvidence: 'change-open',
    produces: ['change-open'],
  };
}

scenario('An unavailable primary uses the next approved model fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-sdlc-bdd-'));
  temporaryRoots.push(root);
  const configured = policy();
  configured.runner.goal.maxContinuations = 0;
  configured.runner.routes.implementation = {
    why: 'repository editing',
    primary: 'unavailable',
    fallbacks: ['working'],
  };
  configured.runner.profiles = {
    unavailable: { command: join(root, 'missing-agent-cli.exe'), args: [] },
    working: {
      model: 'model-v1',
      effort: 'medium',
      command: process.execPath,
      args: ['-e', SUCCESSFUL_CLI],
    },
  };
  const result = await createRunner({ policy: configured, root }).run(runnerAction());
  assert.equal(result.outcome, 'completed');
  assert.equal(result.execution.profile, 'working');
  assert.equal(result.execution.model, 'model-v1');
  assert.equal(result.execution.effort, 'medium');
  assert.equal(result.execution.fallbackIndex, 1);
});

scenario('Model profiles pin identity and effort', () => {
  const configured = policy();
  delete configured.runner.profiles.reasoning.effort;
  assert.throws(
    () => validatePolicy(configured),
    /profile reasoning needs effort/,
  );
});

scenario('A valid task outcome never switches models', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-sdlc-bdd-'));
  temporaryRoots.push(root);
  const configured = policy();
  configured.runner.routes.implementation = {
    why: 'repository editing',
    primary: 'primary',
    fallbacks: ['must-not-run'],
  };
  configured.runner.profiles = {
    primary: { command: process.execPath, args: ['-e', NEEDS_HUMAN_CLI] },
    'must-not-run': { command: join(root, 'missing-agent-cli.exe'), args: [] },
  };
  const result = await createRunner({ policy: configured, root }).run(runnerAction());
  assert.equal(result.outcome, 'needs-human');
  assert.equal(result.execution.profile, 'primary');
  assert.equal(result.execution.fallbackIndex, 0);
});

scenario('Goal mode continues one claim until a terminal result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agentic-sdlc-bdd-'));
  temporaryRoots.push(root);
  const configured = policy();
  configured.runner.routes.implementation = {
    why: 'repository editing',
    primary: 'goal-aware',
    fallbacks: [],
  };
  configured.runner.profiles = {
    'goal-aware': {
      command: process.execPath,
      args: ['-e', INCOMPLETE_CLI],
      continueArgs: ['-e', SUCCESSFUL_CLI],
    },
  };
  const result = await createRunner({ policy: configured, root }).run(runnerAction());
  assert.equal(result.outcome, 'completed');
  assert.equal(result.execution.profile, 'goal-aware');
  assert.equal(result.execution.fallbackIndex, 0);
  assert.equal(result.execution.goalContinuations, 1);
});

scenario('Restart derives from durable tracker truth', async () => {
  const state = await world(ticket({ stage: 'In progress', evidence: ['change-open'] }));
  await state.supervisor.tick();
  const restarted = createSupervisor(policy(), {
    tracker: state.tracker,
    runner: state.runner,
    root: temporaryRoots.at(-1),
  });
  await restarted.tick();
  assert.equal(state.runner.calls.some((call) => call.run === 'execute'), false);
});

scenario('Release requires current environment evidence', async () => {
  const state = await world(ticket({ stage: 'Done' }));
  await state.supervisor.tick();
  assert.equal(state.tracker.ticket().stage, 'Done');
  state.tracker.addEvidence('WORK-1', 'staging-live');
  await state.supervisor.tick();
  assert.equal(state.tracker.ticket().stage, 'Live on staging');
});

test('formatExecutionHeader formats model citation blockquote and token cost', () => {
  const result = {
    summary: 'Read-only plan completed. Goal usage: 187980 tokens over 7m50s.',
    execution: {
      model: 'gpt-5.6-sol',
      profile: 'codex-plan',
      effort: 'high',
      route: 'planning',
      durationMs: 588701,
    },
  };
  const header = formatExecutionHeader(result);
  assert.match(header, /> 🤖 \*\*Model:\*\* `gpt-5.6-sol` \| \*\*Profile:\*\* `codex-plan` \| \*\*Effort:\*\* `high` \| \*\*Route:\*\* `planning` \| \*\*Duration:\*\* 9m 49s \| \*\*Usage:\*\* 187,980 tokens \(est\. \$0\.75\)/);
});

test('formatExecutionHeader cites model and duration for failed multi-profile runs', () => {
  const result = {
    outcome: 'failed',
    summary: 'Every model profile failed for route \'implementation\': gemini-build: quota reached; codex-build: error',
    execution: {
      route: 'implementation',
      profile: 'gemini-build → codex-build',
      model: 'gemini-3.6-flash → gpt-5.6-sol',
      durationMs: 45000,
      workspace: 'isolated',
    },
  };
  const header = formatExecutionHeader(result);
  assert.match(header, /> 🤖/);
  assert.match(header, /\*\*Model:\*\*/);
  assert.match(header, /gemini-3\.6-flash → gpt-5\.6-sol/);
  assert.match(header, /\*\*Duration:\*\* 45s/);
});

test('every feature scenario is bound to supervisor behavior', async () => {
  const feature = await readFile(featurePath, 'utf8');
  const declared = [...feature.matchAll(/^\s*Scenario:\s+(.+)$/gm)].map((match) => match[1]);
  assert.deepEqual([...boundScenarios].sort(), declared.sort());
});

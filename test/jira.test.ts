import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiraTracker, formatJiraExecutionHeader } from '../dist/index.js';
import type { RunResult } from '../dist/index.js';

test('formatJiraExecutionHeader formats model and cost summary', () => {
  const result: RunResult = {
    ticket: 'SDLC-101',
    run: 'plan',
    revision: '1',
    outcome: 'completed',
    summary: 'Plan finalized',
    execution: {
      model: 'fast-model-1',
      profile: 'fast',
      effort: 'medium',
      route: 'default',
      durationMs: 4500,
      fallbackIndex: 0,
      goalContinuations: 0,
    },
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
    },
  };

  const header = formatJiraExecutionHeader(result);
  assert.match(header, /fast-model-1/);
  assert.match(header, /1,500/);
});

test('createJiraTracker handles unconfigured credentials safely', async () => {
  const tracker = createJiraTracker();
  const snapshot = await tracker.read();

  assert.equal(snapshot.revision, '0');
  assert.deepEqual(snapshot.tickets, []);

  // Operations complete silently without error when unconfigured
  await tracker.transition({ type: 'transition', ticket: 'SDLC-1', from: 'triage', to: 'planning', evidence: 'test' });
  await tracker.publish({ ticket: 'SDLC-1', run: 'plan', revision: '1', outcome: 'completed', summary: 'ok' });
  await tracker.escalate({ type: 'escalate', ticket: 'SDLC-1', reason: 'stuck' });
});

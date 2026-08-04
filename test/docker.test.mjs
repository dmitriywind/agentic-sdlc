import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDockerSandbox } from '../dist/index.js';

test('createDockerSandbox creates valid context with fallback support', async () => {
  const sandbox = await createDockerSandbox({
    ticketId: 'SDLC-DOCKER-1',
    purpose: 'plan',
  });

  assert.ok(sandbox.worktreePath);
  assert.equal(sandbox.image, 'node:20-slim');
  assert.equal(typeof sandbox.execInContainer, 'function');

  // Verify container/local exec fallback runs without error
  const { stdout } = await sandbox.execInContainer('node', ['-v']);
  assert.match(stdout, /v\d+/);

  await sandbox.cleanup();
});

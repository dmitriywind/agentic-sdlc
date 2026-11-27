// The plugin's CLI shim, bin/agentic-sdlc, run as a process, and the reviewer agent's tool boundary.
// State on w.state: agent (the frontmatter of the agent file being asked about).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Given, When, Then } from '../support/steps.ts';
import { REPO } from '../support/world.ts';

const list = (s: string) => s.split(/,\s*/).map((x) => x.trim()).filter(Boolean);
Given('the plugin agent {string}', (w, name: string) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(REPO, 'agents', `${name}.md`), 'utf8'));
  assert.ok(m, 'the agent file has no frontmatter');
  w.state.agent = Object.fromEntries(m[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
});
Then('the agent has no tool among {string}', (w, names: string) => assert.deepEqual(list(w.state.agent.tools).filter((t) => list(names).includes(t)), []));
Then('the agent disallows {string}', (w, names: string) => assert.deepEqual(list(names).filter((t) => !list(w.state.agent.disallowedTools).includes(t)), []));

When('bin/agentic-sdlc runs with --version in a project that pins no build', (w) => {
  w.env.CLAUDE_PROJECT_DIR = join(REPO, 'test');
  w.last = w.spawn([join(REPO, 'bin/agentic-sdlc'), '--version']);
});
Then('it prints the package version', (w) => assert.equal(w.last.stdout.trim(), JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version));

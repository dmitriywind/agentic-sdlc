// The plugin's CLI shim, bin/agentic-sdlc, run as a process, and the reviewer agent's tool boundary.
// State on w.state: agent (the frontmatter of the agent file being asked about).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Given, When, Then } from '../support/steps.ts';
import { REPO, type World } from '../support/world.ts';

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

// ---- the session-start hook (hooks/session-start.mjs), run as a process on a project ----
const sessionStart = (w: World, plugin: boolean) => {
  w.env.CLAUDE_PROJECT_DIR = w.root;
  // The test process may itself run under a plugin: the variable is set or emptied, never inherited.
  w.env.CLAUDE_PLUGIN_ROOT = plugin ? REPO : '';
  w.last = w.spawn([join(REPO, 'hooks', 'session-start.mjs')]);
};
When('a session starts in the project under the plugin', (w) => sessionStart(w, true));
When('a session starts in the project without the plugin', (w) => sessionStart(w, false));
Then('the orientation has at most {int} words', (w, n: number) => {
  const words = w.last.stdout.trim().split(/\s+/).length;
  assert.ok(words <= n, `${words} words:\n${w.last.stdout}`);
});
Then('the orientation is one line', (w) => assert.equal(w.last.stdout.trim().split('\n').length, 1, w.last.stdout));

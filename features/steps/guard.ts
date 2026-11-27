// The guard hook (hooks/guard.mjs) is a process fed one JSON object on stdin; exit 2 blocks the call.
// Checkouts are git repos under the project dir, each with a binding file naming its trunk.
// State on w.state: cwd (where the agent works), agentType, checkouts (name -> path).
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { Given, When, Then } from '../support/steps.ts';
import { BIN, GUARD, HOOKS_JSON, type World } from '../support/world.ts';

const checkoutPath = (w: World, name: string) => {
  const p = w.state.checkouts?.[name];
  assert.ok(p, `no checkout named "${name}"; add: Given a checkout "${name}" on the branch ...`);
  return p as string;
};

/** The command with {{name}} replaced by the path of that checkout, written as a shell writes it (forward slashes, also on Windows). */
const expand = (w: World, command: string) => command.replace(/\{\{([^}]+)\}\}/g, (_m, n) => checkoutPath(w, n).replaceAll('\\', '/'));

const hook = (w: World, tool: string, input: Record<string, unknown>) => {
  const payload: Record<string, unknown> = { cwd: w.state.cwd ?? w.root, tool_name: tool, tool_input: input };
  if (w.state.agentType) payload.agent_type = w.state.agentType;
  // No role and no status opt-in unless the scenario sets them.
  w.env = { AGENTIC_SDLC_ROLE: '', AGENTIC_SDLC_ALLOW_STATUS: '', ...w.env };
  w.last = w.spawn([GUARD], JSON.stringify(payload));
};

// ---- Given ----
Given('a checkout {string} on the branch {string} of a project whose trunk is {string}', (w, name: string, branch: string, trunk: string) => {
  const dir = w.path(name);
  mkdirSync(dir, { recursive: true });
  w.git(['init', '-b', trunk], dir);
  w.git(['commit', '--allow-empty', '-m', 'init'], dir);
  if (branch !== trunk) w.git(['checkout', '-b', branch], dir);
  mkdirSync(`${dir}/sub`);
  w.write(`${name}/.agents/binding.yml`, `vcs:\n  trunk: ${trunk}\n`);
  (w.state.checkouts ??= {})[name] = dir;
});
Given('the checkout {string} has no binding file', (w, name: string) => rmSync(`${checkoutPath(w, name)}/.agents`, { recursive: true }));
Given('the checkout {string} has the binding file:', (w, name: string, text: string) => w.write(`${name}/.agents/binding.yml`, text + '\n'));
Given('the agent works in {string}', (w, rel: string) => { w.state.cwd = w.path(rel); });
Given('the agent is the subagent {string}', (w, type: string) => { w.state.agentType = type; });
Given('the environment sets {string} to {string}', (w, key: string, value: string) => { w.env[key] = value; });

// ---- When ----
When('the agent runs {string}', (w, command: string) => hook(w, 'Bash', { command: expand(w, command) }));
When('the agent calls the MCP tool {string}', (w, tool: string) => hook(w, tool, {}));
When('the agent calls the MCP tool {string} with {string}', (w, tool: string, input: string) => hook(w, tool, JSON.parse(input)));
When('the hook receives the input {string}', (w, text: string) => { w.last = w.spawn([GUARD], text); });
When('git hands the pre-push hook of the checkout {string} these lines:', (w, name: string, lines: string) => {
  const text = lines.replace(/SHA/g, 'a'.repeat(40)).replace(/ZERO/g, '0'.repeat(40)) + '\n';
  w.last = w.spawn([BIN, '--root', checkoutPath(w, name), 'gate', 'branch-names', '--stdin-prepush'], text);
});

// ---- Then ----
Then(/the command is (blocked|allowed)/, (w, verdict: string) => assert.equal(w.last.code, verdict === 'blocked' ? 2 : 0, `${verdict} expected; stderr: ${w.last.stderr.trim()}`));
Then('the agent is told {string}', (w, text: string) => assert.ok(w.last.stderr.includes(text), `stderr lacks "${text}":\n${w.last.stderr}`));
Then('the hook entry that matches MCP tools matches {string}', (w, tool: string) => {
  const entries = JSON.parse(readFileSync(HOOKS_JSON, 'utf8')).hooks.PreToolUse as { matcher: string }[];
  assert.ok(entries.some((e) => e.matcher !== 'Bash' && new RegExp(`^${e.matcher}$`).test(tool)), `no hook entry matches ${tool}`);
});
Then('every hook entry blocks the call when the hook fails', () => {
  const entries = JSON.parse(readFileSync(HOOKS_JSON, 'utf8')).hooks.PreToolUse as { hooks: { onFailure: string }[] }[];
  assert.equal(entries.length, 2);
  for (const e of entries) assert.equal(e.hooks[0].onFailure, 'block');
});

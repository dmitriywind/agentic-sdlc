// The files the plugin ships, read from this repo: agents/, bin/, evals/, the manifests and package.json "files".
// State on w.state: agent (the frontmatter of the agent file being asked about), manifest (the parsed manifest being asked about).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Given, When, Then } from '../support/steps.ts';
import { REPO, type World } from '../support/world.ts';

const read = (p: string) => readFileSync(join(REPO, p), 'utf8');
const front = (text: string): Record<string, string> => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'the file has no frontmatter');
  return Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
};
const agent = (w: World) => w.state.agent as Record<string, string>;
const version = () => JSON.parse(read('package.json')).version as string;
const evalCases = () => readdirSync(join(REPO, 'evals')).filter((d) => existsSync(join(REPO, 'evals', d, 'prompt.md')));

// ---- agents ----
Given('the plugin agent {string}', (w, name: string) => { w.state.agent = front(read(`agents/${name}.md`)); });
Then('the agent is named {string}', (w, name: string) => assert.equal(agent(w).name, name));
Then('the agent inherits the model', (w) => assert.equal(agent(w).model, 'inherit'));
Then('the agent description matches {string}', (w, re: string) => assert.match(agent(w).description, new RegExp(re)));
Then('the agent description does not match {string}', (w, re: string) => assert.doesNotMatch(agent(w).description, new RegExp(re)));
Then('the agent has no tool among {string}', (w, names: string) => {
  const tools = agent(w).tools.split(/,\s*/);
  assert.deepEqual(tools.filter((t) => names.split(',').map((n) => n.trim()).includes(t)), []);
});
Then('the agent has the tool {string}', (w, tool: string) => assert.ok(agent(w).tools.split(/,\s*/).includes(tool), `${tool} in ${agent(w).tools}`));
Then('the agent disallows {string}', (w, tools: string) => assert.ok(agent(w).disallowedTools.includes(tools), agent(w).disallowedTools));
Then('the agent has a turn limit', (w) => assert.match(agent(w).maxTurns, /^\d+$/));
Then('no plugin agent sets {string}', (w, key: string) => {
  for (const f of readdirSync(join(REPO, 'agents'))) assert.ok(!Object.keys(front(read(`agents/${f}`))).includes(key), `${f} sets ${key}, which plugin agents ignore`);
});

// ---- the package's files list ----
Then('the package ships {string}', (w, entry: string) => assert.ok((JSON.parse(read('package.json')).files as string[]).includes(entry), entry));

// ---- bin/agentic-sdlc ----
Then('bin/agentic-sdlc is executable', () => assert.ok(statSync(join(REPO, 'bin/agentic-sdlc')).mode & 0o100));
When('bin/agentic-sdlc runs with --version in a project that pins no build', (w) => {
  w.env.CLAUDE_PROJECT_DIR = join(REPO, 'test');
  w.last = w.spawn([join(REPO, 'bin/agentic-sdlc'), '--version']);
});
Then('it prints the package version', (w) => assert.equal(w.last.stdout.trim(), version()));

// ---- evals ----
Then('no eval grader names an old skill', () => {
  const dir = join(REPO, 'evals');
  for (const c of readdirSync(dir)) for (const g of readdirSync(join(dir, c, 'graders')))
    assert.doesNotMatch(read(`evals/${c}/graders/${g}`), /triage-signal|judge-run|improve-factory|verify-ux|escalate-to-human|implement-spec|review-pr/, `${c}/${g}`);
});
Then('the grader {string} names the skills {string}', (w, file: string, re: string) => assert.match(read(file), new RegExp(re.replace(/\\\|/g, '|'))));
Then('there are at least {int} eval cases', (w, n: number) => assert.ok(evalCases().length >= n, `${evalCases().length} cases`));
Then('no eval prompt has a TODO', () => { for (const c of evalCases()) assert.doesNotMatch(read(`evals/${c}/prompt.md`), /TODO/, c); });
Then('every eval case has graders of a known type', () => {
  for (const c of evalCases()) {
    const graders = readdirSync(join(REPO, 'evals', c, 'graders'));
    assert.ok(graders.length, `${c} has no grader`);
    for (const g of graders) assert.match(front(read(`evals/${c}/graders/${g}`)).type, /^(regex|tool_order|tool_used|file_exists|llm|baseline)$/, `${c}/${g}`);
  }
});

// ---- manifests ----
const manifest = (dir: string) => JSON.parse(read(`${dir}/plugin.json`));
Then('the manifest in {word} is named "agentic-sdlc"', (w, dir: string) => assert.equal(manifest(dir).name, 'agentic-sdlc'));
Then('the manifest in {word} carries the package version', (w, dir: string) => assert.equal(manifest(dir).version, version()));

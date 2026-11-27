#!/usr/bin/env node
// SessionStart: a few lines of orientation, printed to stdout (Claude Code adds it to the session's context).
// Under the plugin the skills are agentic-sdlc:<name>; a project install (init --no-plugin) names them sdlc and sdlc-<name>.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const plugin = !!process.env.CLAUDE_PLUGIN_ROOT;
const sdlc = plugin ? 'agentic-sdlc:sdlc' : 'sdlc', setup = plugin ? 'agentic-sdlc:setup' : 'sdlc-setup';

if (!existsSync(join(root, '.agents', 'binding.yml'))) {
  console.log(`agentic-sdlc (a software factory) is available but not installed here; if the person wants it, load the ${setup} skill.`);
} else {
  console.log([
    'This project runs the agentic-sdlc factory; its values are in .agents/binding.yml.',
    `To run a cycle or find the next step for a ticket or change request, load the ${sdlc} skill.`,
    `To install, repair, or answer "what now / what is happening / what waits on me", load the ${setup} skill.`,
    'Board, forge and VCS work goes through `agentic-sdlc <group> <verb>`, never a vendor CLI.',
  ].join('\n'));
}

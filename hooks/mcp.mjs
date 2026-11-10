#!/usr/bin/env node
// The plugin's MCP server: the project's pinned agentic-sdlc devDependency, else the plugin's committed build.
// Never npx: the npm name agentic-sdlc belongs to another package.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const pkg = join(import.meta.dirname, '..');
const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const bin = [join(project, 'node_modules', 'agentic-sdlc', 'dist', 'bin.js'), join(pkg, 'dist', 'bin.js')].find((p) => existsSync(p));
if (!bin) { console.error(`agentic-sdlc: no dist/bin.js in ${pkg}; reinstall the plugin`); process.exit(1); }
spawn(process.execPath, [bin, 'mcp', ...process.argv.slice(2)], { cwd: project, stdio: 'inherit' })
  .on('exit', (code) => process.exit(code ?? 1));

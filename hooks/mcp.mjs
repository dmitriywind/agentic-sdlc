#!/usr/bin/env node
// The plugin's MCP server: the project's pinned agentic-sdlc devDependency, else this package's build,
// else `npx -y agentic-sdlc@<this version>` (a plugin installed from git has no dist/).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = join(import.meta.dirname, '..');
const project = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const bin = [join(project, 'node_modules', 'agentic-sdlc', 'dist', 'bin.js'), join(pkg, 'dist', 'bin.js')].find((p) => existsSync(p));
const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
const [cmd, args] = bin ? [process.execPath, [bin, 'mcp']] : ['npx', ['-y', `agentic-sdlc@${version}`, 'mcp']];
spawn(cmd, [...args, ...process.argv.slice(2)], { cwd: project, stdio: 'inherit', shell: !bin && process.platform === 'win32' })
  .on('exit', (code) => process.exit(code ?? 1));

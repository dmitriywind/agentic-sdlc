// The CLI as a process (usage, options), the HTTP helper of src/exec.ts against a stubbed fetch, and the built dist/bin.js.
// State on w.state: fetchCalls, result, error, failed, server, dist (path, or false when dist is not built), distOut.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Given, When, Then, type DataTable } from '../support/steps.ts';
import { BIN, REPO, splitArgs, type World } from '../support/world.ts';
import { http, setHttpTimeout } from '../../src/exec.ts';

// ---- the CLI exactly as typed (no --root added) ----
When('I run the CLI as typed {string}', (w, line: string) => { w.last = w.spawn([BIN, ...splitArgs(line)]); });
Then('the output does not start with {string}', (w, text: string) => assert.ok(!w.last.output.startsWith(text), w.last.output));

// ---- the HTTP helper ----
const stubFetch = (w: World, answer: (url: string, n: number) => Response) => {
  const real = globalThis.fetch;
  w.state.fetchCalls = [] as string[];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    w.state.fetchCalls.push(`${init.method} ${url}`);
    return answer(url, w.state.fetchCalls.length);
  }) as typeof fetch;
  w.onCleanup(() => { globalThis.fetch = real; });
  w.useFakeSleep();
};

Given('the API answers in turn:', (w, t: DataTable) => {
  const rows = t.hashes();
  stubFetch(w, (_url, n) => {
    const r = rows[Math.min(n, rows.length) - 1];
    const status = Number(r.status);
    const headers: Record<string, string> = r['retry-after'] ? { 'retry-after': r['retry-after'] } : {};
    return new Response(status === 204 ? null : (r.body || '{"ok":true}'), { status, headers });
  });
});


Given('an API that never answers', async (w) => {
  const srv = createServer(() => {}).listen(0);
  await new Promise((r) => srv.once('listening', r));
  w.state.apiUrl = `http://127.0.0.1:${(srv.address() as { port: number }).port}/x`;
  w.onCleanup(() => { srv.closeAllConnections(); srv.close(); });
});
Given('the time limit of a request is {int} milliseconds', (w, ms: number) => { const prev = setHttpTimeout(ms); w.onCleanup(() => { setHttpTimeout(prev); }); });

const call = async (w: World, method: string, url: string, tries?: number) => {
  w.state.result = undefined; w.state.error = undefined; w.state.failed = false;
  try { w.state.result = await http(method, url, { body: method === 'POST' ? {} : undefined, ...(tries ? { tries } : {}) }); }
  catch (e) { w.state.failed = true; w.state.error = e as Error; }
};
When('the adapter makes a {word} call to {string}', (w, method: string, url: string) => call(w, method, url));
When('the adapter makes a {word} call to the API', (w, method: string) => call(w, method, w.state.apiUrl));

Then('the call returns {string}', (w, json: string) => { assert.ok(!w.state.failed, String(w.state.error)); assert.deepEqual(w.state.result, JSON.parse(json)); });
Then('the call fails with {string}', (w, text: string) => { assert.ok(w.state.failed, 'the call succeeded'); assert.ok(w.state.error.message.includes(text), w.state.error.message); });
Then('the API was called {int} times', (w, n: number) => assert.equal(w.state.fetchCalls.length, n));
Then('the helper waited {string} milliseconds', (w, list: string) => assert.deepEqual(w.sleeps, list.split(',').map((x) => Number(x.trim()))));

// ---- the built CLI ----
const bin = join(REPO, 'dist', 'bin.js');
const runBuilt = (w: World, args: string[], input?: string) => execFileSync('node', [bin, '--root', w.root, ...args], { encoding: 'utf8', input });

Given('the built CLI dist/bin.js and an empty project', () => {
  assert.ok(existsSync(bin), 'dist/bin.js is missing: run npm run build');
});
When('the built CLI runs {string}', (w, line: string) => { w.state.distOut = runBuilt(w, splitArgs(line)); });
Then('the built CLI output says {string}', (w, text: string) => { assert.match(w.state.distOut, new RegExp(text)); });
When('an MCP client calls the tool {string} with the title {string}, the body {string} and the status {string}', (w, name: string, title: string, body: string, status: string) => {
  const req = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { title, body, status } } };
  w.state.mcp = JSON.parse(runBuilt(w, ['mcp'], JSON.stringify(req) + '\n').trim());
});
Then('the MCP call succeeds and the ticket is created at status {string}', (w, status: string) => {
  assert.equal(w.state.mcp.result?.isError, undefined, JSON.stringify(w.state.mcp));
  assert.match(w.state.mcp.result.content[0].text, new RegExp(`"status": "${status}"`));
});

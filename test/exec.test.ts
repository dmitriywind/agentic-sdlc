import { test } from 'node:test';
import assert from 'node:assert/strict';
import { http, retryWait, setHttpTimeout, setSleep } from '../src/exec.ts';

/** Stubs fetch with the given responses in turn; returns the calls and the sleeps. */
async function withFetch(responses: [number, Record<string, string>?, string?][], fn: () => Promise<unknown>) {
  const real = globalThis.fetch;
  const calls: string[] = [], waits: number[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${url}`);
    const [status, headers = {}, body = '{"ok":true}'] = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(status === 204 ? null : body, { status, headers });
  }) as typeof fetch;
  const prev = setSleep(async (ms) => { waits.push(ms); });
  try { return { result: await fn().catch((e: Error) => e), calls, waits }; }
  finally { globalThis.fetch = real; setSleep(prev); }
}

test('http retries 429 and 5xx up to 3 tries, honouring Retry-After', async () => {
  const ok = await withFetch([[429, { 'retry-after': '2' }], [503], [200]], () => http('GET', 'https://h/x'));
  assert.deepEqual(ok.result, { ok: true });
  assert.deepEqual(ok.waits, [2000, 2000]); // Retry-After 2s, then backoff for attempt 2
  assert.equal(ok.calls.length, 3);

  const fail = await withFetch([[500], [502], [503], [200]], () => http('GET', 'https://h/x'));
  assert.match((fail.result as Error).message, /GET \/x -> 503/);
  assert.equal(fail.calls.length, 3);
});

test('http does not retry 4xx, nor 5xx on POST; 429 on POST retries', async () => {
  assert.equal((await withFetch([[404], [200]], () => http('GET', 'https://h/x'))).calls.length, 1);
  assert.equal((await withFetch([[500], [200]], () => http('POST', 'https://h/x', { body: {} }))).calls.length, 1);
  assert.deepEqual((await withFetch([[429], [200]], () => http('POST', 'https://h/x', { body: {} }))).result, { ok: true });
});

test('retryWait: seconds, HTTP date, backoff, 30s cap', () => {
  const now = Date.parse('2026-11-09T00:00:00Z');
  assert.equal(retryWait('5', 1, now), 5000);
  assert.equal(retryWait('Mon, 09 Nov 2026 00:00:10 GMT', 1, now), 10000);
  assert.equal(retryWait(null, 1, now), 1000);
  assert.equal(retryWait(null, 2, now), 2000);
  assert.equal(retryWait('3600', 1, now), 30000);
});

test('http aborts a request that never gets a response', async () => {
  const { createServer } = await import('node:http');
  const srv = createServer(() => {}).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const prev = setHttpTimeout(100);
  try {
    await assert.rejects(http('GET', `http://127.0.0.1:${(srv.address() as any).port}/x`));
  } finally { setHttpTimeout(prev); srv.closeAllConnections(); srv.close(); }
});

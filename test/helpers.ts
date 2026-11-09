import type { AdapterContext, Binding } from '../src/ports.ts';

export const binding = {
  version: 2,
  board: { adapter: 'local', options: {}, statuses: [], fields: { size: 'Size', priority: 'Priority' } },
  priorities: ['P0', 'High', 'Default', 'Low'],
  executors: { default: { kind: 'harness' } },
} as unknown as Binding;

/** A ctx whose exec/http record calls and answer from `answer(call)`. */
export function fakeCtx(root: string, options: Record<string, unknown>, answer: (c: string) => unknown, env: Record<string, string> = {}) {
  const calls: string[] = [];
  const ctx: AdapterContext = {
    root, binding, options, env,
    exec: (cmd, args) => { const c = [cmd, ...args].join(' '); calls.push(c); const r = answer(c); return typeof r === 'string' ? r : JSON.stringify(r ?? {}); },
    http: async (method, url, o) => { const c = `${method} ${url} ${o?.body ? JSON.stringify(o.body) : ''}`; calls.push(c); return answer(c) ?? {}; },
  };
  return { ctx, calls };
}

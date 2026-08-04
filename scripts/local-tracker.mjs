import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function initial() {
  return { revision: 0, tickets: [], events: [], published: [] };
}

async function readState(path) {
  try {
    return { ...initial(), ...JSON.parse(await readFile(path, 'utf8')) };
  } catch (error) {
    if (error.code === 'ENOENT') return initial();
    throw error;
  }
}

async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function resultKey(result) {
  return [result.ticket, result.run, result.revision, result.attempt, result.outcome].join(':');
}

export function createTracker({ root = process.cwd(), options = {} } = {}) {
  const path = resolve(root, options.path ?? '.agentic-sdlc/tracker.json');

  async function mutate(change) {
    const state = await readState(path);
    const result = await change(state);
    state.revision += 1;
    await writeState(path, state);
    return result;
  }

  return {
    async read() {
      const state = await readState(path);
      return { revision: String(state.revision), tickets: structuredClone(state.tickets) };
    },
    async transition(action) {
      return mutate((state) => {
        const ticket = state.tickets.find((item) => item.id === action.ticket);
        if (!ticket) throw new Error(`Unknown local ticket '${action.ticket}'`);
        if (ticket.stage === action.to) return;
        if (ticket.stage !== action.from) throw new Error(`Local ticket '${action.ticket}' changed stage`);
        ticket.stage = action.to;
        state.events.push({ type: 'transition', ...action, at: new Date().toISOString() });
      });
    },
    async publish(result) {
      return mutate((state) => {
        const key = resultKey(result);
        if (state.published.includes(key)) return;
        const ticket = state.tickets.find((item) => item.id === result.ticket);
        if (!ticket) throw new Error(`Unknown local ticket '${result.ticket}'`);
        if (ticket.revision !== result.revision) {
          const error = new Error(`Stale result for '${result.ticket}'`);
          error.code = 'STALE_RESULT';
          throw error;
        }
        ticket.evidence ??= [];
        ticket.conditions ??= [];
        ticket.attempts ??= {};
        ticket.retryAt ??= {};
        ticket.escalations ??= [];
        state.events.push({ type: 'result', ...result, at: new Date().toISOString() });
        if (result.outcome === 'completed') {
          if (result.nextRevision) {
            ticket.revision = result.nextRevision;
            ticket.evidence = [];
          }
          ticket.evidence = [...new Set([...ticket.evidence, ...(result.evidence ?? [])])];
        } else if (result.outcome === 'failed') {
          ticket.attempts[result.run] = result.attempt;
          if (result.retryAt) ticket.retryAt[result.run] = result.retryAt;
        } else {
          ticket.conditions = [...new Set([...ticket.conditions, 'waiting:decision'])];
          ticket.escalations = [...new Set([...ticket.escalations, `needs-human:${result.run}`])];
        }
        state.published.push(key);
      });
    },
    async escalate(action) {
      return mutate((state) => {
        const ticket = state.tickets.find((item) => item.id === action.ticket);
        if (!ticket) throw new Error(`Unknown local ticket '${action.ticket}'`);
        ticket.escalations ??= [];
        if (ticket.escalations.includes(action.reason)) return;
        ticket.escalations.push(action.reason);
        state.events.push({ type: 'escalation', ...action, at: new Date().toISOString() });
      });
    },
  };
}

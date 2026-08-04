---
name: agentic-sdlc
description: Install, configure, operate, or change a governed agentic software-delivery loop in which a tracker holds durable work state and interchangeable CLI agents perform bounded runs. Use for board-driven agent workflows, supervisor behavior, stage or waiting-condition changes, runner/tracker adapters, evidence contracts, or portability between projects, trackers, and agent CLIs.
---

# Agentic SDLC

Build one reproducible delivery loop without turning project documentation into a second
workflow engine.

Never run an agent in a human checkout. Planning uses a disposable detached worktree and
publishes its Markdown plan to the governing ticket; implementation uses an isolated branch
worktree and reports its committed pull request.

## Authorities

Keep each fact in exactly one place:

| Authority | Owns |
|---|---|
| `references/specification.md` | Portable process and adapter contracts |
| installed policy | Project stages, evidence, conditions, routes, limits, and adapters |
| tracker | Durable tickets, decisions, evidence, and delivery state |
| `scripts/` | Executable implementation of the specification |
| project rules | One short pointer to the installed policy and this skill |

Do not restate the process in READMEs, playbooks, personas, prompts, or runtime files.

## 1. Inspect

Read `references/specification.md`, the installed policy, and the configured project-rules
files. Inspect the live tracker and available agent CLIs through their normal tools.

Complete this step when the tracker vocabulary, adapters, routes, and human gates are known.

## 2. Install

Run:

```sh
node .agents/skills/agentic-sdlc/scripts/install.mjs --root .
```

The installer copies `assets/policy.template.json` only when no installed policy exists,
validates it, and owns the marked `## Agentic SDLC` block in configured project-rules files.
It never overwrites a configured policy.

Complete this step when the installer reports the policy path and every rules mirror contains
the same concise block.

## 3. Configure

Edit the installed policy:

- map tracker stages, conditions, transitions, and evidence;
- select tracker and runner adapter modules;
- map each run kind to a semantic route with a justified primary and ordered fallbacks;
- pin every profile's model identifier and reasoning effort;
- enable bounded stage-goal continuations and configure each profile's resume arguments;
- set concurrency, retry, review, and runtime limits;
- list protected paths and context sources.

For an optional LM Studio fallback behind Claude Code, read
[`references/lm-studio-fallback.md`](references/lm-studio-fallback.md).

Keep tracker- or CLI-specific behavior in adapters. Do not add provider names or project
vocabulary to the core.

Validate:

```sh
node .agents/skills/agentic-sdlc/scripts/validate.mjs agentic-sdlc-policy.json
```

Complete this step when validation passes and a read-only tick can derive the expected actions
from the live tracker without side effects.

## 4. Operate

Run one observable tick before starting the loop:

```sh
node .agents/skills/agentic-sdlc/scripts/supervise.mjs --policy agentic-sdlc-policy.json --once --read-only
```

Inspect the derived actions and terminal result. Remove `--read-only` for an intentional
mutating tick; then run without `--once` if continuous operation is wanted. Runtime files are
disposable diagnostics; deleting them must not change the next decision.

Review tracker execution evidence by semantic route: outcome, profile, model, effort, fallback
position, goal continuations, duration, and usage. Change routing or goal limits only from
repeated lane-specific evidence, then update the BDD contract.

Complete this step when the same tracker state produces no duplicate transition, publication,
or dispatch.

## 5. Handle human input

Put decisions, unresolved questions, approvals, and exhausted-run escalations on the governing
ticket. Block only that ticket and preserve its stage. Resume from tracker evidence after the
human acts.

Never invent an answer, hide a human wait in a local file, or use a persona as an authority.

Complete this step when the human can understand and resolve the wait without reading local
runtime state.

## 6. Change the process

Change the family atomically:

1. update `references/specification.md` only for portable behavior;
2. update `assets/process.feature` with the observable scenario;
3. update the installed policy for project-specific behavior;
4. run the BDD suite and observe the scenario fail;
5. make the smallest implementation change that passes it;
6. run the whole BDD and project checks.

Reject changes that merely duplicate an authority or expose implementation structure as a
public contract.

Complete this step when the BDD suite passes through `supervise().tick()`, project rules still
contain only the concise pointer, and no stale source of truth remains.

## Resources

- `references/specification.md` — read for installation, process changes, adapter work, or
  diagnosis.
- `assets/policy.template.json` — copy and configure per project.
- `assets/process.feature` — executable process examples; update before implementation.
- `scripts/` — install, validate, supervise, and test the portable implementation.

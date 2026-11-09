# agentic-sdlc

A software factory that any project installs to deliver value continuously. Agents triage,
shape, build, review and release work. Humans govern exceptions. The factory measures every
run and proposes fixes to itself.

- **Any board:** GitHub Projects, Jira, Linear, a local file, or an MCP server.
- **Any forge and VCS:** GitHub, GitLab (also Heptapod for Mercurial), Azure DevOps, Bitbucket,
  Helix Swarm for Perforce. Git, Mercurial, Perforce.
- **Any executor per stage:** the harness's own subagent, a command bot, a webhook bot, a managed
  agent, or a hosted coding agent by assignment.
- **Any product:** service, web, mobile, library, data, ML, infra, firmware, docs. Environments
  and proof kinds come from the binding.
- **Trunk-based, always.** One trunk, short-lived change lines in, release lines out.
- **No dependency on one machine.** Any scheduler runs the cycle: Claude scheduled tasks or
  managed agents, Codex, Cursor automations, Antigravity remote agents, a Grok bot, or CI cron.
  Agents without a shell use the `agentic-sdlc mcp` server.
- **Two profiles.** `individual` runs on subscriptions only. `enterprise` adds API keys, managed
  agents, bots, trace storage and a separate review app.

| Start here | |
|---|---|
| [Docs index](docs/README.md) | Every guide. |
| [Components](docs/architecture/components.md) and [flows](docs/architecture/flows.md) | Diagrams of the parts, trust boundaries, ticket lifecycle, cycle, review, release and learning. |
| [Claude](docs/ecosystems/claude-code.md), [Codex](docs/ecosystems/codex.md), [Cursor](docs/ecosystems/cursor.md), [Antigravity](docs/ecosystems/antigravity.md), [Grok](docs/ecosystems/grok.md), [any other](docs/ecosystems/generic.md) | Install and run in each ecosystem. |
| [Individual](docs/profiles/individual.md) and [enterprise](docs/profiles/enterprise.md) | Pick a profile. |
| [Forges](docs/forges.md) | What each forge keeps natively. |

## How it fits together

| Layer | Where | Holds |
|---|---|---|
| Process | `.agents/skills/` | Every rule: statuses, routing, the cycle, lanes, review, release, escalation, learning. |
| Binding | `.agents/binding.yml` | Every project value: board, forge, VCS, commands, paths, owners, model tiers, executors. |
| Ports | `agentic-sdlc` CLI and MCP server | Board, forge and VCS verbs, CI gates, dispatch, the run ledger, the bench. |

A scheduled agent loads the `sdlc` skill and runs one cycle. The skill routes each ticket to a
step skill and starts it with `agentic-sdlc dispatch`. Every hand-off goes through the board and
the forge. CI gates keep the guarantees an agent must not be trusted to keep.
[`references/architecture.md`](references/architecture.md) is the contract.

## Skills

| Skill | Tier | Does |
|---|---|---|
| `sdlc` | fast | The navigator: statuses, routing, the cycle, the hold, lanes, branches, executors. |
| `triage-signal` | fast | One raw signal to one decision: Backlog, Ideas or Cancelled. |
| `backlog-grooming` | balanced | Priority, dedupe, initiatives, decluttering. |
| `shape` | deep | Backlog to Ready: size, split, criteria with proof, lane, spec. |
| `implement-spec` | balanced | Proof first on one change line, then a draft CR. |
| `review-pr` | balanced | Independent review and verify, then ready plus auto-merge, or send back. |
| `release` | balanced | Choose what ships, set the version, cut the release line. |
| `escalate-to-human` | fast | Decide whether a person must act; hold the ticket with one structured ask. |
| `verify-ux` | balanced | Drive the built product as a user and attach evidence for `computer-use` criteria. |
| `judge-run` | binding | Run every scorer on each finished run. Hard facts and human grades win. |
| `improve-factory` | deep | Find the worst repeated failure and propose one factory change, with proof. |
| `bench` | balanced | Curate suites from your own merged work; compare models and executors on cost and quality. |

## Self-improvement

The factory is defined in code: skills, scorers, the binding (stages, executors, MCPs, models,
where each stage runs) and bench suites all live in the repo and change through factory CRs.

1. **Every run is recorded.** A ledger row in the heartbeat holds skill, skill hash, executor,
   model, cost, minutes, outcome, scores and a trace reference.
2. **Every run is scored.** Scorers in `.agents/scorers/` are LLM-judge rubrics such as
   `redundant-tests` or `scope-creep`. `judge-run` uses a different model than the run used. A
   human grade from an owner overrides the judge.
3. **Failures become factory fixes.** `improve-factory` counts failures by scorer and by error
   ("redundant-tests failed 37 times across 21 tickets") and proposes one change per run.
4. **Benchmarks come from your own work.** Suites are stratified by size and area. `bench report`
   shows quality against cost per model and marks the Pareto front, which sets the model mapping.
5. **Merge rules.** Class `tuning` (model tier mapping, clearer wording) can auto-merge when the
   bench and `skill-regression` are green. Class `guardrail` (every new rule, scorer, gate,
   executor or cycle number) waits for the factory owner's code-owner approval.
6. **Measures.** Automation rate, DORA, cycle time, first-pass rate, cost per CR and per delivered
   ticket, and the share of spend on scoring and bench.

## Intake

Work enters through the tools the team already uses. Any tool that creates a board item at
Signals with a `signal:<stream>` label is an intake: a chat bot, a tracker form, a CR comment
command, a monitoring alert. Product engineers put work in; factory engineers improve the factory.

## Install

```bash
npm i -D agentic-sdlc
```

```bash
npx agentic-sdlc init --profile individual --harness claude --board github --forge github --vcs git
```

```bash
npx agentic-sdlc doctor
```

`init` copies the skills, writes `.agents/binding.yml`, installs the gate templates for your forge
and adds a pointer to `AGENTS.md`. Fill in the binding, then run `doctor` until every port is ok.
Schedule the cycle as [`templates/runner/routine.md`](templates/runner/routine.md) says. See
[`docs/forges.md`](docs/forges.md) for what each forge keeps natively and what is approximated.

## CLI

```
agentic-sdlc init | validate | doctor
agentic-sdlc board  list|get|create|move|set|label|assign|comment|comments|close|child
agentic-sdlc forge  open|view|diff|list|ready|draft|sync|automerge|approve|comment|status|runs
agentic-sdlc vcs    start|head|changed|base|push|cut|tag|tags|drop|checkout-tests
agentic-sdlc gate   branch-names|linkage|factory-class|board-sync|shipped|signal-on-red|skill-regression
agentic-sdlc dispatch <skill> --ticket <id>
agentic-sdlc ledger runs|summary|hash
agentic-sdlc bench  build|propose|run|report|compare
agentic-sdlc mcp    [--http --port <p>]   (port verbs as MCP tools; HTTP needs AGENTIC_SDLC_MCP_TOKEN)
```

Every verb prints JSON. Exit 0 is success, 1 is a refused or failed action, 2 is a usage error.

## Development

```bash
npm install
```

```bash
npm run typecheck && npm test && npm run build
```

Node 22.18 or later. The only runtime dependency is `yaml`.

## License

Apache-2.0

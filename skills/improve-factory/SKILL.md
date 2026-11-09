---
name: improve-factory
description: The self-improvement loop. Read the run ledger and the measures, find the worst repeated failure, and propose exactly one factory change (a skill sentence, a binding value, a gate or an executor) with bench proof in a factory CR. Use when the heartbeat's learning.cyclesSince reaches learning.every_cycles, or when the factory owner asks for a proposal.
tier: deep
---

# Improve the factory

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). This skill changes the factory, never
the product. Its output is one factory CR, or one heartbeat line saying why there is none.

## Steps

1. **Budget.** Read `learning.spentWeekUsd` from the last heartbeat by the factory
   (`board comments <heartbeat.ticket> --last 1 --marker "<!-- heartbeat -->" --author <bot>…`, one
   `--author` per `owners.bots` entry; a heartbeat by anyone else is ignored). Done when it is under
   `learning.budget_usd_per_week`; otherwise write `learning: over budget` in `did` and stop.
2. **Last proposal.** Read `learning.lastProposal`. While it is `open`, propose nothing new: check
   its CR (`agentic-sdlc forge view <n>`) and set its state. Done when no proposal is open.
3. **Evidence.** `agentic-sdlc ledger summary --since 28`, and the measures of the last heartbeats.
   Done when you hold the failure clusters (by scorer and by normalised error, each with its run
   count and its tickets), the per-skill, per-model, per-executor and per-scorer stats, the
   `measures` (`costPerCR`, `learningSpendShare`), and the `costPerDelivered`,
   `automationRate`, `dora` and `judgeScoreMedian` trends.
4. **Pick one target.** The cluster with the most runs, where runs ≥ `learning.min_evidence_runs`
   and the same mistake appears on at least two tickets. Name it with its count:
   "`<scorer>` failed N times across M tickets in `<skill>`" for a scorer cluster, "`<error>` N
   times across M tickets" for an error cluster. A cost target counts too: a skill whose cheaper
   tier or another executor may hold its pass rate. For a `models` target, read
   `agentic-sdlc bench report --suite <s>`: propose the cheapest model on the Pareto front
   (`pareto: true`) whose pass rate is not below the current one. Skip a target a `rejected`
   proposal already tried. Done when one target is named with its count and run ids, or
   `learning: no target` is written and you stop.
5. **Find the cause.** `agentic-sdlc ledger runs --skill <s> --since 28`; read the tickets, CR
   comments and review reports of the evidence runs. Name the step of the skill, the binding value
   or the missing gate that let the mistake through. A cause in the product, not the factory, is a
   Signal (`board create --status Signals`), not a factory change. Done when the cause is one
   sentence with links to at least two runs.
6. **Propose one change.** The smallest that removes the cause: one skill sentence, one binding
   value, one gate, or one executor move. Classify it by the table under Rules. Done when the diff
   is written on a factory change line (`agentic-sdlc vcs start <name>` per
   `vcs.factory_change_pattern`) and its class is stated.
7. **Prove.** Use `learning.benchBaseline` when its factory is the trunk and its model and executor
   match; otherwise run the [`bench`](../bench/SKILL.md) on the trunk first. Then
   `agentic-sdlc bench run --model <id> --factory <change sha>` on the same cases (or
   `--executor <name>` for an executor move, `--model <new>` for a tier move), and
   `agentic-sdlc bench compare <baseline> <candidate>`. `--factory` runs the candidate's skills and
   its binding. Done when compare exits 0 on at least one shared case and the cost delta is no
   larger than the gain (pass-rate gain, or cost saved at the same pass rate).
   A binding-only change the bench cannot measure (`cycle.*`, `stall_minutes`, `parallel_agents`:
   one case runs one agent, with no cycle around it) is proved by the ledger instead, never by the
   bench alone: it is class `guardrail` (never automerged), and once merged it stays `open` in
   `learning.lastProposal` until the ledger holds at least `learning.min_evidence_runs` runs after
   it; then compare the target's measure before and after (`ledger summary --since <days>`) and
   open the revert when it got worse.
   Otherwise write `learning: not proven` with the compare JSON and stop.
8. **Open the CR.** `agentic-sdlc vcs push`; `agentic-sdlc forge open --source <b> --title <t> --body-file <f>`.
   The body holds the target with its count ("N runs across M tickets"), the cause with run
   links, the class, the compare JSON (or the `bench report` rows for a `models` change) and the
   `skill-regression` expectation. Class `tuning` in `learning.auto_merge_classes`:
   `agentic-sdlc forge automerge <n>`. Class `guardrail`: `forge comment <n>` asking
   `owners.factory` to decide; never automerge. Done when the CR is open with its proof and the
   right merge path.
9. **Record.** Set `learning.lastProposal` and, when you ran the trunk bench, `learning.benchBaseline`
   in the coming heartbeat; reset `learning.cyclesSince`. Done when both are in the heartbeat.

## Rules

- One change per run. Never bundle.
- A rule enters a skill only after the same mistake appears twice: two runs on two tickets. One
  run is a story, not evidence.
- The bench pass rate is the proof; the judge score only picks the target. A compare with zero
  shared cases proves nothing. A change the bench cannot exercise needs the ledger before/after proof.
- Evidence is heartbeats by `owners.bots` only (`ledger` filters them); a forged heartbeat never
  moves the budget, the cycle count or a target.
- No change may lower the bench pass rate, and none may raise cost by more than its gain.
- Merge classes. When unsure, the class is `guardrail`.

  | Class | Covers | Merge |
  |---|---|---|
  | `tuning` | The `models` tier mapping or a skill's `tier`; wording that makes an existing rule clearer and adds, widens or removes none. | Auto-merges when the bench compare and `skill-regression` are green and `tuning` is in `learning.auto_merge_classes`. |
  | `guardrail` | Any new rule; deleting or narrowing any rule; escalation triggers; `paths.lane_areas`, `paths.factory`; gates and `forge.required_checks`; non-negotiables; owners; `cycle.*`, `stall_minutes`, `parallel_agents` (the bench cannot measure them; see Prove); `executors` (moving a skill to another executor); every `learning.*` key; the judge rubric and every scorer in `.agents/scorers/` (adding, changing or deleting one), the bench, its suites, the ledger and their code. | Always waits for `owners.factory`. |

- The loop never edits what grades it in the same CR as what it grades: a change to `judge-run`,
  a scorer, `bench`, `src/ledger.ts`, `src/bench.ts`, the bench cases or a suite is its own
  guardrail CR.
- A human grade (a `by: human` rescore) outranks the judge as evidence. When human grades and
  the judge disagree on a scorer for more than a third of the graded runs, the target is that
  scorer's rubric (a guardrail change), not the skill.
- Stop at `learning.budget_usd_per_week`. Report the spend in `learning.spentWeekUsd`.

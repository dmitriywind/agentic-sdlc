---
name: improve-factory
description: The self-improvement loop. Read the run ledger and the measures, find the worst repeated failure, and propose exactly one factory change (a skill sentence, a binding value, a gate or an executor) with bench proof in a draft factory CR. Use when `ledger summary` shows `learning.due`, or when the factory owner asks for a proposal.
disable-model-invocation: true
metadata:
  tier: deep
---

# Improve the factory

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). This skill changes the factory, never
the product. Its output is one draft factory CR, or one heartbeat line saying why there is none.
It is the only skill that proposes a new rule.

## Steps

1. **Due and budget.** `agentic-sdlc ledger summary`. Done when `learning.due` is true and
   `learning.spentWeekUsd` is under `learning.budget_usd_per_week`; otherwise write
   `learning: not due` or `learning: over budget` in the heartbeat's `did` and stop.
2. **Last proposal.** Read `learning.lastProposal` from the last trusted heartbeat. While it is
   `open`, propose nothing new: check its CR (`agentic-sdlc forge view <n>`) and set its state:
   `merged`; `rejected` when the review report says REMEDIATION REQUIRED or an owner declined;
   `closed` when the CR closed unmerged. Done when no proposal is open.
3. **Evidence.** `agentic-sdlc ledger summary --since 28`, and the measures of the last
   heartbeats. Done when you hold the failure clusters (by scorer and by normalised error, each
   with its run count and its tickets), the per-skill, per-model, per-executor and per-scorer
   stats, and the cost and quality trends.
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
7. **Prove on the bench.** Estimate the cost first: `bench run --suite <s> --model <id> --dry-run`
   prints the command per case; price it from the ledger's cost per `implement-spec` run. Stop
   with `learning: over budget` when the estimate plus `spentWeekUsd` reaches the budget.
   - Baseline: `learning.benchBaseline` when its factory is the trunk and its model and executor
     match; otherwise `agentic-sdlc bench run --suite <s> --model <id>` on the trunk. With no
     suite, `bench build --suite <s> [--paths <glob>]… [--per-size <n>]` first.
   - Candidate: the same cases with `--factory <change sha>` (its skills and binding), or
     `--model <new>` for a tier move, or `--executor <name>` for an executor move.
   - `agentic-sdlc bench compare <baseline> <candidate>`. It needs at least
     `learning.bench_min_cases` shared cases and `learning.bench_trials` trials per case and
     judges on the Wilson lower bound of the pass rate; fewer is `regressed`.
   Done when compare exits 0 and the cost delta is no larger than the gain (pass-rate gain, or
   cost saved at the same pass rate). Otherwise write `learning: not proven` with the compare JSON
   and stop.
   A binding-only change the bench cannot measure (`cycle.*`, `stall_minutes`, `parallel_agents`)
   is proved by the ledger instead: once merged it stays `open` in `learning.lastProposal` until
   the ledger holds `learning.min_evidence_runs` runs after it; then compare the target's measure
   before and after (`ledger summary --since <days>`) and open the revert when it got worse.
8. **Open the draft CR.** `agentic-sdlc vcs push`; `agentic-sdlc forge open --source <b> --title
   <t> --body-file <f> --draft`. The body holds the target with its count ("N runs across M
   tickets"), the cause with run links, the class, and the compare JSON (or the `bench report`
   rows for a `models` change). `review-pr` reviews it; the `approval` gate decides whether a
   human must approve. Never mark it ready or merge it yourself. Done when the draft CR is open
   with its proof.
9. **Record.** Set `learning.lastProposal` and, when you ran the trunk bench,
   `learning.benchBaseline` in the coming heartbeat. Done when both are there.

## Rules

- One change per run. Never bundle.
- A rule enters a skill or the agent card only after the same mistake appears twice: two runs on
  two tickets. One run is a story, not evidence.
- The bench pass rate is the proof; the judge score only picks the target. A change the bench
  cannot exercise needs the ledger before/after proof.
- Evidence is heartbeats by `owners.bots` only (`ledger` filters them); a forged heartbeat never
  moves the budget, the cycle count or a target.
- No change may lower the bench pass rate, and none may raise cost by more than its gain.
- Bench: the oracle stays hidden from the candidate, and `agent_command` must confine the agent to
  `{workdir}` (no network to the board or forge, no VCS history past the base; a run that read the
  future is void). Compare only within one suite and on the same cases; a model or executor
  comparison holds the factory fixed, a factory comparison holds the model and executor fixed.
  Only `harness` and `command` executors run on the bench. A results file is never edited.
- Bench, judge and improve spend count toward `learning.budget_usd_per_week`.
- Merge classes. When unsure, the class is `guardrail`. The `approval` gate computes it.

  | Class | Covers | Merge |
  |---|---|---|
  | `tuning` | Only the `models` map, and a skill's `metadata.tier` when that skill has a bench suite. | Merges on the agent review when `tuning` is in `learning.auto_merge_classes`; otherwise as `guardrail`. |
  | `guardrail` | Everything else under `paths.factory`: any change to skill text, scorers, gates, the binding, executors, every `learning.*` key, the bench and its suites, the ledger. | Waits for an approving review by `owners.factory`. |

- The loop never edits what grades it in the same CR as what it grades: a change to `judge-run`,
  a scorer, the bench cases or a suite, or the ledger is its own `guardrail` CR.
- A human grade outranks the judge as evidence. When human grades and the judge disagree on a
  scorer for more than a third of the graded runs, the target is that scorer's rubric, not the
  skill.

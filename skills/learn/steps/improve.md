# Improve the factory

Follow the [contract](../../sdlc/references/contract.md). It is the only step that proposes a new
rule. Its output is one draft factory CR, or one heartbeat line saying why there is none.

1. **Due.** `ledger summary`. Done when `learning.due` is true or the Factory owner asked; otherwise
   write `learning: not due` and stop.
2. **Last proposal.** Read `learning.lastProposal` from the last trusted heartbeat. While it is
   `open`, propose nothing new: read its CR (`forge view <n>`) and set it to `merged`, `rejected`
   (a fail verdict, or an owner declined) or `closed` (closed unmerged). Done when no proposal is
   open.
3. **Evidence.** `ledger summary --since 28`. Done when you hold the failure clusters (by scorer and
   by normalised error, each with its run count and tickets), the stats per step, model, executor
   and scorer, and the time and quality trends. `unscorable` runs are in no cluster and no count; a
   scorer unscorable on most of its runs is itself a finding.
4. **Target.** The cluster with the most runs, at least `learning.min_evidence_runs`, with the same
   mistake on at least two tickets: "`<scorer>` failed N times across M tickets in `<step>`", or
   "`<error>` N times across M tickets". A cost target counts too: a step whose cheaper tier or
   another executor may hold its pass rate; for a `models` target read `bench report --suite <s>`
   and take the fastest model on the Pareto front (`pareto: true`) whose pass rate is not lower.
   Skip a target a `rejected` proposal tried. Done when one target is named with its count and run
   ids, or `learning: no target` is written and you stop.
5. **Cause.** `ledger runs --skill <s> --since 28`; read the tickets, CR comments and verdicts of
   the evidence runs. Name the step, the binding value or the missing gate that let the mistake
   through. A cause in the product is a Signal (`board create … --status Signals`), not a factory
   change. Done when the cause is one sentence with links to at least two runs.
6. **Change.** The smallest that removes the cause: one skill sentence, one binding value, one gate
   or one executor move, on a factory change line (`vcs start <name>` per
   `vcs.factory_change_pattern`). Done when the diff is written there.
7. **Prove.** `bench run --suite <s> --model <id> --dry-run` prints the plan. Stop with `learning:
   too few cases` below `learning.bench_min_cases`, and with `learning: over bench budget` and the
   numbers when one bench run exceeds `learning.bench_budget.max_runs`; never pass
   `--allow-over-budget`.
   - Baseline: `learning.benchBaseline` when its factory is the trunk and its model and executor
     match; otherwise `bench run --suite <s> --model <id>` on the trunk (with no suite, `bench build
     --suite <s>` first).
   - Candidate: the same cases with `--factory <change sha>`, `--model <new>` or `--executor
     <name>`.
   - `bench compare <baseline> <candidate>`.
   A binding value the bench cannot measure (`cycle.*`, `stall_minutes`, `parallel_agents`) is
   proved by the ledger instead: once merged it stays `open` until `learning.min_evidence_runs` runs
   follow it, then its target measure is compared before and after (`ledger summary --since
   <days>`), and a worse one gets a revert CR. Done when compare exits 0, or `learning: not proven`
   is written with the compare output and you stop.
8. **Open.** `vcs push`; `forge open --source <b> --title <t> --body-file <f> --draft`. The body
   holds the target with its count, the cause with run links, what the change touches, and the
   compare output (or the `bench report` rows). The approval gate classifies it; `review/review`
   reviews it. Done when the draft CR is open.
9. **Record.** One `board comment <heartbeat.ticket> --kind heartbeat --body-file <f>`, the body a
   JSON object with `kind: learn`, `at`, `factory` (the `sha` of `vcs head`), `errors`, `runs` with
   your own run row (the fields of the navigator's Report step, its minutes including the bench), and
   `learning` with `lastProposal` and, when you ran the trunk bench, `benchBaseline`. Done when it is
   posted.

## Rules

- One change per run; never bundle.
- A rule enters a skill or the agent card only after the same mistake appears on two runs of two
  tickets. One run is a story, not evidence.
- The bench pass rate is the proof; the judge score only picks the target. No change may lower the
  pass rate.
- Bench: the oracle stays hidden from the candidate, and `agent_command` confines the agent to
  `{workdir}`; a run that read the future is void. Compare within one suite on the same cases; a
  model or executor comparison holds the factory fixed, and a factory comparison holds the model
  and executor fixed. A results file is never edited.
- When human grades and the judge disagree on a scorer for more than a third of the graded runs,
  the target is that scorer's rubric, not the step.

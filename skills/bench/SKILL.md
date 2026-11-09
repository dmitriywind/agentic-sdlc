---
name: bench
description: Build suites of benchmark cases from the project's own merged tickets (stratified by Size and area), run them with each change's own new proofs as the hidden oracle, to compare pass rate, cost and minutes across models, executors and factory versions, and report the cost-quality Pareto front. Use when improve-factory needs proof for a change, when the factory owner asks which model or executor should hold a tier or skill, or when the cases file is missing or older than the last bench_size merged tickets.
tier: fast
---

# Run the bench

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). The bench replays past tickets
headless; it never touches the live board or forge beyond reading them.

## Steps

1. **Build a suite.** `agentic-sdlc bench build --suite <name> [--paths <glob>]… [--per-size <n>] [--limit <n>]`
   (default limit `learning.bench_size`). A case is a Done ticket whose merged CR added proof
   files (tests, eval cases, data checks): its spec (the newest `spec_marker` comment by
   `owners.bots`, `owners.product` or `owners.factory`; a spec comment by anyone else is
   ignored), the CR's base and head, those files as the oracle, its Size and its area (the most
   touched directory). `--paths` keeps CRs that touched a matching file; `--per-size` takes up
   to n cases per Size, spread from the oldest merge to the newest. Without `--suite` it writes
   `.agents/bench/cases.json` as before. To grow a suite from the factory's own judgement,
   `agentic-sdlc bench propose --suite <name> [--n <k>]` prints k diverse cases (sizes and areas)
   that no suite holds yet, writing nothing; add the ones that represent the project to
   `.agents/bench/suites/<name>.json` in a factory CR (`guardrail`). Done when the suite file holds
   at least one case and each has a non-empty `oracleTests`.
2. **Check the cost.** `agentic-sdlc bench run --model <id> --dry-run` prints the command per case.
   Estimate cost from the ledger's cost per `implement-spec` run of that model. Done when the
   estimate plus `learning.spentWeekUsd` is under `learning.budget_usd_per_week`; otherwise report
   and stop.
3. **Run.** `agentic-sdlc bench run --suite <s> --model <id> [--factory <rev>] [--cases <ids>]`, or
   `--executor <name|json>` to compare executors. `--factory <rev>` takes both the skills and the
   binding from `<rev>`. Each case gets a detached tree at its base outside the repo root (`vcs`
   snapshot; a VCS without it cannot bench); the agent gets only the spec and the `implement-spec`
   skill. After it stops, a fresh tree at the base takes the agent's edits on product paths only;
   proof files and verify config (`paths.verify_config_pattern`, default: manifests, lockfiles,
   test config, `.agents/`) come from the CR head with the oracle, and `commands.install` then
   `commands.verify` there decide the pass. Each case row names a `scorerInput` file (the prompt
   and every changed file before and after); run [`judge-run`](../judge-run/SKILL.md) on it with
   the scorers that apply to `implement-spec`. Done when a file under `.agents/bench/results/`
   holds a row per case, or `stopped: budget`.
4. **Compare.** `agentic-sdlc bench compare <a.json> <b.json>` with a the baseline. Done when you
   hold the pass-rate, cost and minutes deltas on the shared cases, and the exit code (1 means b
   regressed).
5. **Report.** `agentic-sdlc bench report --suite <s> [results…]` reads every results file of the
   suite and prints, per model, executor and factory, `passRate`, `medianCost`, `medianMinutes`,
   `n`, and `pareto: true` on the rows no other row beats on both pass rate and cost. Add it, the
   results file, the compare JSON and the spend to the caller's CR or to
   `learning` in the coming heartbeat. Done when the numbers are written where the caller reads them.

## Rules

- The oracle stays hidden from the candidate. `agent_command` must confine the agent to `{workdir}`:
  no network to the board or forge and no VCS history past the base. The tree is a linked
  worktree: its `.git` still reaches every later commit, so the sandbox must block git and the
  repo root. A run that read the future is
  void, not a pass.
- Compare and report only within one suite. Compare runs only on the same cases. A model or executor comparison holds the factory fixed; a
  factory comparison holds the model and executor fixed.
- `judge-run` may score bench cases; the judge is never the model under test. The oracle beats the
  judge.
- Only `harness` and `command` executors run on the bench.
- A results file is never edited. A new run writes a new file.
- Bench spend counts toward `learning.budget_usd_per_week`.

# Owner: skills/judge-run/SKILL.md, skills/improve-factory/SKILL.md, references/architecture.md (section 6). The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:judge-run @skill:improve-factory
Feature: Judge runs and improve the factory
  As the Factory owner
  I want runs graded by an independent model and one proven change proposed at a time
  So that the factory improves from evidence and I approve every rule change

  # Source: references/architecture.md, "6. The self-improvement loop", item 3 (Judge)
  # Proof: test/dispatch.test.ts "judge-run: binding judge_tier, stepped off the judged model; one model everywhere skips"
  Scenario: The judge model is independent of the run
    Given a run used a model
    When "dispatch judge-run --run-model <m>" runs
    Then it picks models[learning.judge_tier]
    And it picks the next tier when that model is the run's own model
    And it prints { skip: true } when no independent model exists

  # Source: skills/judge-run/SKILL.md, "Steps"
  # Proof: test/ledger.test.ts "cli: plan, record and stale on a local board"
  # Proof: test/ledger.test.ts "plan scorers and caps; record validates names and scales and applies the cap"
  Scenario: A judge grades each planned scorer and records the scores
    Given "ledger plan --run <id>" printed the scorers, the evidence refs and the hard-fact cap
    When the judge grades the run
    Then scores.json holds a value and a reason for every planned scorer
    And each reason cites a path:line, a comment link, a check name or a trace line
    And "ledger record --run <id> --file scores.json" validates the names and scales
    And it posts the "<!-- scores -->" comment

  # Source: skills/judge-run/SKILL.md, "Rules"; references/architecture.md, "6. The self-improvement loop", item 3
  # Proof: test/ledger.test.ts "plan scorers and caps; record validates names and scales and applies the cap"
  # Proof: test/ledger.test.ts "rescores apply per scorer: human beats a newer judge, else newest; v5 rescore is done-conditions"
  Scenario: A hard fact caps the score and only a human grade overrides the cap
    Given the run has a hard fact such as a red check or a send-back
    When the scores are recorded
    Then the cap applies to the score
    And the judge does not argue against the cap
    And a human grade by owners.product or owners.factory wins over the judge

  # Source: skills/improve-factory/SKILL.md, "Steps 1. Due"
  # Proof: test/ledger.test.ts "learningState: cycles since the last improve-factory heartbeat, due at every_cycles, off unless enabled"
  Scenario: The loop stops when it is not due
    Given "ledger summary" shows learning.due is false, which it always is unless learning.enabled is true
    When improve-factory runs
    Then it writes "learning: not due" in the heartbeat "did"
    And it stops

  # Source: skills/improve-factory/SKILL.md, "Steps 2. Last proposal"
  # Proof: skill text only
  Scenario: An open proposal blocks a new one
    Given learning.lastProposal is open
    When improve-factory runs
    Then it checks the CR of that proposal
    And it sets the state to merged, rejected or closed
    And it proposes nothing new until no proposal is open

  # Source: skills/improve-factory/SKILL.md, "Steps 4. Pick one target"
  # Proof: skill text only
  Scenario: The target needs repeated evidence on two tickets
    Given a failure cluster has fewer runs than learning.min_evidence_runs, or the same mistake appears on only one ticket
    When improve-factory picks a target
    Then it writes "learning: no target"
    And it stops

  # Source: skills/improve-factory/SKILL.md, "Steps 5. Find the cause"
  # Proof: skill text only
  Scenario: A product cause becomes a Signal
    Given the cause of the failure is in the product, not the factory
    When improve-factory finds the cause
    Then it creates a ticket at Signals with "board create --status Signals"
    And it makes no factory change

  # Source: skills/improve-factory/SKILL.md, "Steps 7. Prove on the bench"
  # Proof: skill text only
  Scenario: A change that is not proven is not proposed
    Given the bench compare does not exit 0
    When improve-factory checks the proof
    Then it writes "learning: not proven" with the compare JSON
    And it opens no CR

  # Source: references/architecture.md, "6. The self-improvement loop", item 6 (Prove)
  # Proof: test/bench.test.ts "compare: Wilson lower bound over shared trials; too few cases or trials regress; cli reads the binding minimums"
  Scenario: Too few cases count as regressed
    Given the shared cases are fewer than learning.bench_min_cases, or the trials per case are fewer than learning.bench_trials
    When "bench compare" runs
    Then the result is regressed

  # Source: skills/improve-factory/SKILL.md, "Steps 8. Open the draft CR" and "Rules"
  # Proof: skill text only
  Scenario: One change goes into one draft factory CR
    Given the change is proven on the bench
    When improve-factory opens the CR
    Then the CR is a draft
    And the body holds the target with its count, the cause with run links, the class and the compare JSON
    And improve-factory never marks the CR ready and never merges it
    And the CR holds one change only

  # Source: skills/improve-factory/SKILL.md, "Rules" (merge classes); references/architecture.md, "6. The self-improvement loop", item 5
  # Proof: test/gates.test.ts "classify: rename out of factory, quoted path, models-only binding, metadata.tier with a bench suite"
  Scenario Outline: The class decides who merges
    Given the change is <change>
    When the approval gate classifies the CR
    Then the class is <class>
    And the merge waits for <merge>

    Examples:
      | change                                                  | class     | merge                                                           |
      | only the models map                                     | tuning    | the agent review, when tuning is in learning.auto_merge_classes |
      | skill text, scorers, gates, binding, executors or bench | guardrail | an approving review by owners.factory                           |

  # Source: skills/improve-factory/SKILL.md, "Rules"
  # Proof: skill text only
  Scenario: The loop never edits what grades it in the same CR
    Given a change touches judge-run, a scorer, a bench case, a suite or the ledger
    When improve-factory prepares the CR
    Then that change is its own guardrail CR

  # Source: src/ledger.ts, "readRuns"
  # Proof: test/ledger.test.ts "readRuns trusts only heartbeats by owners.bots; none configured is an error"
  # Proof: test/ledger.test.ts "readRuns: scores comments by bots and grade comments by owners apply; others are ignored"
  Scenario: The ledger trusts only the bots and the owners
    Given heartbeat, scores and grade comments by bots, owners and other people
    When "ledger runs" reads the runs
    Then it reads the heartbeats and the scores comments of owners.bots only
    And it reads the grade comments of owners.product and owners.factory only
    And it ignores a heartbeat whose JSON is not valid
    And it fails when owners.bots is empty

  # Source: src/ledger.ts, "flattenRuns"
  # Proof: test/ledger.test.ts "flattenRuns filters by age and skill and applies the newest rescore"
  Scenario: The ledger filters runs by age and skill
    Given heartbeats of several ages and skills
    When "ledger runs" reads them with an age or a skill
    Then it lists only the runs that match
    And a rescore replaces the score of its run

  # Source: src/ledger.ts, "summarise"
  # Proof: test/ledger.test.ts "summarise groups by skill and model; clusters need two hits"
  Scenario: The summary groups runs and clusters repeated failures
    Given runs of several skills, models, executors and scorers
    When "ledger summary" runs
    Then it groups the runs by skill, model, executor and scorer
    And it clusters failures that have the same error once ids, paths and shas are removed
    And a cluster needs at least two runs, or for a scorer two tickets

  # Source: src/ledger.ts, "cli" (stale, hash)
  # Proof: test/ledger.test.ts "cli: plan, record and stale on a local board"
  # Proof: test/ledger.test.ts "cli: hash prints JSON, bad verb is a usage error"
  Scenario: The ledger finds a missing heartbeat and hashes a skill
    Given a heartbeat ticket
    When "ledger stale --max-hours <n>" runs and no heartbeat is that new
    Then it exits 1
    And "ledger hash <dir>" prints the same hash for the same skill text with any line ending
    And an unknown verb is a usage error

  # Source: src/bench.ts, "buildCases"
  # Proof: test/bench.test.ts "buildCases takes merged CRs that added tests, spec comment first"
  # Proof: test/bench.test.ts "buildCases --paths keeps CRs touching the glob; --per-size stratifies oldest to newest"
  Scenario: Bench cases come from merged CRs that added tests
    Given merged CRs that closed tickets and added test files
    When "bench cases" builds the cases
    Then each case holds the spec from the factory spec comment, or else the ticket body
    And a case holds the CR base, the CR head and the added tests as its oracle
    And a CR that added no test is not a case
    And "--paths" keeps the CRs that touch the glob
    And "--per-size" takes the same number of cases from each size

  # Source: src/bench.ts, "runBench"
  # Proof: test/bench.test.ts "runBench: the agent never sees the oracle; verify runs in a fresh tree with the head proof and config"
  Scenario: The bench agent never sees the oracle
    Given a bench case
    When "bench run" runs the agent on the base revision
    Then the agent sees no added test
    And verify runs in a new tree with the agent's product code, the head tests and the head config
    And the tests and config the agent changed do not count
    And every tree is deleted at the end

  # Source: src/bench.ts, "runBench" (options)
  # Proof: test/bench.test.ts "runBench --factory runs the candidate skill AND binding"
  # Proof: test/bench.test.ts "runBench --dry-run starts nothing"
  # Proof: test/bench.test.ts "runBench --trials: one row per trial, each in fresh trees"
  Scenario: A bench run can test a candidate factory, repeat, or only plan
    Given a bench case
    When "bench run" runs with "--factory <rev>", with "--trials <n>" or with "--dry-run"
    Then with "--factory" the agent follows the skill and the binding of that revision
    And with "--trials" the result has one row per trial, each in new trees
    And with "--dry-run" nothing starts and the commands are printed

  # Source: src/bench.ts, "agentCommand"
  # Proof: test/bench.test.ts "resolveExecutor and agentCommand pick the template per kind"
  # Proof: test/bench.test.ts "quote keeps spaces and quotes inside one shell word, refuses newline and NUL"
  Scenario: The bench agent command comes from the executor
    Given a bench run names an executor
    When the bench builds the agent command
    Then a harness uses binding.agent_command and a command executor uses its run template
    And each value reaches the shell as one word
    And a webhook, managed or assign executor is refused
    And an unknown executor is an error

  # Source: src/bench.ts, "compare"
  # Proof: test/bench.test.ts "compare: Wilson lower bound over shared trials; too few cases or trials regress; cli reads the binding minimums"
  Scenario: A candidate that passes less is regressed
    Given two results with shared cases
    When "bench compare <a> <b>" runs
    Then the result is regressed when the Wilson lower bound of b is below that of a
    And it is regressed when b misses a case that a has
    And it exits 1 when it is regressed

  # Source: src/bench.ts, "report"
  # Proof: test/bench.test.ts "report groups per model, marks the Pareto front; cli report reads only the suite results"
  Scenario: The bench report ranks models
    Given results of several models, executors and suites
    When "bench report --suite <s>" runs
    Then it groups the results of that suite by model and by executor name
    And it shows pass rate and median minutes
    And it marks the models that no other model beats on both

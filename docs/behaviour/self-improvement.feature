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

  # Source: src/ledger.ts, "byScorer", "scoresComment"; skills/judge-run/SKILL.md, "Rules"
  # Proof: test/ledger.test.ts "unscorable: needs a reason, is counted per scorer, and is left out of rates, medians, clusters and the cap"
  Scenario: A judge with too little evidence grades unscorable
    Given a scorer whose evidence refs are missing or unreadable
    When the judge records the value "unscorable" with a reason
    Then recording without a reason fails
    And "ledger summary" shows "unscorable: n" for the scorer
    And the value is left out of medians, failure rates, failure clusters and the hard-fact cap
    And a human grade may be "unscorable" too

  # Source: src/ledger.ts, "scoresComment" and "applyRescores"; skills/judge-run/SKILL.md, "Rules"
  # Proof: test/ledger.test.ts "unscorable: done-conditions is refused while a hard fact caps the run, and a human unscorable grade on a failed run is ignored"
  Scenario: A capped run is never unscorable for done-conditions
    Given a run that failed, timed out, hit a cap or has a red check on its head
    When the judge records "unscorable" for done-conditions
    Then "ledger record" exits 1 and names the hard fact
    And a human "unscorable" grade for done-conditions on that run is ignored

  # Source: src/ledger.ts, "measures", "changeFailures"; references/architecture.md, "6. The self-improvement loop", item 8
  # Proof: test/ledger.test.ts "measures: DORA from the board and forge, null with a why, and the error budget"
  Scenario: The ledger computes DORA measures and the error budget from the board and the forge
    Given tickets shipped, P0 bugs and failed-deploy Signals, and review reports on merged CRs
    When "ledger measures --days <n>" runs
    Then it prints deploy frequency, lead time, change failure rate, time to restore and rework rate with their counts
    And a measure the data cannot give is null with a "why"
    And with product.slo set it prints errorBudget with max, actual and exhausted
    And only review-pr reports by owners.bots count toward rework
    And with failures in the window and no change shipped, actual is null with a "why" and exhausted is true

  # Source: scorers/spec-quality.md, scorers/triage-accuracy.md
  # Proof: skill text only
  Scenario: Shape and triage runs have scorers
    Given a run of "shape" or "triage-signal"
    When "ledger plan --run <id>" lists its scorers
    Then "spec-quality" applies to shape and "triage-accuracy" to triage-signal
    And the evidence names the ticket, since the run has no CR

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

  # Source: src/bench.ts, "runBench" (budget); learning.bench_budget
  # Proof: test/bench.test.ts "runBench budget: over max_runs refuses before any case starts unless allowed; max_minutes skips the rest, never as failures"
  # Proof: test/bench.test.ts "agentCommand fills the stage caps into a command executor, empty when unset"
  Scenario: A bench run stays inside its budget
    Given learning.bench_budget sets max_runs and max_minutes
    When "bench run" plans more runs than max_runs
    Then it refuses unless "--allow-over-budget" is given
    And after max_minutes no new case starts and the rest are recorded "skipped: budget"

  # Source: src/bench.ts, "compare" and "report"
  # Proof: test/bench.test.ts "compare and report: a result with budget-skipped cases is incomplete, never a pass"
  Scenario: A result with budget-skipped cases is incomplete
    Given a bench result with cases skipped on budget
    When it is compared or reported
    Then compare is regressed with an insufficient reason
    And report leaves it off the Pareto front

  # Source: src/telemetry.ts, "otlpTraces"
  # Proof: test/telemetry.test.ts "otlpTraces: one trace per heartbeat, a workflow root and one invoke_agent span per run, with the GenAI attribute names"
  Scenario: Runs export as OpenTelemetry GenAI spans
    Given a heartbeat with run rows
    When "ledger export --format otlp" runs
    Then it prints one OTLP/HTTP JSON document with one trace per heartbeat
    And each run is an "invoke_agent <skill>" span with gen_ai.agent.name, gen_ai.agent.version and gen_ai.request.model
    And a run that did not end done is an error span with error.type set to its outcome
    And the run's ticket, CR, executor, tier, tokens and scores are agentic_sdlc.* attributes and gen_ai.evaluation.result events
    And a row's single token total is never split into input and output tokens

  # Source: src/telemetry.ts, "traceId" and "spanId"
  # Proof: test/telemetry.test.ts "otlpTraces: ids are a hash of the cycle and run ids, so a re-export is the same document"
  # Proof: test/telemetry.test.ts "exportRows: --since takes days or an ISO time and --run names one run"
  Scenario: A re-export is the same document
    Given the same heartbeats exported twice, or exported with --since or --run
    Then trace and span ids are a hash of the heartbeat and run ids
    And the rows are in time order, so the document is byte-identical

  # Source: src/telemetry.ts, "cdEventsFromRuns"
  # Proof: test/telemetry.test.ts "cdEventsFromRuns: taskrun finished per run, change created once per CR, change reviewed for a done review"
  Scenario: Runs export as CDEvents
    Given a heartbeat with implement-spec and review-pr runs on a CR
    When "ledger export --format cdevents" runs
    Then it prints one CDEvent per line: taskrun finished per run, change created for the first implement-spec run of each CR and change reviewed for each done review-pr run
    And an event whose required field the ledger cannot fill (taskrun started, pipelinerun) is not printed

  # Source: src/telemetry.ts, "sinkOf", "sendOtlp" and "sendCdEvent"
  # Proof: test/telemetry.test.ts "delivery: nothing is sent unless the binding names the env vars; headers come from headers_env"
  # Proof: test/telemetry.test.ts "delivery: OTLP posts to <endpoint>/v1/traces and a CDEvent as a CloudEvents binary request"
  # Proof: test/telemetry.test.ts "ledger export: otlp and cdevents print to stdout, write --out, and --send posts through ctx.http"
  Scenario: Nothing is sent unless the binding says where
    Given the binding has no telemetry keys
    Then "ledger export --send" refuses and nothing is posted, also when there are no events to send
    When telemetry.otlp_endpoint_env or telemetry.cdevents_sink_env names an env var that holds a URL
    Then "ledger export --send" posts the document to "<url>/v1/traces", or each CDEvent as a CloudEvents binary-mode request
    And the headers come from the env var telemetry.headers_env names

  # Source: src/telemetry.ts, "sinkOf"
  # Proof: test/telemetry.test.ts "delivery: a malformed sink or one with credentials is refused, naming only the env var"
  Scenario: A sink URL that is malformed or holds credentials is refused
    Given the env var a telemetry key names holds a value that is not an http or https URL, or a URL with a user name or password
    When a document or an event would be sent
    Then it fails with a message that names the env var and never shows the value
    And the credentials belong in the env var telemetry.headers_env names

  # Source: src/binding.ts, "telemetry"
  # Proof: test/telemetry.test.ts "validate: telemetry keys name env vars, never URLs"
  Scenario: The binding holds env var names, never URLs
    Given telemetry.otlp_endpoint_env is a URL
    When "validate" runs
    Then it reports that the key must be the name of an env var

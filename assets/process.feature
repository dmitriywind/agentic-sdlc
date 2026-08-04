Feature: Portable governed delivery
  A policy-driven supervisor advances work only from durable tracker evidence.

  Background:
    Given a valid installed policy
    And in-memory tracker and runner adapters

  Scenario: Complete normal work from triage through merge
    Given ticket "WORK-1" is in "Backlog" without "triage-ready"
    When the supervisor ticks
    Then run "triage" is dispatched for ticket "WORK-1"
    When that run completes with evidence "triage-ready"
    And the supervisor ticks
    Then the result is published before the tracker is read
    And ticket "WORK-1" transitions from "Backlog" to "Ready"
    And no run for "Ready" is dispatched from the stale snapshot
    When the supervisor continues from fresh snapshots
    Then runs "plan", "execute", and "review" are dispatched in order
    And ticket "WORK-1" reaches "Done" with current "change-merged" evidence

  Scenario: A blocking condition preserves the current stage
    Given ticket "WORK-1" is in "In progress" without "change-open"
    And ticket "WORK-1" has condition "waiting:decision"
    When the supervisor ticks
    Then no run is dispatched for ticket "WORK-1"
    And ticket "WORK-1" remains in "In progress"

  Scenario: User input resumes the run owed by the preserved stage
    Given ticket "WORK-1" is in "In progress" without "change-open"
    And ticket "WORK-1" has condition "waiting:decision"
    When the tracker clears condition "waiting:decision" for ticket "WORK-1"
    And the supervisor ticks
    Then run "execute" is dispatched for ticket "WORK-1"

  Scenario: A resolved dependency resumes the preserved stage
    Given ticket "WORK-1" is in "Ready" without "plan-ready"
    And ticket "WORK-1" has condition "waiting:dependency"
    When the tracker clears condition "waiting:dependency" for ticket "WORK-1"
    And the supervisor ticks
    Then run "plan" is dispatched for ticket "WORK-1"

  Scenario: Failed review is fixed and reviewed again
    Given ticket "WORK-1" is in "In review" with evidence "review-findings"
    When the supervisor ticks
    Then run "fix" is dispatched for ticket "WORK-1"
    When that run completes with evidence "fix-published" on a new revision
    And the tracker exposes the new revision without stale review evidence
    And the supervisor ticks
    Then run "review" is dispatched for the new revision

  Scenario: Requirement feedback returns work to planning
    Given ticket "WORK-1" is in "In review" with evidence "replan-requested"
    When the supervisor ticks
    Then ticket "WORK-1" transitions from "In review" to "Ready"
    And no planning run is dispatched from the stale snapshot

  Scenario: Current completion evidence prevents duplicate work
    Given ticket "WORK-1" is in "Ready" with evidence "plan-ready"
    When the supervisor ticks
    Then run "plan" is not dispatched for ticket "WORK-1"

  Scenario: A plan cannot advance work without durable plan content
    Given ticket "WORK-1" is in "Ready" without "plan-ready"
    When the plan run completes with "plan-ready" evidence but no durable plan
    Then no "plan-ready" evidence is published
    And ticket "WORK-1" remains in "Ready"

  Scenario: Execution receives the approved plan
    Given ticket "WORK-1" has current durable plan evidence
    When the supervisor dispatches execution for ticket "WORK-1"
    Then the execution context contains the approved plan

  Scenario: A stale result cannot publish
    Given ticket "WORK-1" is at revision "new"
    And a completed result for ticket "WORK-1" names revision "old"
    When the supervisor ticks
    Then the result is rejected without terminal evidence
    And ticket "WORK-1" remains eligible for current work

  Scenario: A publication failure retains the result with its actionable cause
    Given a completed result for ticket "WORK-1" cannot be published because the tracker is unavailable
    When the supervisor ticks
    Then the pending result remains available for a later retry
    And the publication error identifies the ticket, run, and tracker cause

  Scenario: A transient failure retries after backoff
    Given run "execute" for ticket "WORK-1" failed transiently on attempt 1
    When the retry delay expires
    And the supervisor ticks
    Then run "execute" is dispatched for the same ticket revision on attempt 2

  Scenario: Exhausted attempts escalate once
    Given run "execute" for ticket "WORK-1" exhausted its attempts
    When the supervisor ticks twice
    Then one escalation is published for ticket "WORK-1"
    And no further run is dispatched

  Scenario: Protected path changes fail closed
    Given run "execute" reports a change under a protected path
    When the supervisor validates and publishes the result
    Then no completion evidence is published
    And ticket "WORK-1" waits for human action in its preserved stage

  Scenario: The dispatch kill switch keeps agent CLIs idle
    Given eligible work exists
    And dispatch is disabled in the installed policy
    When the supervisor ticks
    Then the tracker is still read
    And no run is dispatched

  Scenario: A read-only tick reports actions without side effects
    Given eligible work exists
    When the supervisor performs a read-only tick
    Then it reports the derived action
    And it does not publish, transition, escalate, persist, or dispatch

  Scenario: Installation owns one concise project-rules pointer
    Given a project has no installed Agentic SDLC policy
    When the installer runs twice
    Then it creates the policy once without overwriting configuration
    And each configured project-rules file contains one concise Agentic SDLC block

  Scenario: An unavailable primary uses the next approved model fallback
    Given a route has one primary profile and one ordered fallback
    And the primary profile cannot start
    When the runner executes the stage goal
    Then the fallback returns the terminal result
    And execution evidence names the fallback profile, model, effort, and position

  Scenario: Model profiles pin identity and effort
    Given a configured model profile omits its pinned model or effort
    When the policy is validated
    Then validation fails closed

  Scenario: A valid task outcome never switches models
    Given the primary model returns a valid "needs-human" result
    And an ordered fallback is available
    When the runner executes the stage goal
    Then it returns the primary model's task outcome
    And it does not invoke the fallback

  Scenario: Goal mode continues one claim until a terminal result
    Given a model exits cleanly without a terminal result
    And the route permits a bounded goal continuation
    When the runner continues the same stage goal
    Then the continuation returns the terminal result
    And execution evidence reports one continuation and no fallback

  Scenario: Restart derives from durable tracker truth
    Given local runtime diagnostics are absent
    And ticket "WORK-1" has current completion evidence "change-open"
    When a new supervisor instance ticks
    Then it does not dispatch the completed run

  Scenario: Release requires current environment evidence
    Given ticket "WORK-1" is in "Done" without "staging-live"
    When the supervisor ticks
    Then ticket "WORK-1" does not transition to "Live on staging"
    When the tracker adds evidence "staging-live" to ticket "WORK-1"
    And the supervisor ticks
    Then ticket "WORK-1" transitions from "Done" to "Live on staging"

# Owner: skills/sdlc/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:sdlc
Feature: Routing and the unattended cycle
  As the Factory owner
  I want each ticket routed to one skill by a fixed table, and each cycle to follow one fixed order
  So that the factory moves tickets without a human and stops when it must

  # Source: skills/sdlc/SKILL.md, "Routing"
  Scenario Outline: A ticket state routes to one skill
    Given a ticket is in state "<state>"
    When the orchestrator routes the ticket
    Then the skill is "<skill>"

    Examples:
      | state                                                                                       | skill                              |
      | Status Ideas                                                                                | none; humans only                  |
      | Status Signals                                                                              | triage-signal                      |
      | Status Backlog with no Priority                                                             | backlog-grooming                   |
      | Status Backlog with a Priority, no open blocker, no children                                | shape                              |
      | Status Ready                                                                                | implement-spec                     |
      | Status In progress                                                                          | implement-spec                     |
      | Status In review, draft CR                                                                  | review-pr                          |
      | Status In review, ready CR behind the trunk                                                 | review-pr                          |
      | Status In review, ready CR whose required check is red                                      | review-pr                          |
      | Status In review, ready CR whose required check is missing for longer than stall_minutes    | review-pr                          |
      | Status In review, any other case                                                            | none; approvals and auto-merge act |
      | Draft factory CR                                                                            | review-pr, dispatched with --cr    |
      | Status Done, P0 ticket, Shipped On the environment before the last, no open release request | release                            |
      | Status Done, any other case                                                                 | none; gates write Shipped          |
      | ledger summary shows learning.due                                                           | improve-factory                    |
      | Any working status, authority unclear                                                       | escalate-to-human                  |

  # Source: skills/sdlc/SKILL.md, "Routing" (rule: pick the first row that matches)
  Scenario: A release request goes to release, not to backlog-grooming
    Given a ticket is at Status Backlog
    And the ticket has the label "board.labels.release"
    And the ticket has no Priority
    When the orchestrator routes the ticket
    Then the first matching row is the release request row
    And the skill is "release"
    And the dispatch uses "--ticket <request>"

  # Source: skills/sdlc/SKILL.md, "The needs-human hold"
  Scenario: A held ticket is skipped, keeps its Status and resumes when the label goes
    Given a ticket at Status Ready has the label "board.labels.human"
    When the orchestrator routes the ticket
    Then no skill is routed
    And no skill moves or reorders the ticket
    And no automation moves the ticket, except gate merged when its CR merges
    And the ticket keeps the Status Ready
    When a human removes the label
    Then the next run resumes the ticket at the Status Ready

  # Source: skills/sdlc/SKILL.md, "Routing" (Status Backlog row)
  Scenario Outline: A Backlog ticket with a Priority is not routed to shape
    Given a ticket is at Status Backlog with a Priority
    And the ticket <condition>
    When the orchestrator routes the ticket
    Then the skill is not "shape"

    Examples:
      | condition                                        |
      | has an open blocker                              |
      | is in the milestone "board.later_milestone"      |
      | has children, so it is an initiative             |

  # Source: skills/sdlc/SKILL.md, "Run one cycle"
  Scenario: One cycle runs its steps in order
    Given a scheduler starts one unattended run
    When the cycle runs
    Then the orchestrator reads state: the board, the open CRs, the last "cycle.failure_limit" heartbeats and "ledger summary"
    And then it judges each run of the previous heartbeat that has no score
    And then it starts improve-factory, when "learning.due" showed in the read-state step
    And then it triages every ticket at Signals
    And then it routes the board
    And then it writes one heartbeat that holds every run of this cycle, the judge and learn runs too

  # Source: skills/sdlc/SKILL.md, "Run one cycle"
  Scenario: The cycle never reviews
    When the cycle runs
    Then the cycle reviews nothing
    And the review runtime runs "review-pr" after the cycle
    And the cycle never holds the review token

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 5
  Scenario: The cycle caps implementations and keeps Ready filled
    Given the Ready queue holds tickets
    When the cycle routes the board
    Then it starts at most "cycle.max_implementations" new implementations from the top of the Ready queue
    And at most "parallel_agents" subagents run at once
    When Ready plus the shapes under way hold fewer than "cycle.min_ready" tickets
    Then the cycle routes the next Backlog ticket to shape

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 5
  Scenario: A full Ready queue never starves releases or rework
    Given Ready holds at least "cycle.min_ready" tickets
    And a release request is at Backlog
    And a ticket that review sent back is at In progress
    When the cycle routes the board
    Then it dispatches release for the request
    And it dispatches implement-spec for the ticket at In progress

  # Source: skills/sdlc/SKILL.md, "Run one cycle" (dispatch)
  # Proof: test/dispatch.test.ts "idempotency: a trusted marker for the same key inside cycle.dedupe_minutes skips; --cr and improve-factory use the heartbeat ticket"
  Scenario: A double fire of the same dispatch is skipped
    Given the cycle dispatched "implement-spec" for ticket "1"
    When "implement-spec" is dispatched for ticket "1" again inside "cycle.dedupe_minutes"
    Then the dispatch prints "{ skipped: true }"
    And the orchestrator leaves it

  # Source: skills/sdlc/SKILL.md, "Run one cycle" (rules for every step)
  Scenario: The time budget stops new work
    Given "cycle.time_budget_minutes" has passed since the cycle started
    When the cycle has more work to start
    Then it starts nothing new
    And it waits for the running subagents
    And it reports

  # Source: skills/sdlc/SKILL.md, "Run one cycle" (rules for every step)
  Scenario: A step that keeps failing is escalated, not retried
    Given a step failed in a cycle
    Then the failure goes into the "errors" of the heartbeat
    And the cycle goes on with the next step
    Given the step failed in each of the last "cycle.failure_limit" heartbeats
    When the next cycle reaches that step
    Then the cycle does not retry it
    And it calls "escalate-to-human" on the ticket of the step
    And when the step has no ticket, it asks "owners.factory" on the heartbeat ticket
    And a hold on the heartbeat ticket never stops the heartbeat

  # Source: src/ledger.ts, "learningState"; skills/sdlc/SKILL.md, "Run one cycle", step 3
  # Proof: test/ledger.test.ts "learningState: cycles since the last improve-factory heartbeat, due at every_cycles, week spend of learning skills"
  Scenario: Learning is not due over the weekly budget
    Given "learning.every_cycles" cycles passed since the last improve-factory run
    And the week's learning spend reached "learning.budget_usd_per_week"
    When the cycle reads "ledger summary"
    Then "learning.due" is false
    And the cycle starts no improve-factory run

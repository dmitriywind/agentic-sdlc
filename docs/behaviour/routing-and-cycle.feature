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
    And then it triages every ticket at Signals
    And then it reviews drafts
    And then it implements
    And then it keeps Ready filled
    And then it writes one heartbeat
    And then it judges each run in that heartbeat
    And then it learns, when "learning.due" showed in the read-state step

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 3
  Scenario: The cycle never reviews
    When the cycle reaches step 3
    Then the cycle reviews nothing
    And the review runtime runs "review-pr" after the cycle
    And the cycle never holds the review token

  # Source: skills/sdlc/SKILL.md, "Run one cycle", steps 4 and 5
  Scenario: The cycle caps implementations and keeps Ready filled
    Given the Ready queue holds tickets
    When the cycle reaches the implement step
    Then it starts at most "cycle.max_implementations" implementations from the top of the Ready queue
    And at most "parallel_agents" subagents run at once
    When Ready plus the shapes under way hold fewer than "cycle.min_ready" tickets
    Then the cycle routes the next Backlog ticket by the Routing table

  # Source: skills/sdlc/SKILL.md, "Run one cycle" (dispatch)
  # Proof: test/dispatch.test.ts "idempotency: a trusted marker for the same key inside stall_minutes skips; --cr alone uses the heartbeat ticket"
  Scenario: A second dispatch with the same key is skipped
    Given the cycle dispatched "implement-spec" for ticket "1" at one head
    When the cycle dispatches "implement-spec" for ticket "1" at the same head inside "stall_minutes"
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

# Owner: skills/sdlc/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:sdlc
Feature: Routing and the unattended cycle
  As the Factory owner
  I want each ticket routed to one skill by a fixed table, and each cycle to follow one fixed order
  So that the factory moves tickets without a human and stops when it must

  # Source: skills/sdlc/SKILL.md, "Routing"
  # Proof: skill text only
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
  # Proof: skill text only
  Scenario: A release request goes to release, not to backlog-grooming
    Given a ticket is at Status Backlog
    And the ticket has the label "board.labels.release"
    And the ticket has no Priority
    When the orchestrator routes the ticket
    Then the first matching row is the release request row
    And the skill is "release"
    And the dispatch uses "--ticket <request>"

  # Source: skills/sdlc/SKILL.md, "The needs-human hold"
  # Proof: skill text only
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
  # Proof: skill text only
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
  # Proof: skill text only
  Scenario: One cycle runs its steps in order
    Given a scheduler starts one unattended run
    When the cycle runs
    Then the orchestrator reads state: the board, the open CRs, the last "cycle.failure_limit" heartbeats and "ledger summary"
    And then it judges each run of the previous heartbeat that has no score
    And then it starts improve-factory, when "learning.due" showed in the read-state step
    And then it triages every ticket at Signals
    And then it routes the board
    And then it writes one heartbeat that holds every run of this cycle, the judge and learn runs too
    And then, with a forge.review_identity, it fires the review runtime only when a CR needs a review

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 1; skills/sdlc/references/heartbeat.md, "Shape"
  # Proof: skill text only
  Scenario: An exhausted error budget stops new feature work
    Given product.slo is set
    And "ledger measures" prints errorBudget.exhausted true
    When the cycle routes the board
    Then it moves no feature ticket from Ready to In progress
    And it works only bugs, Signals and the tickets and reviews in flight
    And the heartbeat records "budget: exhausted"

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 2
  # Proof: skill text only
  Scenario: An idle cycle exits with a minimal heartbeat
    Given no unheld ticket routes to a skill the cycle dispatches
    And no held ticket has a trusted owner reply after its hold
    And no open CR needs a review
    And "ledger summary" shows neither "learning.due" nor a run to judge
    When the cycle runs
    Then it writes one heartbeat with only "at", "factory", an empty "runs" and "errors"
    And when learning.enabled is true it also carries "learning" forward from the last heartbeat
    And it dispatches nothing
    And it does not fire the review runtime

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 8
  # Proof: skill text only
  Scenario Outline: The review runtime fires only for a CR that needs a review
    Given forge.review_identity is set
    And the cycle has written its heartbeat
    And "forge list" shows <cr>
    When the cycle reaches the review hand-off
    Then the review runtime <fired>

    Examples:
      | cr                                                                   | fired           |
      | a draft CR at In review with no review-pr report for its head        | is fired once   |
      | a ready CR at In review behind the trunk                             | is fired once   |
      | a draft factory CR whose newest review-pr report for its head is REMEDIATION REQUIRED | is not fired    |
      | a draft CR whose newest review-pr report for its head is a PASS (unfinished) | is fired once   |
      | a draft CR whose newest review-pr note for its head names a closed Signal | is fired once   |
      | a draft CR whose newest review-pr note for its head names an open Signal | is not fired    |
      | a ready CR at In review with a green review status and no red check  | is not fired    |
      | no open CR                                                           | is not fired    |

  # Source: skills/sdlc/SKILL.md, "Run one cycle"
  # Proof: skill text only
  Scenario: With two identities the cycle never reviews
    Given forge.review_identity is set
    When the cycle runs
    Then the cycle reviews nothing
    And the review runtime runs "review-pr"
    And the cycle never holds the review token

  # Source: skills/sdlc/SKILL.md, "Run one cycle", steps 6 and 8
  # Proof: skill text only
  Scenario: With one identity the cycle reviews in the same cycle
    Given forge.review_identity is empty
    And implement-spec opened a draft CR in this cycle
    When the run finishes and its ticket shows In review
    Then the cycle dispatches "review-pr" for that CR in the same cycle, as a fresh subagent
    And the heartbeat holds the review-pr run
    And the cycle fires no review runtime

  # Source: skills/sdlc/references/heartbeat.md, "Shape"
  # Proof: skill text only; the ledger side is features/ledger/runs.feature
  Scenario: A heartbeat holds only the required fields by default
    When the cycle writes its heartbeat
    Then it holds "at", "factory", "runs" and "errors"
    And it holds "learning" only when learning is on
    And it holds no measures unless the runner prompt asks for them
    And "ledger runs" reads its rows

  # Source: templates/runner/review-prompt.md
  # Proof: skill text only
  Scenario: A review run with nothing to review writes nothing
    Given no open CR needs a review
    When the review runtime runs
    Then it dispatches nothing
    And it writes no heartbeat

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 6
  # Proof: skill text only
  Scenario: The cycle caps implementations and keeps Ready filled
    Given the Ready queue holds tickets
    When the cycle routes the board
    Then it starts at most "cycle.max_implementations" new implementations from the top of the Ready queue
    And at most "parallel_agents" subagents run at once
    When Ready plus the shapes under way hold fewer than "cycle.min_ready" tickets
    Then the cycle routes the next Backlog ticket to shape

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 6
  # Proof: skill text only
  Scenario: A ticket moves on to its next step in the same cycle
    Given the cycle groomed a Backlog ticket and the run finished
    And "cycle.time_budget_minutes" is not spent
    When the ticket now matches the shape row
    Then the cycle dispatches shape for it in the same cycle
    And after shape makes it Ready, implement-spec may claim it under "cycle.max_implementations"

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 6
  # Proof: skill text only
  Scenario: A full Ready queue never starves releases or rework
    Given Ready holds at least "cycle.min_ready" tickets
    And a release request is at Backlog
    And a ticket that review sent back is at In progress
    When the cycle routes the board
    Then it dispatches release for the request
    And it dispatches implement-spec for the ticket at In progress

  # Source: skills/sdlc/SKILL.md, "Run one cycle" (rules for every step)
  # Proof: skill text only
  Scenario: The time budget stops new work
    Given "cycle.time_budget_minutes" has passed since the cycle started
    When the cycle has more work to start
    Then it starts nothing new, judge and learn included
    And it waits for the running subagents
    And it reports
    And the next cycle judges the runs that have no score

  # Source: skills/sdlc/SKILL.md, "Run one cycle" (rules for every step)
  # Proof: skill text only
  Scenario: A step that keeps failing is escalated, not retried
    Given a step failed in a cycle
    Then the failure goes into the "errors" of the heartbeat
    And the cycle goes on with the next step
    Given the step failed in each of the last "cycle.failure_limit" heartbeats whose factory is the current trunk sha
    When the next cycle reaches that step
    Then the cycle does not retry it
    And it calls "escalate-to-human" on the ticket of the step
    And when the step has no ticket, it posts one comment to "owners.factory" on the heartbeat ticket, with no label
    And the heartbeat is always written

  # Source: skills/sdlc/SKILL.md, "Run one cycle", rules (failure_limit)
  # Proof: skill text only
  Scenario: A factory change gives a failing step a fresh start
    Given the step failed in the last "cycle.failure_limit" heartbeats under an older factory sha
    When the cycle runs on a newer trunk sha
    Then it retries the step instead of escalating it

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 1
  # Proof: skill text only
  Scenario: A second cycle that starts while one runs writes nothing
    Given a cycle is running and has not written its heartbeat
    When a second cycle runs "dispatch sdlc --ticket <heartbeat.ticket>"
    Then the dispatch prints "{ skipped: true }"
    And the second cycle stops and writes no heartbeat

  # Source: skills/sdlc/SKILL.md, "Run one cycle", step 1a
  # Proof: skill text only
  Scenario: An owner who only comments releases the hold
    Given a ticket is held with a "### Needs human" comment
    And a reply by owners.product or owners.factory follows that comment
    When the cycle reads the board
    Then the cycle removes the label board.labels.human
    And it names the ticket in the heartbeat
    And the ticket is routed at its Status

  # Source: skills/sdlc/SKILL.md, "Routing"
  # Proof: skill text only
  Scenario Outline: CR states that could strand a ticket are routed
    Given <state>
    When the cycle routes the board
    Then <skill> is dispatched

    Examples:
      | state                                                         | skill                                  |
      | a ticket at In review that no open CR closes                  | implement-spec, back to In progress    |
      | a ready CR at In review with no review status on its head     | review-pr                              |
      | a Ready ticket whose open CR a person opened                  | implement-spec, a hand-off to review   |
      | an open dependency CR with no ticket                          | review-pr with --cr                    |

  # Source: skills/sdlc/SKILL.md, "Rules for every step"
  # Proof: skill text only
  Scenario: A capped run is a failed run
    Given a run ended on its turn, token or minute cap
    When the cycle writes the heartbeat
    Then the run row has outcome "capped" and the same path as a timed-out run

  # Source: skills/sdlc/SKILL.md, "Rules for every step"
  # Proof: skill text only; the ledger side (overBudget) is features/ledger/summary.feature
  Scenario: A ticket over its token budget gets no further dispatch
    Given cycle.max_tokens_per_ticket is set and a ticket's runs reported more tokens
    When ledger summary runs
    Then the ticket is marked overBudget
    And the cycle calls escalate instead of dispatching it

# Owner: skills/shape/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:shape
Feature: Shape a ticket
  As the factory
  I want to take one Backlog ticket to Ready in one pass
  So that an implementer gets a sized ticket with criteria, a proof for each and a lane

  # Source: skills/shape/SKILL.md, intro
  Scenario: A ticket with children is an initiative and is not shaped
    Given a ticket at Status Backlog has children
    When the skill starts
    Then it stops
    And its only comment is the closing comment, which names the ticket as an initiative

  # Source: skills/shape/SKILL.md, "Steps" 1 "Diagnose (failure-born tickets only)"
  Scenario: A failure-born ticket needs a confirmed cause
    Given the ticket was made from a failure Signal
    When the skill diagnoses
    Then it reproduces the failure
    And it minimises it
    And it lists hypotheses
    And it confirms the root cause with a run
    And the cause is shown by a command and its output, not inferred

  # Source: skills/shape/SKILL.md, "Steps" 1 "Diagnose (failure-born tickets only)"
  Scenario Outline: A failure without a confirmed cause stops the pass
    Given the ticket was made from a failure Signal
    And <case>
    When the skill diagnoses
    Then it stops
    And it comments the attempts on the ticket
    And <result>
    And it writes no spec from an inferred cause

    Examples:
      | case                                                      | result                                                                      |
      | the failure does not reproduce at the trunk tip           | it closes the ticket as not planned with that evidence                      |
      | no run confirms a cause and the failure is already fixed  | it closes the ticket as not planned with that evidence                      |
      | no run confirms a cause because a device is missing       | it calls "escalate-to-human" with the reason Access                         |
      | no run confirms a cause because an environment is missing | it calls "escalate-to-human" with the reason Access                         |

  # Source: skills/shape/SKILL.md, "Steps" 2 "Orient" and 3 "Independent read"
  Scenario: The skill reads the code and forms its own view of scope
    When the skill orients
    Then it opens every file and line the ticket cites at the trunk tip
    And it marks each citation resolved, moved or gone
    And it lists the files it read in the ticket
    And an item that would undo delivered behaviour is an escalation
    When the skill judges scope
    Then it forms its own read from the raw facts before it compares with the first impression
    And it writes both reads down
    And it settles every disagreement

  # Source: skills/shape/SKILL.md, "Steps" 4 "Size, milestone and split"
  Scenario: A ticket above the size limit is split into children
    Given the Size of the ticket is above "ready_size_limit"
    When the skill splits
    Then each child is a complete user-visible path, shippable and verifiable alone
    And each child is created with "board create ... --parent <id>"
    And each child takes the milestone of the original
    And each child goes on the board at Backlog
    And the original becomes the initiative, keeps its Priority and stays at Backlog

  # Source: skills/shape/SKILL.md, "Steps" 5 "Criteria"
  Scenario: Each acceptance criterion names its proof
    When the skill writes the criteria
    Then they are plain bullets, never checkboxes
    And each criterion is an observable statement
    And each criterion names its proof kind, one of "product.proofs", and the check that proves it
    And the criteria say what is out of scope
    And a "manual" criterion names who checks it, "owners.product" unless the ticket names another owner
    And a "computer-use" criterion needs "commands.preview"
    And when "commands.preview" is not set, the skill picks "manual" for that criterion

  # Source: skills/shape/SKILL.md, "Steps" 6 "Lane"
  Scenario Outline: The lane follows the size, the triggers and the touched paths
    Given the Size is "<size>"
    And an escalation trigger of "escalate-to-human" "<trigger>"
    And a path in "paths.lane_areas" "<area>"
    When the skill sets the Lane with "board set <id> lane <Fast|Full>"
    Then the Lane is "<lane>"
    And the skill calls "escalate-to-human" for the ticket
    And it records the result on the ticket

    Examples:
      | size                             | trigger   | area           | lane |
      | at or below "fast_lane_max_size" | fires not | is not touched | Fast |
      | above "fast_lane_max_size"       | fires not | is not touched | Full |
      | at or below "fast_lane_max_size" | fires     | is not touched | Full |
      | at or below "fast_lane_max_size" | fires not | is touched     | Full |

  # Source: skills/shape/SKILL.md, "Steps" 6 "Lane" and 7 "Spec (Full lane only)"
  Scenario: A Full-lane ticket gets one spec comment and a Fast-lane ticket gets a proof list
    Given the Lane is Full
    When the skill writes the spec
    Then the spec has these parts: goal and non-goals, affected areas, design, test plan, implementation plan, risks and rollback, the riskiest step, options not chosen, flagged concerns and open questions
    And a failure-born ticket also has a fix loop
    And the skill attaches it as one ticket comment whose first line is "spec_marker"
    And a later pass edits that comment in place
    And the ticket has one spec
    Given the Lane is Fast
    Then the criteria and a proof list in the ticket are the spec
    And each listed proof names its tier, file and rule as "paths.test_standard" defines them

  # Source: skills/shape/SKILL.md, "Steps" 8 "Pass the checklist"
  # Proof: test/board-local.test.ts "create, list, move with only-from, set, label, close"
  Scenario: A ticket that passes the checklist moves to Ready
    Given every acceptance criterion has a named proof
    And in the Full lane the test plan covers every criterion
    And open questions is empty
    And no open blocker exists
    And Size is within "ready_size_limit"
    And Lane is set
    And "escalate-to-human" returned "proceed", recorded on the ticket
    When the skill moves the ticket
    Then it runs "board move <id> Ready --only-from Backlog"
    And the board shows the Status Ready

  # Source: skills/shape/SKILL.md, "Steps" 8 "Pass the checklist"
  Scenario Outline: A ticket that fails the checklist is not moved to Ready
    Given the checklist fails because "<failure>"
    When the skill finishes
    Then <result>

    Examples:
      | failure                     | result                                                                                            |
      | open questions is not empty | the skill calls "escalate-to-human" (Ruling) with the questions as the Ask                        |
      | an open blocker exists      | the skill names the blocker in the ticket comment and stops, and the routing skips the ticket     |
      | any other item fails        | the skill fixes it in this run: it splits over the size limit or writes the missing proof or lane |

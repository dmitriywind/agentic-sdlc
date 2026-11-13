# Owner: skills/backlog-grooming/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:backlog-grooming
Feature: Groom the backlog
  As the Product owner
  I want the Backlog ordered and coherent
  So that the factory shapes the most important work first

  Background:
    Given what matters most comes from "paths.importance_doc" and the docs it routes to

  # Source: skills/backlog-grooming/SKILL.md, "Steps" 1 "Dedupe"
  # Proof: test/board-local.test.ts "create, list, move with only-from, set, label, close"
  Scenario: Each item is marked new, merge or duplicate
    Given an item is at Status Backlog
    When the skill dedupes
    Then it runs "board list --search" with keywords for the item
    And it marks the item "new", "merge into <id>" or "duplicate of <id>"

  # Source: skills/backlog-grooming/SKILL.md, "Steps" 2 "Group"
  Scenario: Items that cannot ship apart merge into one deliverable
    Given two items change the same behaviour
    When the skill groups
    Then they merge into one surviving deliverable
    And the other item is Cancelled with a pointer to the survivor

  # Source: skills/backlog-grooming/SKILL.md, "Steps" 2 "Group"
  # Proof: test/board-local.test.ts "create, list, move with only-from, set, label, close"
  Scenario: Separate deliverables toward one outcome become sub-issues of an initiative
    Given two separate deliverables work toward one outcome
    When the skill groups
    Then it creates or picks the parent initiative
    And it runs "board child <parent> <child>" for each deliverable
    And all children are inside one milestone
    And grouping is settled before any shape

  # Source: skills/backlog-grooming/SKILL.md, "Steps" 2 "Group"
  Scenario Outline: An open parent whose children are all closed is closed
    Given an open parent has children
    And all children are closed
    And <children state>
    When the skill groups
    Then the skill closes the parent as "<close>"

    Examples:
      | children state                | close       |
      | every child was Cancelled     | not planned |
      | not every child was Cancelled | completed   |

  # Source: skills/backlog-grooming/SKILL.md, "Steps" 3 "Prioritise"
  Scenario: Backlog items get a Priority and a milestone
    Given unheld Backlog items have no Priority
    When the skill prioritises
    Then it orders by user impact, risk reduction and dependency, blockers first
    And it sets the Priority field from "priorities"
    And it sets the milestone, per "paths.roadmap_doc"
    And nice-to-have work goes to "board.later_milestone"
    And every unheld Backlog item has both Priority and milestone

  # Source: skills/backlog-grooming/SKILL.md, "Rules"
  Scenario: The skill never sets P0
    Given an item looks urgent
    When the skill sets the Priority
    Then the Priority is not the first priority, P0

  # Source: skills/backlog-grooming/SKILL.md, "Steps" 4 "New work from a plan or an Idea"
  Scenario: A plan becomes one ticket per item
    Given a plan or conversation must become tickets
    When the skill creates the tickets
    Then it runs "board create ... --status Backlog" once per item
    And each ticket follows the ticket template of the project
    And each ticket has the label "bug" or "feature"

  # Source: skills/backlog-grooming/SKILL.md, "Steps" 4 "New work from a plan or an Idea"
  Scenario: An Idea a human moved to Backlog is rewritten
    Given a human moved an item out of Ideas to Backlog
    When the skill rewrites the body
    Then it keeps the words of the owner, quoted
    And the body has outcome, who it is for, success metric, constraints and open questions

  # Source: skills/backlog-grooming/SKILL.md, "Steps" 4 "New work from a plan or an Idea"
  Scenario: A missing outcome or metric becomes one question to the Product owner
    Given the outcome or metric cannot be derived from the item and "paths.importance_doc"
    When the skill handles the item
    Then it posts one comment asking the Product owner in plain words, with no jargon
    And it stops on that item

  # Source: skills/backlog-grooming/SKILL.md, "Rules"
  Scenario Outline: Rules for tech debt, flags, duplicates and conflicts
    Given <case>
    When the skill grooms
    Then <result>

    Examples:
      | case                                                     | result                                                            |
      | an item is tech debt with a stated cost and evidence     | the skill tickets it                                              |
      | an item is tech debt with no stated cost                 | it stays a comment                                                |
      | a change ships behind a flag or toggle                   | it gets a child removal ticket naming the flag and a due milestone |
      | an item is a decided duplicate or superseded             | it is Cancelled with a reason comment and closed as not planned   |
      | a priority cannot be derived from the docs               | the skill escalates                                               |
      | two items conflict                                       | the skill escalates                                               |

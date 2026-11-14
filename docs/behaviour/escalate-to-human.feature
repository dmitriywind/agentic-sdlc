# Owner: skills/escalate-to-human/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:escalate-to-human
Feature: Escalate to a human
  As the Product owner
  I want the factory to hold a ticket and ask one clear question when a person must act
  So that I decide only what needs a person and the rest goes on

  # Source: skills/escalate-to-human/SKILL.md, "Classify" and "Hold"
  Scenario: A trigger holds the ticket
    Given a ticket at a working status
    And a trigger holds, for example Money
    When escalate-to-human classifies the ticket
    Then the result is escalate and names the trigger
    And the ticket gets the label board.labels.human
    And the assignee is removed
    And the Status stays

  # Source: skills/escalate-to-human/SKILL.md, "Hold" and "Needs human"
  Scenario: The ask is one structured comment
    Given the result is escalate
    When the skill posts the comment
    Then the comment starts with "### Needs human: <one-line reason>"
    And it has Asked by, Overview, Evidence, Options, Ask, Default and Verify
    And it has 2 to 4 Options with the recommended one first
    And it has at most two Asks
    And the ask goes to owners.product, or to owners.factory for a factory change or an Access gap

  # Source: skills/escalate-to-human/SKILL.md, "Classify" and "Record"
  Scenario: No trigger means proceed
    Given no trigger holds
    When escalate-to-human classifies the ticket
    Then the result is proceed
    And the calling skill's ticket comment gets the line "escalate-to-human: proceed"
    And the line names the sources that settled it

  # Source: skills/escalate-to-human/SKILL.md, "Classify"
  Scenario: A routine step or an oversize item is not escalated
    Given the step is a sync, a retry or a cosmetic choice, or the item is above the size limit
    When escalate-to-human classifies it
    Then it does not escalate
    And an oversize item goes back to shape

  # Source: skills/escalate-to-human/SKILL.md, "Search first"
  Scenario: A source settles only a Ruling question
    Given a file in paths.sources_before_question answers a Ruling question
    And another source supplies options for a Security trigger
    When the skill searches its sources
    Then the Ruling trigger is settled
    And the Security trigger is not settled
    And the skill classifies the Security trigger in step 2

  # Source: skills/escalate-to-human/SKILL.md, "Search first"
  # Proof: test/board-local.test.ts "cli comments --trusted keeps the binding bots and owners only"
  Scenario: A trusted owner reply settles the named triggers
    Given a ticket with a "### Needs human" comment
    And a trusted reply by owners.product or owners.factory is posted after it
    And no new facts appeared since
    When the skill classifies the ticket
    Then the reply settles every trigger that the hold comment named
    And the skill names that reply as the settling source
    And a new diff or a later run alone is not a new fact

  # Source: skills/escalate-to-human/SKILL.md, "Search first"
  Scenario: New facts reopen a settled trigger
    Given a trusted owner reply followed the last hold comment
    And the Size, the Lane or the acceptance criteria changed since
    When the skill classifies the ticket
    Then the reply does not settle the trigger
    And the skill classifies again

  # Source: skills/escalate-to-human/SKILL.md, "Hold"
  Scenario: A held ticket gets a comment only for new facts
    Given the ticket already has the board.labels.human label
    And no new facts appeared
    When escalate-to-human runs again
    Then it posts no new comment

  # Source: skills/escalate-to-human/SKILL.md, "Classify" (P0)
  Scenario: An owner reply settles P0 without naming it
    Given a ticket is held for the P0 trigger
    When owners.product posts a trusted reply after the hold comment
    And no new facts appeared
    Then the P0 trigger is settled
    And the reply need not name P0

  # Source: skills/escalate-to-human/SKILL.md, "Record"
  Scenario: A run with no ticket records proceed on its CR
    Given review-pr runs on a factory CR with no ticket
    When escalate-to-human returns proceed
    Then the line "escalate-to-human: proceed" goes in the review-pr report on the CR

  # Source: skills/escalate-to-human/SKILL.md, "Hold"
  Scenario: A factory CR with no ticket is held on the CR
    Given a run dispatched with only --cr
    And a trigger holds
    When the skill holds the work
    Then it posts the comment on the CR with "forge comment <n> --body-file <f>"
    And it posts the same comment on heartbeat.ticket
    And it sets no label and no assignee
    And the CR stays draft

  # Source: skills/escalate-to-human/SKILL.md, "Search first" and "Hold"
  # Proof: test/forge.test.ts "cli: comments --trusted --last 1 returns the newest trusted comment past a newer untrusted one"
  Scenario: A factory CR resumes on a trusted owner reply
    Given a factory CR held with a "### Needs human" comment
    When a trusted owner reply appears on the CR after that comment
    Then the skill reads it with "forge comments <n> --trusted"
    And review-pr reviews the CR again

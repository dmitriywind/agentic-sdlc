# Owner: src/gates.ts, skills/sdlc/references/gates.md, docs/forges.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:approval
Feature: Gate human-approval
  As the Factory owner
  I want each CR to get the approvals its class needs
  So that no CR merges without the right human decision

  # Source: skills/sdlc/references/gates.md, "Approval"; docs/forges.md, "Review identity and approval"
  # Proof: test/gates.test.ts "approval: classes and the human-approval status per forge.human_approval"
  Scenario: A Fast-lane product CR passes on the agent review
    Given the closing ticket has the Lane "Fast"
    And forge.human_approval is "full-lane"
    When the approval gate runs
    Then the class is product-fast
    And the status "human-approval" is success

  # Source: src/gates.ts, "approval"
  # Proof: test/gates.test.ts "approval: classes and the human-approval status per forge.human_approval"
  Scenario: A Full-lane product CR waits for a human
    Given the closing ticket has the Lane "Full"
    And the only approving review on the head is by an account in owners.bots
    When the approval gate runs
    Then the class is product-full
    And the status "human-approval" is pending

  # Source: src/gates.ts, "approval"
  # Proof: test/gates.test.ts "approval: classes and the human-approval status per forge.human_approval"
  Scenario: A missing Lane counts as Full
    Given the closing ticket has no Lane
    When the approval gate runs
    Then the class is product-full

  # Source: src/gates.ts, "approval" (paths.lane_areas); docs/forges.md, "Review identity and approval"
  # Proof: test/gates.test.ts "approval: classes and the human-approval status per forge.human_approval"
  Scenario: A path in paths.lane_areas forces the Full lane
    Given the closing ticket has the Lane "Fast"
    And the CR touches a path in paths.lane_areas
    When the approval gate runs
    Then the class is product-full

  # Source: src/gates.ts, "approval"
  # Proof: test/gates.test.ts "approval: classes and the human-approval status per forge.human_approval"
  Scenario: A guardrail CR needs owners.factory
    Given a CR changes the skill text
    And a human who is not owners.factory approved the head
    When the approval gate runs
    Then the class is guardrail
    And the status "human-approval" is pending

  # Source: src/gates.ts, "approvers"
  # Proof: test/gates.test.ts "approvers: latest decisive review per user, on the head only"
  Scenario: Only a review of the current head counts
    Given a reviewer approved an earlier head
    When the approval gate runs after a new push
    Then that approval does not count

  # Source: src/gates.ts, "approval"; docs/forges.md, "Review identity and approval"
  # Proof: test/gates.test.ts "approval: classes and the human-approval status per forge.human_approval"
  Scenario Outline: forge.human_approval changes who must approve
    Given forge.human_approval is "<mode>"
    And a Fast-lane product CR has no human approval
    When the approval gate runs
    Then the status "human-approval" is <state>

    Examples:
      | mode       | state   |
      | full-lane  | success |
      | always     | pending |
      | never      | success |

  # Source: src/gates.ts, "classify" (unreadable diff)
  # Proof: test/gates.test.ts "an unreadable forge diff fails closed to guardrail in approval, linkage and proofs-on-base"
  Scenario: An unreadable diff fails closed to guardrail
    Given the forge cannot return the diff of a CR
    When the approval gate runs
    Then the class is guardrail
    And the status is not success without an approval by owners.factory

  # Source: src/gates.ts, "classify" and "diffPaths"
  # Proof: test/gates.test.ts "diffPaths: old and new path; quoted or ambiguous headers fail closed"
  Scenario: A diff header that cannot be parsed fails closed to guardrail
    Given a diff header has a quoted path
    When the approval gate classifies the CR
    Then the class is guardrail

  # Source: src/gates.ts, "classify" (tuning)
  # Proof: test/gates.test.ts "classify: rename out of factory, quoted path, models-only binding, metadata.tier with a bench suite"
  Scenario: A models-only binding change is tuning
    Given a CR changes only the models map in the binding
    When the approval gate classifies the CR
    Then the class is tuning

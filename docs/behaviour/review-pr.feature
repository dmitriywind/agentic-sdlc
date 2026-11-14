# Owner: skills/review-pr/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:review-pr
Feature: Review a change request
  As the factory
  I want a fresh reviewer to grade a CR against its ticket and spec
  So that only a proven, correct CR is marked ready and auto-merged

  # Source: skills/review-pr/SKILL.md, "Decide" (PASS)
  # Proof: test/forge.test.ts "status and approve need review_token_env and never use the implementer token"
  Scenario: PASS marks the CR ready with auto-merge
    Given a draft CR for a ticket at In review
    And every criterion is proven
    And no Important finding is open
    And "Required" and "proofs-on-base" are green on this head
    When the review runtime decides
    Then it posts the review status as forge.review_identity with state success
    And it approves the CR with the review token
    And it runs "forge ready <n>" and "forge automerge <n>"
    And the ticket still shows In review

  # Source: references/architecture.md, "Two runtimes, two identities"; src/forge/index.ts, "status"
  # Proof: test/forge.test.ts "cli: status refuses the contexts only a gate posts"
  Scenario: The reviewer cannot post a gate's status
    Given the review runtime holds the review token
    When it runs "forge status <head> --context human-approval --state success"
    Then the CLI refuses with a usage error
    And no status is posted

  # Source: skills/review-pr/SKILL.md, "Send back"
  Scenario: Findings on a CR a person opened go back to that person
    Given a CR opened by an author outside owners.bots
    And the review finds an Important finding
    When the reviewer decides
    Then the reviewer runs "forge draft <n>"
    And the ticket stays In review
    And the reviewer pushes nothing to the change line
    And the reviewer reviews again when the CR head changes

  # Source: skills/review-pr/SKILL.md, "Report" and "Send back"
  Scenario: An Important finding sends the ticket back
    Given a product CR with a criterion graded NOT DONE
    When the reviewer decides
    Then the report starts with "<!-- review-pr <head sha> -->"
    And the verdict is REMEDIATION REQUIRED
    And the reviewer posts no approval
    And the ticket moves to In progress for implement-spec

  # Source: skills/review-pr/SKILL.md, "Report"
  Scenario: A Nit never blocks PASS
    Given the only findings are Nits
    And every hunt line is a Nit and not a bug
    When the reviewer decides
    Then the report lists the Nits, at most 5
    And the verdict is PASS

  # Source: skills/review-pr/SKILL.md, "Spec pass"
  Scenario: A manual criterion waits for an owner
    Given a criterion with proof manual
    And no trusted owner comment confirms it for this head
    When the reviewer runs the spec pass
    Then the reviewer posts one ask on the ticket that names the criterion and the head sha
    And the criterion is PENDING and is not a finding
    And the CR stays draft
    And the reviewer posts no report, no status and no approval

  # Source: skills/review-pr/SKILL.md, "CI results"
  Scenario: A pending or missing check stops the review
    Given a required check is pending on the head
    When the reviewer reads the CI results
    Then the reviewer stops with no report and reviews again on the next run
    And the pending check is not a finding
    And on a draft CR a check missing for longer than stall_minutes after the CR's pushedAt calls escalate-to-human once with the Access trigger

  # Source: skills/review-pr/SKILL.md, "Decide" (Human approval)
  # Proof: test/gates.test.ts "approval: classes and the human-approval status per forge.human_approval"
  Scenario: A Full-lane CR asks for a human approval
    Given a Full-lane product CR
    And forge.human_approval is full-lane or always
    When the reviewer decides PASS
    Then it posts one CR comment that asks owners.product to approve the head
    And it never approves for a human
    And for a factory CR the ask goes to owners.factory

  # Source: skills/review-pr/SKILL.md, "Decide" (PASS)
  # Proof: test/guard.test.ts "forge approve is for the review role only"
  Scenario: No review token means no approval
    Given forge.options.review_token_env is unset
    When the reviewer tries to post the status and the approval
    Then both fail
    And the reviewer calls escalate-to-human with the Access trigger
    And the reviewer posts nothing else

  # Source: skills/review-pr/SKILL.md, "Behind the trunk"
  Scenario: A ready CR behind the trunk is synced
    Given a ready CR at In review
    And its change line is behind the trunk
    When the reviewer runs
    Then it runs "forge sync <n>"
    And it repeats the CI check and the decision on the new head once CI has reported

  # Source: skills/review-pr/SKILL.md, "Red or stalled gate"
  # Proof: test/forge.test.ts "github: uses gh with body on stdin, draft = ready --undo, status via api"
  Scenario: A red check caused by the diff sends the ticket back
    Given a ready CR at In review
    And a required check is red
    And the cause is in the diff or the ticket's scope
    When the reviewer reads the failing check with "forge runs --failed"
    Then it runs "forge draft <n>"
    And the ticket moves to In progress with the cause

  # Source: skills/review-pr/SKILL.md, intro paragraph and "Send back"
  Scenario: A factory CR is graded without a ticket
    Given a draft CR dispatched with --cr
    And only paths.factory changed
    When the reviewer reviews it
    Then the reviewer reads no ticket
    And it grades the CR's stated target, cause and proof
    And a finding keeps the CR draft with the report on the CR

  # Source: skills/review-pr/SKILL.md, "Red or stalled gate"
  Scenario: A pending human approval is not a stalled check
    Given a ready CR whose "human-approval" status is pending for longer than stall_minutes
    And every other required check is green
    When the reviewer checks for red or stalled gates
    Then the CR stays ready
    And the reviewer files no Signal and no escalation

  # Source: skills/review-pr/SKILL.md, "CI results" and "Red or stalled gate"
  Scenario: A red check on a draft CR sends the work back
    Given a draft CR opened by the factory whose "Required" check is red
    When the reviewer reads the CI results
    Then it reads the failing check
    And with the cause in the diff, the ticket moves to In progress with the cause

  # Source: skills/review-pr/SKILL.md, "Red or stalled gate"
  Scenario: A ready CR with a check that never reported is escalated, not sent back
    Given a ready CR whose required check "Required" is missing for longer than stall_minutes after the CR's pushedAt
    When the reviewer checks for red or stalled gates
    Then the CR stays ready
    And the reviewer calls escalate-to-human once with the Access trigger, naming the check

  # Source: skills/review-pr/SKILL.md, "Report"
  Scenario: A deviation written back into the spec is not a finding
    Given a criterion graded DEVIATED
    And the spec comment was updated to match the change
    When the reviewer writes the report
    Then the criterion grades as DONE
    And it is neither a finding nor a Nit

  # Source: skills/review-pr/SKILL.md, "Spec pass"
  Scenario: Only a bot's verify-ux comment is evidence
    Given a criterion with proof computer-use
    And a "<!-- verify-ux -->" comment for this head by an account outside owners.bots
    When the reviewer grades the criterion
    Then the reviewer ignores that comment
    And with no verify-ux comment by a bot after stall_minutes, the reviewer calls escalate-to-human once with the Access trigger

  # Source: skills/review-pr/SKILL.md, "Once per head"
  Scenario: A head that already has a report is not reviewed again
    Given the newest review-pr report is for the current head
    And no trusted comment came after it
    When review-pr runs
    Then it posts nothing and stops

  # Source: skills/review-pr/SKILL.md, "Behind the trunk"
  Scenario: The factory never pushes a sync onto a person's CR
    Given a ready CR a person opened is behind the trunk
    When review-pr handles it
    Then it posts one comment asking the author to update the CR
    And it runs no "forge sync"

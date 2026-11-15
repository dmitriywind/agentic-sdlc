# Owner: skills/review-pr/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:review-pr
Feature: Review a change request
  As the factory
  I want a fresh reviewer to grade a CR against its ticket and spec
  So that only a proven, correct CR is marked ready and auto-merged

  # Source: skills/review-pr/SKILL.md, "Decide" (PASS)
  # Proof: test/forge.test.ts "two identities: status and approve need review_token_env and never use the implementer token; a missing token env fails naming the variable"
  Scenario: PASS with two identities marks the CR ready with auto-merge
    Given forge.review_identity is set
    And a draft CR for a ticket at In review
    And every criterion is proven
    And no Important finding is open
    And "Required" and "proofs-on-base" are green on this head
    When the review runtime decides
    Then it posts the review status as forge.review_identity with state success
    And it approves the CR with the review token
    And it runs "forge ready <n>" and "forge automerge <n>"
    And the ticket still shows In review

  # Source: skills/review-pr/SKILL.md, "Decide" (PASS, one identity); src/forge/github.ts, "approve"
  # Proof: test/forge.test.ts "one identity: status posts with the implementer token; approve is refused, since GitHub refuses the author"
  Scenario: PASS with one identity posts only the report and gives no approval
    Given forge.review_identity is empty
    And a draft CR that passes review
    When review-pr decides in the cycle
    Then it posts its report and no status
    And it does not run "forge approve", which refuses with one identity
    And it runs "forge ready <n>", waits up to 5 minutes for CI's review status, then runs "forge automerge <n>"
    And for a CR that needs a human it asks a collaborator to approve the head, or the owner to merge it as admin

  # Source: src/forge/github.ts; references/architecture.md §3.2, "Adapter"
  # Proof: test/forge.test.ts "github: in a cloud session every verb is REST under repos/ and ready, draft, automerge use the ccr routes; an unset token_env falls back to the proxy"
  Scenario: The forge verbs work in a Claude cloud session
    Given the runtime is a Claude cloud session (CLAUDE_CODE_REMOTE=true)
    When the reviewer runs "forge ready <n>", "forge draft <n>" or "forge automerge <n>"
    Then the adapter calls the proxy's pulls/<n>/ccr route for it
    And no forge verb calls GraphQL
    And only "closing" calls a path outside repos/<owner>/<repo> (search/issues), which the session refuses
    And when the env var that forge.options.token_env names is unset, the verbs use the proxy's token

  # Source: src/forge/github.ts; references/architecture.md §3.2, "Adapter"
  # Proof: test/forge.test.ts "github: a repo without draft PRs marks drafts with the draft label; an unprotected trunk merges once required checks are green"
  Scenario: A private repo on GitHub Free holds drafts and merges unattended
    Given a repo that refuses draft pull requests and has no ruleset or branch protection on the trunk
    When the factory runs "forge open --draft", "forge ready <n>" and "forge draft <n>"
    Then a draft CR is a ready pull request with the "draft" label, and ready removes the label
    When the reviewer runs "forge automerge <n>" and GitHub refuses auto-merge
    Then the adapter merges the CR at its head only when it is ready and every forge.required_checks entry is green there

  # Source: references/architecture.md, "One identity or two"; src/forge/index.ts, "status"
  # Proof: test/forge.test.ts "cli: status refuses the contexts only a gate posts"
  Scenario: The reviewer cannot post a gate's status
    Given the review runtime holds the review token
    When it runs "forge status <head> --context human-approval --state success"
    Then the CLI refuses with a usage error
    And no status is posted

  # Source: skills/review-pr/SKILL.md, "Send back"
  # Proof: skill text only
  Scenario: Findings on a CR a person opened go back to that person
    Given a CR opened by an author outside owners.bots
    And the review finds an Important finding
    When the reviewer decides
    Then the reviewer runs "forge draft <n>"
    And the ticket stays In review
    And the reviewer pushes nothing to the change line
    And the reviewer reviews again when the CR head changes

  # Source: skills/review-pr/SKILL.md, "Report" and "Send back"
  # Proof: skill text only
  Scenario: An Important finding sends the ticket back
    Given a product CR with a criterion graded NOT DONE
    When the reviewer decides
    Then the report starts with "<!-- review-pr <head sha> -->"
    And the verdict is REMEDIATION REQUIRED
    And the reviewer posts no approval
    And, below "cycle.max_rework" such reports on the CR, the ticket moves to In progress for implement-spec

  # Source: skills/review-pr/SKILL.md, "Report"
  # Proof: skill text only
  Scenario: A Nit never blocks PASS
    Given the only findings are Nits
    And every hunt line is a Nit and not a bug
    When the reviewer decides
    Then the report lists the Nits, at most 5
    And the verdict is PASS

  # Source: skills/review-pr/SKILL.md, "Spec pass"
  # Proof: skill text only
  Scenario: A manual criterion waits for an owner
    Given a criterion with proof manual
    And no trusted owner comment confirms it for this head
    When the reviewer runs the spec pass
    Then the reviewer posts one ask on the ticket that names the criterion and the head sha
    And the criterion is PENDING and is not a finding
    And the CR stays draft
    And the reviewer posts no report, no status and no approval

  # Source: skills/review-pr/SKILL.md, "CI results"
  # Proof: skill text only
  Scenario: A pending or missing check stops the review
    Given a required check is pending on the head
    When the reviewer reads the CI results
    Then the reviewer stops with no report and reviews again on the next run
    And the pending check is not a finding
    And on a draft CR a check missing for longer than stall_minutes after the CR's pushedAt calls escalate-to-human once with the Access trigger

  # Source: skills/review-pr/SKILL.md, "Decide" (PASS)
  # Proof: test/guard.test.ts "forge approve is for the review role only"
  Scenario: No review token means no approval
    Given forge.options.review_token_env is unset
    When the reviewer tries to post the status and the approval
    Then both fail
    And the reviewer calls escalate-to-human with the Access trigger
    And the reviewer posts nothing else

  # Source: skills/review-pr/SKILL.md, "Behind the trunk"
  # Proof: test/forge.test.ts "github: in a cloud session every verb is REST under repos/ and ready, draft, automerge use the ccr routes; an unset token_env falls back to the proxy"
  Scenario: A ready CR behind the trunk is synced
    Given a ready CR at In review
    And its change line is behind the trunk
    When the reviewer runs
    Then it runs "forge sync <n>"
    And it repeats the CI check and the decision on the new head once CI has reported

  # Source: skills/review-pr/SKILL.md, "Red or stalled gate"
  # Proof: test/forge.test.ts "github: draft = ready --undo outside the cloud, checks from REST (the newest run per name), status via api"
  Scenario: A red check caused by the diff sends the ticket back
    Given a ready CR at In review
    And a required check is red
    And the cause is in the diff or the ticket's scope
    When the reviewer reads the failing check with "forge runs --failed"
    Then it runs "forge draft <n>"
    And the ticket moves to In progress with the cause

  # Source: src/forge/github.ts, "view"
  # Proof: test/forge.test.ts "github: draft = ready --undo outside the cloud, checks from REST (the newest run per name), status via api"
  Scenario: A re-run check counts by its newest run
    Given a check failed and a re-run of the same check passed on the head
    When the reviewer reads the CR with "forge view <n>"
    Then the check shows once, with the state of the newest run

  # Source: skills/review-pr/SKILL.md, intro paragraph and "Send back"
  # Proof: skill text only
  Scenario: A factory CR is graded without a ticket
    Given a draft CR dispatched with --cr
    And only paths.factory changed
    When the reviewer reviews it
    Then the reviewer reads no ticket
    And it grades the CR's stated target, cause and proof
    And a finding keeps the CR draft with the report on the CR

  # Source: skills/review-pr/SKILL.md, "Red or stalled gate"
  # Proof: skill text only
  Scenario: A pending human approval is not a stalled check
    Given a ready CR whose "human-approval" status is pending for longer than stall_minutes
    And every other required check is green
    When the reviewer checks for red or stalled gates
    Then the CR stays ready
    And the reviewer files no Signal and no escalation

  # Source: skills/review-pr/SKILL.md, "CI results" and "Red or stalled gate"
  # Proof: skill text only
  Scenario: A red check on a draft CR sends the work back
    Given a draft CR opened by the factory whose "Required" check is red
    When the reviewer reads the CI results
    Then it reads the failing check
    And with the cause in the diff, the ticket moves to In progress with the cause

  # Source: skills/review-pr/SKILL.md, "Red or stalled gate"
  # Proof: skill text only
  Scenario: A ready CR with a check that never reported is escalated, not sent back
    Given a ready CR whose required check "Required" is missing for longer than stall_minutes after the CR's pushedAt
    When the reviewer checks for red or stalled gates
    Then the CR stays ready
    And the reviewer calls escalate-to-human once with the Access trigger, naming the check

  # Source: skills/review-pr/SKILL.md, "Report"
  # Proof: skill text only
  Scenario: A deviation written back into the spec is not a finding
    Given a criterion graded DEVIATED
    And the spec comment was updated to match the change
    When the reviewer writes the report
    Then the criterion grades as DONE
    And it is neither a finding nor a Nit

  # Source: skills/review-pr/SKILL.md, "Spec pass"
  # Proof: skill text only
  Scenario: Only a bot's verify-ux comment is evidence
    Given a criterion with proof computer-use
    And a "<!-- verify-ux -->" comment for this head by an account outside owners.bots
    When the reviewer grades the criterion
    Then the reviewer ignores that comment
    And with no verify-ux comment by a bot after stall_minutes, the reviewer calls escalate-to-human once with the Access trigger

  # Source: skills/review-pr/SKILL.md, "Once per head"
  # Proof: skill text only
  Scenario: A head that already has a report is not reviewed again
    Given the newest review-pr report is for the current head
    And no trusted comment came after it
    When review-pr runs
    And the CR is a draft
    When review-pr runs
    Then it posts nothing and stops
    Given that report is a red-gate note whose "Signal: <id>" ticket is now closed
    Then review-pr reviews the draft CR from step 1
    Given the CR is ready
    Then review-pr is not stopped by the report: it continues at the step for the CR's state

  # Source: skills/review-pr/SKILL.md, "Send back"
  # Proof: skill text only
  Scenario: The rework cap sends the ticket to a human
    Given a product CR opened by the factory has findings
    And the trusted REMEDIATION REQUIRED reports on it, this one included, number "cycle.max_rework" or more
    When the reviewer decides
    Then the ticket does not move to In progress
    And the CR is draft
    And the reviewer calls escalate-to-human with the Repeat trigger and the count

  # Source: skills/review-pr/SKILL.md, "Behind the trunk"
  # Proof: skill text only
  Scenario: The factory never pushes a sync onto a person's CR
    Given a ready CR a person opened is behind the trunk
    When review-pr handles it
    Then it posts one comment asking the author to update the CR
    And it runs no "forge sync"

  # Source: skills/review-pr/SKILL.md, "Green but open"; skills/sdlc/SKILL.md, Routing
  # Proof: test/forge.test.ts "github: a repo without draft PRs marks drafts with the draft label; an unprotected trunk merges once required checks are green"
  Scenario: A ready CR with every required check green that is still open is merged
    Given a ready CR at In review whose every forge.required_checks entry is green on its head
    And the CR is still open
    When the cycle routes it to review-pr
    Then review-pr runs "forge automerge <n>"

  # Source: src/ports.ts, "parseCloses"
  # Proof: test/forge.test.ts "parseCloses never reads an id from the next line and dedupes"
  Scenario: A CR names its ticket with a Closes line on one line
    Given a CR body with "Closes" at the end of a line and a title on the next line
    Then the CR links no ticket
    And a repeated "Closes <id>" line links the ticket once

  # Source: src/forge/index.ts, "cli"
  # Proof: test/forge.test.ts "cli: JSON on stdout, usage error is 2, failure is 1"
  Scenario: The forge CLI answers JSON and sets the exit code
    When a skill runs a forge verb
    Then the result is JSON on stdout and the exit code is 0
    And a missing argument or an unknown verb exits with 2
    And a failed call exits with 1

  # Source: src/forge/github.ts, "list", "approvals" and "view"
  # Proof: test/forge.test.ts "github reads: merged CRs are the closed pulls with a merge, approvals are { user, state, sha }, pushedAt is the first check suite on the head"
  Scenario: The forge reads merged CRs, approvals and the push time of a head
    When a skill runs "forge list --state merged", "forge approvals <n>" or "forge view <n>"
    Then a merged CR is a closed CR with a merge
    And an approval holds the user, the state and the head sha of the review
    And the push time is the first check suite on the head, or absent when none can be read

  # Source: src/forge/github.ts, "cut"
  # Proof: test/forge.test.ts "cut: dispatches the release workflow and returns the run newer than any before it"
  Scenario: A release cut starts the release workflow and returns its run
    When the release skill runs "forge cut <revision> <version>"
    Then the forge dispatches the release workflow for that revision and version
    And the result names the run that is newer than every run before the dispatch

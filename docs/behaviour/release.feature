# Owner: skills/release/SKILL.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:release
Feature: Release to the last environment
  As a Product owner
  I want the factory to prepare a release proposal and wait for my go-ahead
  So that nothing reaches the last environment without my approval

  # Source: skills/release/SKILL.md, "Steps 0a. P0 entry"
  Scenario: A Done P0 fix starts a release request
    Given a P0 ticket is Done with Shipped On the environment before the last
    And no open release request has the title "Release for P0 #<id>"
    When the release skill runs for that ticket
    Then it creates a ticket at Backlog with the label board.labels.release
    And the title of the ticket is "Release for P0 #<id>"
    And the run continues on that ticket

  # Source: skills/release/SKILL.md, "Steps 0a. P0 entry" (the title is the dedupe key)
  Scenario: A second run for the same P0 reuses the open request
    Given an open release request has the title "Release for P0 #<id>"
    When the release skill runs again for that P0 ticket
    Then it creates no new ticket
    And it continues on the open request

  # Source: skills/release/SKILL.md, "Steps 3. Ready check"
  Scenario: A failed ready check stops the release
    Given a ticket in the release range is held, or a P0 is open
    When the release skill does the ready check
    Then it names each failing item
    And it stops without a proposal

  # Source: skills/release/SKILL.md, "Steps 3. Ready check"
  Scenario: Rollback proof is part of the ready check
    Given commands.rollback is named
    And no rollback run is recorded in the environment before the last since the previous release tag
    When the release skill does the ready check
    Then the check fails
    And the release skill names the missing rollback run

  # Source: skills/release/SKILL.md, "Steps 4. Version"
  Scenario: A version is never reused
    Given a version was used by a failed release
    When the release skill picks a version
    Then it picks a version that is not a tag and not a release line

  # Source: skills/release/SKILL.md, "Steps 5. Propose"
  Scenario: The proposal goes to the Product owner and the run stops
    Given the ready check passed
    When the release skill proposes the release
    Then it posts one comment on the release request
    And the first line of the comment is "<!-- release-proposal <revision> -->"
    And the comment lists the contents, the version, the revision and the open signals per environment
    And the run stops

  # Source: skills/release/SKILL.md, "Steps 5. Propose" (P0 case)
  Scenario: A P0 proposal names the P0
    Given the request is for a P0 fix
    When the release skill proposes the release
    Then the first line of the comment names the P0
    And the comment says that only the commits needed for the P0 are in the proposal

  # Source: skills/release/SKILL.md, "Steps 0. Resume"
  Scenario: Resume without a reply does nothing
    Given the newest comment with "<!-- release-proposal" has no trusted Product owner reply after it
    When the release skill is dispatched again
    Then it stops
    And it writes no comment
    And it reads nothing more

  # Source: skills/release/SKILL.md, "Steps 0. Resume" and "Steps 6. Mark"
  Scenario Outline: A trusted Product owner reply picks the entry step
    Given the newest proposal has a trusted Product owner reply that <reply>
    When the release skill is dispatched again
    Then it resumes at <step>

    Examples:
      | reply                | step                |
      | approves the release | step 6, Mark        |
      | changes the contents | step 3, Ready check |
      | asks to refresh      | step 1, Gather      |

  # Source: skills/release/SKILL.md, "Steps 0. Resume" and "Steps 6. Mark"
  Scenario: Only the Product owner gives the go-ahead
    Given the proposal has a later comment by a bot or by the Factory owner
    And no comment by owners.product follows the proposal
    When the release skill resumes
    Then it reads comments with "--author <owners.product>"
    And it stops without a cut

  # Source: skills/release/SKILL.md, "Steps 6. Mark" and "Steps 7. Cut"
  Scenario: The go-ahead leads to a cut from one trunk revision
    Given a trusted Product owner approved the proposal
    When the release skill continues
    Then it sets release_version on each selected ticket
    And it runs "agentic-sdlc vcs cut <revision> <version>" from the chosen revision
    And it sets Shipped "In release" on each selected ticket
    And it closes the request as completed

  # Source: skills/release/SKILL.md, "Rules"
  Scenario: The skill never approves the last environment
    Given a release request is open
    When the release skill runs
    Then it does not approve the last environment
    And it never commits to a release line

  # Source: skills/release/SKILL.md, "Rules"
  Scenario: A failed release leaves its line untouched
    Given a release failed in the last environment
    And the fix is Done with Shipped On the environment before the last
    When the release skill runs
    Then it cuts the next version
    And it does not change the failed release line

# Owner: skills/implement-spec/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:implement-spec
Feature: Implement a spec
  As the factory
  I want to implement a ticket's spec test first on one change line and open a draft CR
  So that the Product owner gets a small, proven change that review-pr can grade

  # Source: skills/implement-spec/SKILL.md, "Claim" and "Draft CR"
  # Proof: skill text only
  Scenario: A Ready ticket becomes a draft CR
    Given a ticket at Status Ready with a trusted spec
    And the ticket has no needs-human label
    And no one but this run's executor is assigned to the ticket
    When the factory runs implement-spec
    Then the ticket moves to In progress
    And the factory opens one draft CR for one change line
    And the CR body has exactly one line "Closes <id>" for this ticket
    And the ticket shows In review

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: test/board-adapters.test.ts "board move on github, jira and linear refuses when the status differs and writes nothing, else writes the resolved id"
  Scenario: A second run cannot claim the same ticket
    Given a ticket at Status Ready
    And another run has already moved it to In progress
    When the factory runs "board move <id> "In progress" --only-from Ready"
    Then the move is refused
    And the board does not change

  # Source: skills/implement-spec/SKILL.md, intro paragraph
  # Proof: skill text only
  Scenario: A ticket with no trusted spec goes back to shape
    Given a ticket at Status Ready, in either lane
    And no trusted comment starts with the spec marker
    And the ticket body lists criteria
    When the factory runs implement-spec
    Then the ticket moves to Backlog with "--only-from Ready"
    And one comment names the missing spec
    And the factory writes no code

  # Source: skills/implement-spec/SKILL.md, "Test first"
  # Proof: skill text only
  Scenario: Each plan step starts with a failing proof
    Given a spec with a plan of several steps
    When the factory implements a step
    Then it writes one failing proof through the public interface
    And it sees the proof red
    And it keeps the red output for the CR body
    And it makes the proof green
    And it refactors

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: test/forge.test.ts "cli: comments --trusted keeps the owners and bots by forge name, --last counts after the filter, and pages come from gh api"
  Scenario: Rework from CR comments
    Given a ticket at In progress
    And an open CR closes the ticket
    And the CR has a trusted review-pr report with Important findings
    When the factory runs implement-spec
    Then it reads the newest report with "forge comments <n> --last 1 --marker "<!-- review-pr" --trusted"
    And it fixes each Important finding first
    And it opens no second CR

  # Source: skills/implement-spec/SKILL.md, "Draft CR"
  # Proof: skill text only
  Scenario: A CR that is already open moves the ticket to In review
    Given a ticket at In progress
    And a CR opened by the factory for the change line is already open
    When the fast check passes and the change line is pushed
    Then the ticket moves to In review
    And the factory opens no second CR

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: skill text only
  Scenario: A CR a person opened is handed to review, not taken over
    Given a ticket at Ready or In progress
    And an open CR closes the ticket
    And an author outside owners.bots opened the CR
    When implement-spec claims the ticket
    Then the ticket moves to In review with --only-from its status
    And implement-spec posts one comment that review-pr reviews the CR
    And implement-spec pushes nothing to that change line

  # Source: skills/implement-spec/SKILL.md, "Rules"
  # Proof: skill text only
  Scenario: A diff over the size limit goes back to Backlog
    Given the diff outgrows the size limit
    When the factory finds the size problem
    Then the ticket goes back to Backlog with the reason
    And shape splits the ticket

  # Source: skills/implement-spec/SKILL.md, "Rules"
  # Proof: skill text only
  Scenario: A cause that is not known goes to shape
    Given a fix fails and its cause is not known
    When the factory meets the failure
    Then the diagnosis belongs to shape, not to implement-spec

  # Source: references/architecture.md, "Adapter"; src/board/
  # Proof: test/board-adapters.test.ts "a board adapter without its credential fails naming the variable, and github passes token_env as GH_TOKEN on every call"
  Scenario: A board adapter without its credential fails and names the variable
    Given a board adapter whose token_env or credential variables are unset
    When the factory runs a board verb
    Then the verb fails
    And the message names the missing variable
    And no call reaches the board

  # Source: references/architecture.md, "Adapter"; src/board/
  # Proof: test/board-adapters.test.ts "board reads on jira, linear and github follow every page, and fail instead of returning a partial list"
  # Proof: test/board-adapters.test.ts "github-issues comments page, newest first, and filter by marker"
  Scenario: A board read returns every page or fails
    Given a board with more items or comments than one page holds
    When the factory runs "board list" or "board comments <id>"
    Then it gets every item or comment from every page
    And a board that does not advance, or holds more than the read limit, makes the verb fail

  # Source: src/board/index.ts, "comments"
  # Proof: test/board-local.test.ts "comments come newest first and narrow by marker, last and author, with --last counted after the filter"
  Scenario: Board comments come newest first and narrow by marker, author and count
    Given a ticket with comments from several authors
    When the factory runs "board comments <id>" with --marker, --author or --last
    Then the newest comment comes first
    And --author keeps only the named authors
    And --last counts after the filter

  # Source: src/exec.ts, "ghRetry"
  # Proof: test/forge.test.ts "gh reads retry up to 3 tries on 429, a rate-limit 403 and 5xx, honouring a retry-after hint; writes retry only on a rate limit"
  # Proof: test/board-adapters.test.ts "the GitHub boards retry a milestone write on a rate limit but not on a 5xx; a read retries on both"
  Scenario: A gh call that hit a rate limit or a server error is retried when it is safe
    Given gh reports HTTP 429, a 403 that names a rate limit, or HTTP 5xx
    When an adapter makes a read call
    Then it tries up to 3 times and waits the retry-after time gh prints, else 1 and 2 seconds
    When an adapter makes a write call
    Then it retries only a 429 or a rate limit, never a 5xx
    And it does not retry any other 403


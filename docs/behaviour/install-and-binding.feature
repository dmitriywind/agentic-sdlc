# Owner: src/binding.ts (validateBinding, bindingWarnings), src/install.ts (init, validate, doctor). The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@cli:init @cli:validate @cli:doctor
Feature: Install and validate the binding
  As an adopter
  I want to install the factory in my project and check my binding
  So that the gates and skills run with my project values

  # Source: src/board/index.ts, "createBoard" (scope); src/binding.ts, "validateBinding" (board.scope)
  # Proof: test/board-local.test.ts "board.scope: many repos on one board; a repo lists its own label, the home repo also the unlabelled, create adds the label"
  Scenario: Many repos share one board through board.scope
    Given two repos whose bindings name the same board, one with board.scope.label "repo:a", one with "repo:b" and home true
    When each repo runs "board list"
    Then repo a sees only tickets labelled "repo:a"
    And the home repo sees tickets labelled "repo:b" and tickets with no "repo:" label
    And "board create" in each repo adds that repo's label
    And validate fails a home binding whose board.scope.repos does not list every repo label

  # Source: src/board/index.ts, "checked"
  # Proof: test/board-local.test.ts "create and move refuse a status the binding does not list"
  Scenario: A board refuses a status that board.statuses does not list
    When a skill runs "board create" or "board move" with a status outside "board.statuses"
    Then the command fails and the ticket does not change

  # Source: src/forge/github.ts, "view" and "viewBySha"
  # Proof: test/forge.test.ts "github view reads every page of check runs and commit statuses"
  Scenario: A CR view reads every page of checks and statuses
    Given a head commit with more than 100 check runs or 30 statuses
    When a skill runs "forge view <n>"
    Then every check run and status is in the checks, so a failing one cannot fall off

  # Source: src/forge/github.ts, "viewBySha"
  # Proof: test/forge.test.ts "github viewBySha prefers the merge commit, then the head, then the first pull"
  Scenario: A commit with several pulls resolves to the pull it merged, or else the one it heads
    Given a commit is listed under several pulls
    When a skill runs "forge view --sha <sha>"
    Then the pull whose merge commit is the sha wins, then the pull whose head is the sha, then the first

  # Source: src/forge/github.ts
  # Proof: test/forge.test.ts "github refuses a change request number or sha that is not an id before calling gh"
  Scenario: The github forge takes only numbers and hex shas as ids
    When a skill runs a "forge" verb with a CR number that is not a number or a sha that is not hex
    Then the command fails before gh runs

  # Source: src/board/index.ts, "milestone"
  # Proof: test/board-local.test.ts "milestone sets and clears the milestone of an existing ticket"
  Scenario: A ticket's milestone is set or cleared where create puts it
    Given a ticket on any board adapter
    When the factory runs "board milestone <id> <name>"
    Then the ticket has that milestone, as "create --milestone" would have set it
    When the factory runs "board milestone <id> --clear"
    Then the ticket has no milestone

  # Source: src/forge/util.ts, "parseStrict"
  # Proof: test/board-local.test.ts "board cli: an unknown flag, a flag without a value and an unreadable --body-file are usage errors, --k=v works, milestone sets and clears"
  # Proof: test/forge.test.ts "forge and vcs cli: an unknown flag, a flag without a value and an unreadable --body-file are usage errors; --k=v works"
  Scenario: A board, forge or vcs verb refuses a flag it does not know
    When the factory runs a verb with a flag the verb does not list
    Then it exits 2 with "unknown flag --x for <group> <verb>"
    When a flag that takes a value has none
    Then it exits 2 with "--x needs a value"
    When "--body-file" names a file that cannot be read
    Then it exits 2 and names the flag and the path
    And "--k=v" is the same as "--k v"
    When a numeric flag ("--last", "--limit") has a value that is not a whole number
    Then it exits 2 and names the flag and the value
    When "board milestone <id> <name> --clear" gives a name and "--clear" together
    Then it exits 2

  # Source: src/forge/github.ts, "list"
  # Proof: test/forge.test.ts "forge list: --limit and --since bound the read, and without --checks no check data is fetched"
  Scenario: A CR list is bounded and carries no check data unless asked
    When the factory runs "forge list --state merged --limit 2 --since <date>"
    Then it gets the newest CRs merged since the date, at most 2
    And each CR has no checks, unless "--checks" reads them
    And "bench build" and "bench propose" read only the newest merged CRs, or those from "--merged-limit" and "--since"

  # Source: src/forge/github.ts, "run"
  # Proof: test/forge.test.ts "forge run reads one CI run by id; a missing run fails; cli list and run take their flags"
  Scenario: One CI run is read by id
    When the factory runs "forge run <id>"
    Then it gets that run
    And a run that does not exist exits 1

  # Source: hooks/guard.mjs, "sdlc-reviewer"
  # Proof: test/guard.test.ts "the sdlc-reviewer agent runs only the agentic-sdlc CLI in Bash"
  Scenario: The reviewer agent runs no code but the CLI
    When the sdlc-reviewer agent runs a Bash command that is not a call to the "agentic-sdlc" command from PATH or "npx --no agentic-sdlc"
    Then the guard hook exits with code 2
    And a path to a file named "agentic-sdlc", "node <file>", a pipe, an expansion and a redirection to a file exit with code 2
    And "agentic-sdlc forge view 3" from that agent exits with code 0


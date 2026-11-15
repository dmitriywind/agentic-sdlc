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

  # Source: src/board/index.ts, "milestone"
  # Proof: test/board-local.test.ts "milestone sets and clears the milestone of an existing ticket"
  Scenario: A ticket's milestone is set or cleared where create puts it
    Given a ticket on any board adapter
    When the factory runs "board milestone <id> <name>"
    Then the ticket has that milestone, as "create --milestone" would have set it
    When the factory runs "board milestone <id> --clear"
    Then the ticket has no milestone

  # Source: hooks/guard.mjs, "sdlc-reviewer"
  # Proof: test/guard.test.ts "the sdlc-reviewer agent runs only the agentic-sdlc CLI in Bash"
  Scenario: The reviewer agent runs no code but the CLI
    When the sdlc-reviewer agent runs a Bash command that is not a call to the "agentic-sdlc" command from PATH or "npx --no agentic-sdlc"
    Then the guard hook exits with code 2
    And a path to a file named "agentic-sdlc", "node <file>", a pipe, an expansion and a redirection to a file exit with code 2
    And "agentic-sdlc forge view 3" from that agent exits with code 0


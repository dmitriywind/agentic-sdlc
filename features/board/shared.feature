# Source: src/board/index.ts "createBoard" and "checked"; references/architecture.md section 3.1
@board:shared
Feature: What every board adapter does the same way
  A skill calls `agentic-sdlc board <verb>` and never a vendor CLI. Whatever the tracker, an adapter fails clearly
  when its binding is missing a key it needs.

  Rule: An adapter that lacks its binding fails before it reaches the board

    Scenario: A board verb with a missing required option names the binding key and validate
      Given the github-issues board adapter
      And the board adapter has no option "repo"
      When the factory gets the ticket "7"
      Then the verb fails matching "board\.options\.repo.*agentic-sdlc validate"
      And no call reaches the board

# Source: src/board/index.ts "bootstrap"; src/board/github-issues.ts "bootstrap"
@board:bootstrap
Feature: Board bootstrap creates what the board needs, once
  `agentic-sdlc board bootstrap` creates the labels the binding names (statuses, signal streams, the human and
  approval labels) and, while heartbeat.ticket is unresolved, a heartbeat issue with no status label, so it is off
  every route. A second run finds both and creates nothing.

  Scenario: The first run creates the missing labels and the heartbeat; the second creates nothing
    Given the github-issues board adapter
    And the binding sets "board.statuses" to the list "Signals, Ready"
    And the binding sets "board.signal_streams" to the list "owner"
    And the binding sets "board.labels.human" to "needs-human"
    And the binding sets "heartbeat.ticket" to "unresolved: the heartbeat ticket id"
    And the repo has the labels "status:Ready"
    When the factory bootstraps the board
    Then the bootstrap created the labels "status:Signals, priority:P0, priority:High, priority:Default, priority:Low, needs-human, signal:owner, approved"
    And the bootstrap created a heartbeat ticket
    When the factory bootstraps the board
    Then the bootstrap created the labels ""
    And the bootstrap found the same heartbeat ticket

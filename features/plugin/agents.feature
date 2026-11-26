# Source: agents/sdlc-reviewer.md; the Bash side of the boundary is in features/guard/push-guard.feature
@plugin
Feature: The plugin's reviewer cannot change the CR it reviews
  The sdlc-reviewer agent reviews a change in a fresh context. It reads files and runs only the CLI; the guard hook
  limits its Bash, and its own tool list leaves out every tool that edits a file or delegates.

  Scenario: The reviewer has no tool that edits or delegates
    Given the plugin agent "sdlc-reviewer"
    Then the agent has no tool among "Edit, Write, NotebookEdit, Agent"
    And the agent disallows "Edit, Write, NotebookEdit, Agent"

# Source: bin/agentic-sdlc
@plugin
Feature: The plugin puts the CLI on the Bash path
  With the plugin enabled, an agent runs `agentic-sdlc <group> <verb>`. The project's pinned build runs when it
  exists; otherwise the plugin's own build runs.

  Scenario: A project that pins no build runs the plugin's build
    When bin/agentic-sdlc runs with --version in a project that pins no build
    Then the exit code is 0
    And it prints the package version

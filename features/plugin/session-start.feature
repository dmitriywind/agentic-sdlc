# Source: hooks/session-start.mjs, hooks/hooks.json (SessionStart); src/install.ts "reviewSandbox" registers it without the plugin
@plugin
Feature: A session starts oriented
  At session start the hook prints a few lines the agent reads first: that the project runs the factory, which
  skill runs a cycle and which installs, repairs or answers what waits on the person. A project with no binding
  gets one line offering the setup.

  Scenario: A project with a binding is told which skill to load for a cycle and which for setup or status
    Given the project has the file ".agents/binding.yml" holding "version: 2\n"
    When a session starts in the project under the plugin
    Then the exit code is 0
    And the output says "agentic-sdlc:sdlc"
    And the output says "agentic-sdlc:setup"
    And the orientation has at most 80 words

  Scenario: A project without a binding gets one line offering setup, with the copied skill name outside the plugin
    When a session starts in the project without the plugin
    Then the exit code is 0
    And the orientation is one line
    And the output says "sdlc-setup"

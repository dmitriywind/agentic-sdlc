# Owner: dist/bin.js. Runs the bundled CLI, so a module the bundler dropped (a computed dynamic import) fails here.
# The scenario runs only when dist/bin.js exists: build first.
@dist
Feature: The built CLI works
  The plugin and github: installs run dist/bin.js, not the sources.

  Scenario: The built CLI installs a project, validates it and serves an MCP call
    Given the built CLI dist/bin.js and an empty project
    When the built CLI runs "init --board local --harness generic"
    And the built CLI runs "validate"
    Then the built CLI output says "ok"
    When an MCP client calls the tool "board_create" with the title "t", the body "b" and the status "Signals"
    Then the MCP call succeeds and the ticket is created at status "Signals"

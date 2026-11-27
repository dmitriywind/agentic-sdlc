# Owner: dist/bin.js. Runs the bundled CLI, so a module the bundler dropped (a computed dynamic import) fails here.
# The scenario fails when dist/bin.js is missing: run npm run build.
@dist
Feature: The built CLI works
  The plugin and github: installs run dist/bin.js, not the sources.

  Scenario: The built CLI installs a project, lists what it could not know and serves an MCP call
    Given the built CLI dist/bin.js and an empty project
    When the built CLI runs "init --board local --no-plugin"
    And the built CLI runs "validate --json", which may fail
    Then the built CLI output says "unresolved[^]*owners.product"
    When an MCP client calls the tool "board_create" with the title "t", the body "b" and the status "Signals"
    Then the MCP call succeeds and the ticket is created at status "Signals"

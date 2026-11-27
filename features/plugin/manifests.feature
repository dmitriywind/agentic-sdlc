# Source: .claude-plugin/plugin.json
@plugin
Feature: Claude Code installs the package as a plugin
  The plugin manifest carries the package version.

  Rule: The manifest names the package and carries its version

    Scenario: The manifest is named agentic-sdlc and carries the package version
      Then the manifest in .claude-plugin is named "agentic-sdlc"
      And the manifest in .claude-plugin carries the package version

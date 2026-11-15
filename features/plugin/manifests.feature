# Source: .claude-plugin/plugin.json, .codex-plugin/plugin.json, .cursor-plugin/plugin.json, mcp.json
@plugin
Feature: Claude Code, Codex and Cursor install the package as a plugin
  Each tool reads its own manifest. All three carry the package version and point at the same skills folder and
  at `mcp.json`, which starts `npx --no agentic-sdlc mcp`.

  Rule: The three manifests name the package and carry its version

    Scenario Outline: A manifest is named agentic-sdlc and carries the package version
      Then the manifest in <dir> is named "agentic-sdlc"
      And the manifest in <dir> carries the package version

      Examples:
        | dir            |
        | .claude-plugin |
        | .codex-plugin  |
        | .cursor-plugin |

  Rule: The Cursor manifest follows the Cursor schema

    Scenario: The Cursor manifest has no key its schema refuses
      Then the Cursor manifest has only keys its schema allows

    Scenario: The Cursor manifest name is a lowercase slug
      Then the Cursor manifest name is a lowercase slug

  Rule: Codex and Cursor point at real paths

    Scenario Outline: The skills path is a folder and the MCP file starts the server
      Then the skills path of the manifest in <dir> is a directory
      And the MCP path of the manifest in <dir> starts the server with "--no agentic-sdlc mcp"

      Examples:
        | dir            |
        | .codex-plugin  |
        | .cursor-plugin |

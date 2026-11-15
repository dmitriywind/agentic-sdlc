# Source: agents/*.md, package.json "files"
@plugin
Feature: The Claude Code plugin ships a subagent per tier and a reviewer
  With the plugin enabled and no `init`, an agent can run one skill step on the tier that suits it, or review
  a change with no way to edit files. The tier's model is a binding value: `init` writes it into the project's agent.

  Rule: One agent per tier

    Scenario Outline: A tier agent inherits the model and runs the steps of its tier
      Given the plugin agent "sdlc-<tier>"
      Then the agent is named "sdlc-<tier>"
      And the agent inherits the model
      And the agent description matches "whose tier is <tier>"
      And the agent description does not match "skill step|metadata.tier"

      Examples:
        | tier     |
        | fast     |
        | balanced |
        | deep     |

  Rule: The reviewer reads files and runs only the CLI

    Background:
      Given the plugin agent "sdlc-reviewer"

    Scenario: The reviewer has no tool that edits or delegates
      Then the agent has no tool among "Edit, Write, NotebookEdit, Agent"
      And the agent disallows "Edit, Write"

    Scenario Outline: The reviewer reads, runs the CLI and reaches the MCP server
      Then the agent has the tool "<tool>"

      Examples:
        | tool                                  |
        | Read                                  |
        | Bash                                  |
        | mcp__plugin_agentic-sdlc_agentic-sdlc__* |

    Scenario: The reviewer stops after a number of turns
      Then the agent has a turn limit

    Scenario: The reviewer runs the review step
      Then the agent description matches "review/review step"
      And the agent description does not match "review-pr"

  Rule: A plugin agent sets only what the plugin honours

    Scenario Outline: A plugin agent does not set a key that plugins ignore
      Then no plugin agent sets "<key>"

      Examples:
        | key            |
        | hooks          |
        | mcpServers     |
        | permissionMode |

  Rule: The package ships the plugin's folders

    Scenario Outline: A plugin folder is in the package
      Then the package ships "<folder>"

      Examples:
        | folder         |
        | agents         |
        | bin            |
        | evals          |
        | hooks          |
        | .claude-plugin |
        | .codex-plugin  |
        | .cursor-plugin |
        | mcp.json       |

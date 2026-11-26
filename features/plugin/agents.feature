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
        | deep     |

  Rule: The reviewer reads files and runs only the CLI

    Background:
      Given the plugin agent "sdlc-reviewer"

    Scenario: The reviewer has no tool that edits or delegates
      Then the agent has no tool among "Edit, Write, NotebookEdit, Agent"
      And the agent disallows "Edit, Write"

    Scenario: The reviewer reads, runs the CLI, reaches the MCP server, stops after a number of turns and runs the review step
      Then the agent has the tool "Read"
      And the agent has the tool "Bash"
      And the agent has the tool "mcp__plugin_agentic-sdlc_agentic-sdlc__*"
      And the agent has a turn limit
      And the agent description matches "review/review step"

  Rule: A plugin agent sets only what the plugin honours

    Scenario Outline: A plugin agent does not set a key that plugins ignore
      Then no plugin agent sets "<key>"

      Examples:
        | key            |
        | hooks          |
        | permissionMode |

  Rule: The package ships the plugin's folders

    Scenario Outline: A plugin folder is in the package
      Then the package ships "<folder>"

      Examples:
        | folder         |
        | agents         |
        | hooks          |
        | .claude-plugin |

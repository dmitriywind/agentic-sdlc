# Source: src/install.ts "init", src/pristine.ts "renameSkill", templates/gates/github/ruleset.trunk.json
@cli:init
Feature: Init installs the factory
  `agentic-sdlc init` copies the skill pack, the binding, the CI gates and the runner prompts into a project and
  points the project's agent file at them. It reads what it can from the project (the git origin, the package
  version), writes only what the harness needs, and refuses a command line it does not understand before it writes.

  Background:
    Given an installable package at version "9.9.9"

  Rule: Init writes the factory files and a pointer

    Scenario: Init writes the skills, the binding, the gates, the hook and the prompts
      When I run the install command "init --board jira --harness claude"
      Then the exit code is 0
      And the installed file ".agents/skills/sdlc/SKILL.md" exists
      And the installed file ".github/workflows/gate.yml" exists
      And the installed file ".agents/cycle-prompt.md" exists
      And the installed file ".agents/review-prompt.md" exists
      And the installed file ".agents/hooks/pre-push" exists
      And the installed file ".agents/binding.yml" sets "board.adapter" to "jira"

    Scenario: The hook and the launcher are executable
      When I run the install command "init"
      Then the installed file ".agents/hooks/pre-push" is executable
      And the installed file ".agents/bin/agentic-sdlc" is executable

    Scenario: Claude Code gets the skills from the plugin, so init copies none for it
      When I run the install command "init --harness claude"
      Then the installed file ".claude/skills" is absent

    Scenario: A second init keeps the adopter's edit of the binding
      Given I run the install command "init"
      And the adopter appends "# edited\n" to the installed file ".agents/binding.yml"
      When I run the install command "init"
      Then the installed file ".agents/binding.yml" contains "# edited"

    Scenario: Init adds one pointer block to AGENTS.md and keeps the adopter's text
      Given the project has the file "AGENTS.md" holding "# Mine\n"
      When I run the install command "init"
      Then the installed file "AGENTS.md" matches "^# Mine"
      And the installed file "AGENTS.md" contains "agentic-sdlc:start" exactly 1 times

    Scenario: The pointer names the sdlc skill and the CLI launcher
      When I run the install command "init"
      Then the installed file "AGENTS.md" contains "/agentic-sdlc:sdlc"
      And the installed file "AGENTS.md" contains ".agents/bin/agentic-sdlc"

    Scenario: A second init leaves AGENTS.md as the first wrote it
      Given the project has the file "AGENTS.md" holding "# Mine\n"
      And I run the install command "init"
      And I note the installed file "AGENTS.md"
      When I run the install command "init"
      Then the installed file "AGENTS.md" is as noted
      And the installed file "AGENTS.md" contains "agentic-sdlc:start" exactly 1 times

    Scenario: Init adds .agents/.cli/ to .gitignore once and keeps the rest of the file
      Given the project has the file ".gitignore" holding "node_modules"
      And I run the install command "init"
      When I run the install command "init"
      Then the installed file ".gitignore" holds "node_modules\n.agents/.cli/\n"

    Scenario: Init creates .gitignore when the project has none
      When I run the install command "init"
      Then the installed file ".gitignore" holds ".agents/.cli/\n"

    Scenario: Init leaves a .gitignore that already names the folder alone
      Given the project has the file ".gitignore" holding "/.agents/.cli\n"
      When I run the install command "init"
      Then the installed file ".gitignore" holds "/.agents/.cli\n"

    Scenario: A kept pre-push hook keeps its mode
      Given I run the install command "init"
      And the project has the file ".agents/hooks/pre-push" holding "#!/bin/sh\necho mine\n"
      And the adopter makes the installed file ".agents/hooks/pre-push" not executable
      When I run the install command "init"
      Then the output says "kept .agents/hooks/pre-push"
      And the installed file ".agents/hooks/pre-push" has the mode "644"

  Rule: Init refuses what it does not support, before it writes anything

    Scenario Outline: A bad command line writes nothing
      When I run the install command "init <args>"
      Then the exit code is 1
      And the installed file ".agents" is absent

      Examples:
        | args           |
        | --board bogus  |
        | --forse        |
        | --ref main     |

    Scenario Outline: A vcs or a forge other than git and GitHub is refused
      When I run the install command "init <args>"
      Then the exit code is 1

      Examples:
        | args          |
        | --vcs hg      |
        | --forge swarm |

    Scenario: An unknown harness is refused
      When I run the install command "init --harness nope"
      Then the exit code is 1

    Scenario: A package with no templates fails clearly
      Given the package has no templates
      When I run the install command "init"
      Then the exit code is 1

  Rule: A profile decides how many identities the project starts with

    Scenario: The organization profile sets two identities, traces and a container sandbox
      When I run the install command "init --profile organization"
      Then the exit code is 0
      And the installed file ".agents/binding.yml" sets "profile" to "organization"
      And the installed file ".agents/binding.yml" sets "executors.default.sandbox" to "container"
      And the installed file ".agents/binding.yml" sets "traces.uri" to ".agents/runtime/traces/{run_id}.jsonl"
      And the installed file ".agents/binding.yml" sets "forge.review_identity" to a value
      And the installed file ".agents/binding.yml" sets "forge.options.token_env" to "AGENTIC_FORGE_TOKEN"
      And the installed file ".agents/binding.yml" sets "forge.options.review_token_env" to "AGENTIC_REVIEW_TOKEN"

    Scenario: The organization trunk ruleset asks for an approving review
      When I run the install command "init --profile organization"
      Then the installed file ".github/rulesets/trunk.json" sets "rules.type=pull_request.parameters.required_approving_review_count" to "1"

    Scenario: An unknown profile is refused
      When I run the install command "init --profile bogus"
      Then the exit code is 1

    Scenario Outline: The individual profiles start with one identity
      When I run the install command "init --profile <profile>"
      Then the exit code is 0
      And the installed file ".agents/binding.yml" sets "profile" to "<profile>"
      And the installed file ".agents/binding.yml" sets no "forge.review_identity"
      And the installed file ".agents/binding.yml" sets no "forge.options.review_token_env"

      Examples:
        | profile        |
        | individual     |
        | individual-api |

    Scenario Outline: The individual trunk ruleset asks for no approving review, since GitHub refuses one from the CR's author
      When I run the install command "init --profile <profile>"
      Then the installed file ".github/rulesets/trunk.json" sets "rules.type=pull_request.parameters.required_approving_review_count" to "0"
      And the installed file ".github/rulesets/trunk.json" sets "rules.type=pull_request.parameters.require_last_push_approval" to "false"

      Examples:
        | profile        |
        | individual     |
        | individual-api |

    Scenario Outline: With one identity CI posts every required check, so each is pinned to Actions
      When I run the install command "init --profile <profile>"
      Then every value at "rules.type=required_status_checks.parameters.required_status_checks.*.integration_id" in the installed file ".github/rulesets/trunk.json" is "15368"

      Examples:
        | profile        |
        | individual     |
        | individual-api |

  Rule: Init for Claude Code writes tier subagents and one import of AGENTS.md

    Scenario Outline: A subagent per tier takes its model from the binding
      When I run the install command "init --harness claude"
      Then the installed file "<file>" matches "<line>"

      Examples:
        | file                               | line                           |
        | .claude/agents/sdlc-fast.md        | ^model: claude-haiku-4-5$      |
        | .claude/agents/sdlc-balanced.md    | ^model: inherit$               |
        | .claude/agents/sdlc-deep.md        | ^name: sdlc-deep$              |

    Scenario: CLAUDE.md imports AGENTS.md once and keeps the adopter's text
      Given the project has the file "CLAUDE.md" holding "# Mine\n"
      And I run the install command "init --harness claude"
      When I run the install command "init --harness claude"
      Then the installed file "CLAUDE.md" matches "^# Mine"
      And the installed file "CLAUDE.md" contains "\n@AGENTS.md\n" exactly 1 times

    Scenario: A project with no CLAUDE.md gets one that only imports AGENTS.md
      When I run the install command "init --harness claude"
      Then the installed file "CLAUDE.md" holds "@AGENTS.md\n"

    Scenario: With the plugin, init writes no .mcp.json
      When I run the install command "init --harness claude"
      Then the installed file ".mcp.json" is absent

    Scenario: Without the plugin, init copies the skills where a cloud session loads them
      When I run the install command "init --harness claude --no-plugin"
      Then the exit code is 0
      And the installed file ".claude/skills/sdlc/SKILL.md" exists

    Scenario: Without the plugin, init merges the MCP entry into .mcp.json with the launcher as the command
      Given the project has the file ".mcp.json" holding '{"mcpServers":{"other":{"type":"http","url":"x"}}}'
      When I run the install command "init --harness claude --no-plugin"
      Then the installed file ".mcp.json" sets "mcpServers.other.url" to "x"
      And the installed file ".mcp.json" sets "mcpServers.agentic-sdlc.command" to ".agents/bin/agentic-sdlc"
      And the installed file ".mcp.json" sets "mcpServers.agentic-sdlc.args" to '["mcp"]'
      And the installed file ".mcp.json" sets "mcpServers.agentic-sdlc.type" to "stdio"

    Scenario: Init keeps an MCP entry that the adopter wrote
      Given the project has the file ".mcp.json" holding '{"mcpServers":{"agentic-sdlc":{"command":"mine"}}}'
      When I run the install command "init --harness claude --no-plugin"
      Then the installed file ".mcp.json" sets "mcpServers.agentic-sdlc.command" to "mine"

    Scenario: Init --force replaces an MCP entry that the adopter wrote
      Given the project has the file ".mcp.json" holding '{"mcpServers":{"agentic-sdlc":{"command":"mine"}}}'
      When I run the install command "init --harness claude --no-plugin --force"
      Then the installed file ".mcp.json" sets "mcpServers.agentic-sdlc.command" to ".agents/bin/agentic-sdlc"

  Rule: Init for other harnesses writes their MCP file

    Scenario: Init for Cursor writes .cursor/mcp.json with the launcher as the command
      When I run the install command "init --harness cursor"
      Then the exit code is 0
      And the installed file ".cursor/mcp.json" sets "mcpServers.agentic-sdlc.command" to ".agents/bin/agentic-sdlc"
      And the installed file ".cursor/mcp.json" sets "mcpServers.agentic-sdlc.args" to '["mcp"]'

    Scenario: Init for Codex appends the TOML table once and keeps the file's other settings
      Given the project has the file ".codex/config.toml" holding "model = \"x\"\n"
      And I run the install command "init --harness codex"
      When I run the install command "init --harness codex"
      Then the installed file ".codex/config.toml" matches "^model = \"x\""
      And the installed file ".codex/config.toml" contains "[mcp_servers.agentic-sdlc]" exactly 1 times
      And the installed file ".codex/config.toml" contains "command = \".agents/bin/agentic-sdlc\"\nargs = [\"mcp\"]"

    Scenario: Init for Codex copies no Claude skills
      When I run the install command "init --harness codex"
      Then the installed file ".claude/skills" is absent

    Scenario: Init for Codex keeps a table that the adopter wrote
      Given the project has the file ".codex/config.toml" holding "x = 1\n[mcp_servers.\"agentic-sdlc\"]\ncommand = \"mine\"\n"
      When I run the install command "init --harness codex"
      Then the installed file ".codex/config.toml" holds "x = 1\n[mcp_servers.\"agentic-sdlc\"]\ncommand = \"mine\"\n"

  Rule: Init reads the project

    Scenario: Init reads the repo from a GitHub origin
      Given the project is a git repository with the origin "https://github.com/acme/shop.git"
      When I run the install command "init --harness claude --no-plugin --board github-issues"
      Then the installed file ".agents/binding.yml" sets "board.options.repo" to "acme/shop"
      And the installed file ".agents/binding.yml" sets "forge.options.repo" to "acme/shop"

    Scenario: Without the plugin, init does not ask to install it
      Given the project is a git repository with the origin "https://github.com/acme/shop.git"
      When I run the install command "init --harness claude --no-plugin --board github-issues"
      Then the output does not say "install the Claude Code plugin"

    Scenario: Init on a local board creates the heartbeat ticket and names it in the binding
      When I run the install command "init --board local"
      Then the exit code is 0
      And the local board holds the tickets:
        | id | title     | status    |
        | 1  | Heartbeat | Cancelled |
      And the installed file ".agents/binding.yml" matches "ticket: \"?1\"?"

    Scenario: Init --force on a local board creates no second heartbeat ticket
      Given I run the install command "init --board local"
      When I run the install command "init --board local --force"
      Then the local board holds the tickets:
        | id | title     | status    |
        | 1  | Heartbeat | Cancelled |

  Rule: Init installs the release line files that the binding's delivery needs

    Scenario: On GitHub init installs the release-lines ruleset
      Given the package file "templates/gates/github/ruleset.release.json" holds "{}"
      When I run the install command "init --forge github"
      Then the exit code is 0
      And the installed file ".github/rulesets/release.json" exists

    Scenario: With continuous delivery init writes the gate workflows but no release workflow or ruleset
      Given the package file "templates/gates/github/ruleset.release.json" holds "{}"
      And the package file "templates/gates/github/agentic-sdlc-release.yml" holds "on: workflow_dispatch\n"
      And the project has the file ".agents/binding.yml" holding "version: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git }\nproduct: { delivery: continuous }\n"
      When I run the install command "init --forge github"
      Then the installed file ".github/workflows/gate.yml" exists
      And the installed file ".github/workflows/agentic-sdlc-release.yml" is absent
      And the installed file ".github/rulesets/release.json" is absent

  Rule: Init writes the binding's values into the stock workflows

    Background:
      Given the package ships the stock file "templates/gates/github/agentic-sdlc-delivery.yml"
      And the project has the file ".agents/binding.yml" holding "version: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git, trunk: master, release_prefix: rel/ }\nproduct: { delivery: continuous }\n"
      And a delivery workflow of an older release is installed with hand-edited values, and that release is known

  Rule: Init writes the binding's commands into the verify workflow

    Scenario: The verify workflow runs the commands of the binding
      Given the package ships the stock file "templates/gates/github/agentic-sdlc-verify.yml"
      And the project has the file ".agents/binding.yml" holding "version: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git, trunk: main }\ncommands: { install: pnpm i --frozen-lockfile, verify: \"pnpm test: all\" }\n"
      When I run the install command "init"
      Then the installed file ".github/workflows/agentic-sdlc-verify.yml" matches "run: pnpm i --frozen-lockfile +# set: the binding's commands\.install$"
      And the installed file ".github/workflows/agentic-sdlc-verify.yml" matches "run: \"pnpm test: all\" +# set: the binding's commands\.verify$"
      And the installed file ".github/workflows/agentic-sdlc-verify.yml" does not match "run: npm (ci|test) "

  Rule: A copied install names its skills sdlc-<name>

    Scenario: The skill folders are sdlc and sdlc-<name>
      When I run the install command "init"
      Then the installed folder ".agents/skills" holds exactly "sdlc, sdlc-build, sdlc-escalate, sdlc-learn, sdlc-plan, sdlc-review, sdlc-ship"

    Scenario: A skill's frontmatter name follows its folder
      When I run the install command "init"
      Then the installed file ".agents/skills/sdlc-plan/SKILL.md" matches "^name: sdlc-plan$"
      And the installed file ".agents/skills/sdlc/SKILL.md" matches "^name: sdlc$"

    Scenario: Links between skills follow the new folder names
      When I run the install command "init"
      Then the installed file ".agents/skills/sdlc-plan/SKILL.md" contains "(../sdlc/references/contract.md)"
      And the installed file ".agents/skills/sdlc-plan/steps/shape.md" contains "(../../sdlc-escalate/SKILL.md)"

    Scenario: The loader reads the installed pack
      When I run the install command "init"
      Then the installed skill pack has no skill problems
      And the skill regression gate finds no errors

    Scenario: A second init finds every renamed file unedited
      Given I run the install command "init"
      When I run the install command "init"
      Then the output has the line "install: up to date"

    Scenario: Without the plugin the Claude Code copy has the same names
      When I run the install command "init --harness claude --no-plugin"
      Then the installed file ".claude/skills/sdlc-build/SKILL.md" exists
      And the installed file ".claude/skills/build" is absent

    Scenario: Renaming a SKILL.md changes its name line and the links into other skills, and nothing else
      When the skill file "plan/SKILL.md" holding "---\nname: plan\ndescription: d\nmetadata:\n  name: keep\n---\n[a](../sdlc/references/c.md#x) [b](../build/SKILL.md) [c](steps/s.md) [d](https://x/y) [e](#f) [f](./steps/s.md)\n" is renamed for a copied install knowing the skills "sdlc, plan, build"
      Then the renamed text is "---\nname: sdlc-plan\ndescription: d\nmetadata:\n  name: keep\n---\n[a](../sdlc/references/c.md#x) [b](../sdlc-build/SKILL.md) [c](steps/s.md) [d](https://x/y) [e](#f) [f](./steps/s.md)\n"

    Scenario: Renaming a skill file back restores its source
      When the skill file "plan/SKILL.md" holding "---\nname: plan\ndescription: d\n---\n[b](../build/SKILL.md) [c](steps/s.md)\n" is renamed for a copied install knowing the skills "sdlc, plan, build"
      Then renaming the text back as "sdlc-plan/SKILL.md" gives the original

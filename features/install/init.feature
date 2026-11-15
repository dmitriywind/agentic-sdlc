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
      And the installed file ".agents/binding.yml" sets "board.adapter" to "jira"
      And the installed file ".agents/hooks/pre-push" is executable
      And the installed file ".agents/bin/agentic-sdlc" is executable
      And the installed file ".claude/skills" is absent

    Scenario: Init adds one pointer block to AGENTS.md, keeps the adopter's text, and a second init leaves it as is
      Given the project has the file "AGENTS.md" holding "# Mine\n"
      And I run the install command "init"
      And I note the installed file "AGENTS.md"
      When I run the install command "init"
      Then the installed file "AGENTS.md" is as noted
      And the installed file "AGENTS.md" matches "^# Mine"
      And the installed file "AGENTS.md" contains "agentic-sdlc:start" exactly 1 times
      And the installed file "AGENTS.md" contains "/agentic-sdlc:sdlc"
      And the installed file "AGENTS.md" contains ".agents/bin/agentic-sdlc"

    Scenario Outline: Init adds .agents/.cli/ to .gitignore once and keeps the rest of the file
      Given the project has the file ".gitignore" holding "<before>"
      When I run the install command "init"
      And I run the install command "init"
      Then the installed file ".gitignore" holds "<after>"

      Examples:
        | before        | after                         |
        | node_modules  | node_modules\n.agents/.cli/\n |
        | /.agents/.cli | /.agents/.cli                 |

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
        | --vcs hg       |
        | --forge swarm  |
        | --harness nope |
        | --profile bogus |

    Scenario: A package with no templates fails clearly
      Given the package has no templates
      When I run the install command "init"
      Then the exit code is 1

  Rule: A profile decides how many identities the project starts with

    Scenario: The organization profile sets two identities, traces, a container sandbox and an approving review
      When I run the install command "init --profile organization"
      Then the exit code is 0
      And the installed file ".agents/binding.yml" sets "profile" to "organization"
      And the installed file ".agents/binding.yml" sets "executors.default.sandbox" to "container"
      And the installed file ".agents/binding.yml" sets "traces.uri" to ".agents/runtime/traces/{run_id}.jsonl"
      And the installed file ".agents/binding.yml" sets "forge.review_identity" to a value
      And the installed file ".agents/binding.yml" sets "forge.options.review_token_env" to "AGENTIC_REVIEW_TOKEN"
      And the installed file ".github/rulesets/trunk.json" sets "rules.type=pull_request.parameters.required_approving_review_count" to "1"

    Scenario Outline: The individual profiles start with one identity, no approving review, and every check pinned to Actions
      When I run the install command "init --profile <profile>"
      Then the exit code is 0
      And the installed file ".agents/binding.yml" sets "profile" to "<profile>"
      And the installed file ".agents/binding.yml" sets no "forge.review_identity"
      And the installed file ".github/rulesets/trunk.json" sets "rules.type=pull_request.parameters.required_approving_review_count" to "0"
      And every value at "rules.type=required_status_checks.parameters.required_status_checks.*.integration_id" in the installed file ".github/rulesets/trunk.json" is "15368"

      Examples:
        | profile        |
        | individual     |
        | individual-api |

  Rule: Init for Claude Code writes tier subagents and one import of AGENTS.md

    Scenario: A subagent per tier takes its model from the binding
      When I run the install command "init --harness claude"
      Then the installed file ".claude/agents/sdlc-fast.md" matches "^model: claude-haiku-4-5$"

    Scenario: CLAUDE.md imports AGENTS.md once and keeps the adopter's text
      Given the project has the file "CLAUDE.md" holding "# Mine\n"
      And I run the install command "init --harness claude"
      When I run the install command "init --harness claude"
      Then the installed file "CLAUDE.md" matches "^# Mine"
      And the installed file "CLAUDE.md" contains "\n@AGENTS.md\n" exactly 1 times
      And the installed file ".mcp.json" is absent

    Scenario: Without the plugin, init copies the skills and merges the MCP entry, keeping an entry the adopter wrote
      Given the project has the file ".mcp.json" holding '{"mcpServers":{"other":{"type":"http","url":"x"}}}'
      When I run the install command "init --harness claude --no-plugin"
      Then the installed file ".claude/skills/sdlc/SKILL.md" exists
      And the installed file ".mcp.json" sets "mcpServers.other.url" to "x"
      And the installed file ".mcp.json" sets "mcpServers.agentic-sdlc.command" to ".agents/bin/agentic-sdlc"
      And the installed file ".mcp.json" sets "mcpServers.agentic-sdlc.args" to '["mcp"]'

    Scenario Outline: Init keeps an MCP entry that the adopter wrote, and --force replaces it
      Given the project has the file ".mcp.json" holding '{"mcpServers":{"agentic-sdlc":{"command":"mine"}}}'
      When I run the install command "init --harness claude --no-plugin <flag>"
      Then the installed file ".mcp.json" sets "mcpServers.agentic-sdlc.command" to "<command>"

      Examples:
        | flag    | command                  |
        |         | mine                     |
        | --force | .agents/bin/agentic-sdlc |

  Rule: Init for other harnesses writes their MCP file

    Scenario: Init for Cursor writes .cursor/mcp.json; init for Codex appends the TOML table once and keeps the file's other settings
      Given the project has the file ".codex/config.toml" holding "model = \"x\"\n"
      And I run the install command "init --harness cursor"
      And I run the install command "init --harness codex"
      When I run the install command "init --harness codex"
      Then the installed file ".codex/config.toml" matches "^model = \"x\""
      And the installed file ".codex/config.toml" contains "[mcp_servers.agentic-sdlc]" exactly 1 times
      And the installed file ".codex/config.toml" contains "command = \".agents/bin/agentic-sdlc\"\nargs = [\"mcp\"]"
      And the installed file ".cursor/mcp.json" sets "mcpServers.agentic-sdlc.command" to ".agents/bin/agentic-sdlc"

  Rule: Init reads the project

    Scenario: Init reads the repo from a GitHub origin
      Given the project is a git repository with the origin "https://github.com/acme/shop.git"
      When I run the install command "init --harness claude --no-plugin --board github-issues"
      Then the installed file ".agents/binding.yml" sets "board.options.repo" to "acme/shop"
      And the installed file ".agents/binding.yml" sets "forge.options.repo" to "acme/shop"

    Scenario: Init on a local board creates the heartbeat ticket once and names it in the binding
      Given I run the install command "init --board local"
      When I run the install command "init --board local --force"
      Then the local board holds the tickets:
        | id | title     | status    |
        | 1  | Heartbeat | Cancelled |
      And the installed file ".agents/binding.yml" matches "ticket: \"?1\"?"

  Rule: Init installs the release line files that the binding's delivery needs

    Scenario Outline: The release-lines ruleset and workflow follow the binding's delivery
      Given the package file "templates/gates/github/ruleset.release.json" holds "{}"
      And the package file "templates/gates/github/agentic-sdlc-release.yml" holds "on: workflow_dispatch\n"
      And the project has the file ".agents/binding.yml" holding "version: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git }\nproduct: { delivery: <delivery> }\n"
      When I run the install command "init --forge github"
      Then the installed file ".github/rulesets/release.json" <state>
      And the installed file ".github/workflows/agentic-sdlc-release.yml" <state>

      Examples:
        | delivery     | state   |
        | release-line | exists  |
        | continuous   | is absent |

  Rule: Init writes the binding's commands into the verify workflow

    Scenario: The verify workflow runs the commands of the binding
      Given the package ships the stock file "templates/gates/github/agentic-sdlc-verify.yml"
      And the project has the file ".agents/binding.yml" holding "version: 2\nboard: { adapter: github }\nforge: { adapter: github }\nvcs: { adapter: git, trunk: main }\ncommands: { install: pnpm i --frozen-lockfile, verify: \"pnpm test: all\" }\n"
      When I run the install command "init"
      Then the installed file ".github/workflows/agentic-sdlc-verify.yml" matches "run: pnpm i --frozen-lockfile +# set: the binding's commands\.install$"
      And the installed file ".github/workflows/agentic-sdlc-verify.yml" matches "run: \"pnpm test: all\" +# set: the binding's commands\.verify$"

  Rule: A copied install names its skills sdlc-<name>

    Scenario: The skill folders, names and links follow sdlc-<name>, and the loader reads the pack
      When I run the install command "init"
      Then the installed folder ".agents/skills" holds exactly "sdlc, sdlc-build, sdlc-escalate, sdlc-learn, sdlc-plan, sdlc-review, sdlc-ship"
      And the installed file ".agents/skills/sdlc-plan/SKILL.md" matches "^name: sdlc-plan$"
      And the installed file ".agents/skills/sdlc-plan/SKILL.md" contains "(../sdlc/references/contract.md)"
      And the installed file ".agents/skills/sdlc-plan/steps/shape.md" contains "(../../sdlc-escalate/SKILL.md)"
      And the installed skill pack has no skill problems
      And the skill regression gate finds no errors

    Scenario: Renaming a SKILL.md changes its name line and the links into other skills, and renaming back restores it
      When the skill file "plan/SKILL.md" holding "---\nname: plan\ndescription: d\nmetadata:\n  name: keep\n---\n[a](../sdlc/references/c.md#x) [b](../build/SKILL.md) [c](steps/s.md) [d](https://x/y) [e](#f) [f](./steps/s.md)\n" is renamed for a copied install knowing the skills "sdlc, plan, build"
      Then the renamed text is "---\nname: sdlc-plan\ndescription: d\nmetadata:\n  name: keep\n---\n[a](../sdlc/references/c.md#x) [b](../sdlc-build/SKILL.md) [c](steps/s.md) [d](https://x/y) [e](#f) [f](./steps/s.md)\n"
      And renaming the text back as "sdlc-plan/SKILL.md" gives the original

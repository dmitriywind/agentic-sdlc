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
      When I run the install command "init --board local --harness claude"
      Then the exit code is 0
      And the installed file ".agents/skills/sdlc/SKILL.md" exists
      And the installed file ".github/workflows/gate.yml" exists
      And the installed file ".agents/cycle-prompt.md" exists
      And the installed file ".agents/review-prompt.md" exists
      And the installed file ".agents/binding.yml" sets "board.adapter" to "local"
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

  Rule: Init refuses what it does not support, before it writes anything

    Scenario Outline: A bad command line writes nothing
      When I run the install command "init <args>"
      Then the exit code is 1
      And the installed file ".agents" is absent

      Examples:
        | args           |
        | --ref main     |

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

  Rule: Init for Claude Code writes tier subagents and one import of AGENTS.md

    Scenario: A subagent per tier takes its model from the binding
      When I run the install command "init --harness claude"
      Then the installed file ".claude/agents/sdlc-fast.md" matches "^model: claude-haiku-4-5$"

    Scenario: Without the plugin, init writes the reviewer agent and registers the guard hook, keeping the adopter's settings
      Given the project has the file ".claude/settings.json" holding '{"model":"mine","hooks":{"PostToolUse":[{"matcher":"Edit","hooks":[]}]}}'
      When I run the install command "init --harness claude --no-plugin"
      Then the installed file ".claude/agents/sdlc-reviewer.md" matches "^tools: .*mcp__agentic-sdlc__\*$"
      And the installed file ".claude/agents/sdlc-reviewer.md" matches "^disallowedTools: Edit, Write"
      And the installed file ".agents/hooks/guard.mjs" exists
      And the installed file ".claude/settings.json" sets "model" to "mine"
      And the installed file ".claude/settings.json" sets "hooks.PostToolUse.matcher=Edit.matcher" to "Edit"
      And the installed file ".claude/settings.json" sets "hooks.PreToolUse.matcher=Bash.hooks.type=command.command" to 'node "${CLAUDE_PROJECT_DIR}/.agents/hooks/guard.mjs"'

  Rule: Init reads the project

    Scenario: Init reads the repo from a GitHub origin
      Given the project is a git repository with the origin "https://github.com/acme/shop.git"
      When I run the install command "init --harness claude --no-plugin --board github-issues"
      Then the installed file ".agents/binding.yml" sets "board.options.repo" to "acme/shop"
      And the installed file ".agents/binding.yml" sets "forge.options.repo" to "acme/shop"

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

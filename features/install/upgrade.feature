# Source: src/install.ts "Installer", src/pristine.ts "knownHashes"
@cli:init
Feature: Init upgrades an install
  Init records the hash of every file it installs in .agents/install.lock.json. A file still at its recorded hash,
  or at the hash of a released version, follows the package; a file the adopter edited is kept unless --force
  overwrites it. The binding is never rewritten. A file the package no longer ships is removed when unedited and
  reported when edited.

  Background:
    Given an installable package at version "9.9.9"

  Rule: An unedited file follows the package and an edited one is kept

    Scenario: Init keeps an edited skill file
      Given I run the install command "init"
      And the project has the file ".agents/skills/sdlc/SKILL.md" holding "mine"
      When I run the install command "init"
      Then the installed file ".agents/skills/sdlc/SKILL.md" holds "mine"
      And the output says "kept .agents/skills/sdlc/SKILL.md"

    Scenario: Init --upgrade updates a workflow still at its recorded hash
      Given I run the install command "init"
      And the package file "templates/gates/github/gate.yml" holds "on: pull_request\n"
      When I run the install command "init --upgrade"
      Then the installed file ".github/workflows/gate.yml" holds "on: pull_request\n"
      And the output has the line "updated .github/workflows/gate.yml"

    Rule: A workflow the adopter edited is kept

      Background:
        Given I run the install command "init"
        And the project has the file ".github/workflows/gate.yml" holding "mine\n"
        And the package file "templates/gates/github/gate.yml" holds "on: schedule\n"
        And the adopter appends "# mine\n" to the installed file ".agents/binding.yml"

      Scenario: Init --upgrade keeps it and names the package file, and --force overwrites it but never the binding
        When I run the install command "init --upgrade"
        Then a line of the output matches "^kept \.github/workflows/gate\.yml \(differs from every released version; --force overwrites, see .*templates.gates.github.gate\.yml\)$"
        And the output has the line "install: nothing to update; 1 kept (differ from every released version)"
        When I run the install command "init --force"
        Then the installed file ".github/workflows/gate.yml" holds "on: schedule\n"
        And the installed file ".agents/binding.yml" contains "# mine"

  Rule: A file with no usable lock entry is judged by its content

    Scenario: A file with no lock entry is adopted when it equals the package's and kept when it differs
      Given I run the install command "init"
      And the install lock is emptied
      And the project has the file ".agents/cycle-prompt.md" holding "mine"
      When I run the install command "init"
      Then the installed file ".agents/cycle-prompt.md" holds "mine"
      And a line of the output matches "^kept \.agents/cycle-prompt\.md \(differs from every released version"
      And the install lock records ".github/workflows/gate.yml"
      And the install lock does not record ".agents/cycle-prompt.md"

    Scenario: A file with no lock entry at the hash of a released version, CRLF or not, follows the package
      Given I run the install command "init"
      And the install lock is emptied
      And the package lists "old prompt\n" as a released version of "templates/runner/cycle-prompt.md"
      And the project has the file ".agents/cycle-prompt.md" holding "old prompt\r\n"
      When I run the install command "init"
      Then the installed file ".agents/cycle-prompt.md" holds "cycle-prompt.md"
      And the output has the line "updated .agents/cycle-prompt.md"

  Rule: A file the package no longer ships is removed when unedited and reported when edited

    Background:
      Given the package file "templates/gates/github/old.yml" holds "x: 1\n"
      And the package file "templates/gates/github/old2.yml" holds "y: 1\n"
      And the package file "skills/gone/SKILL.md" holds "---\nname: gone\ndescription: d\nmetadata:\n  tier: fast\n---\n"
      And the package file "skills/gone/steps/a.md" holds "a\n"
      And I run the install command "init"
      And the project has the file ".github/workflows/old2.yml" holding "edited: 1\n"
      And the package no longer ships "templates/gates/github/old.yml"
      And the package no longer ships "templates/gates/github/old2.yml"
      And the package no longer ships "skills/gone"

    Scenario: An unedited workflow the package dropped is removed
      When I run the install command "init"
      Then the output has the line "removed .github/workflows/old.yml: no longer part of the package"
      And the installed file ".github/workflows/old.yml" is absent

    Scenario: An edited workflow the package dropped is reported as stale and kept, a dropped skill folder is removed, and the last line counts both
      When I run the install command "init"
      Then the output has the line "stale .github/workflows/old2.yml: no longer part of the package"
      And the installed file ".github/workflows/old2.yml" exists
      And the installed file ".agents/skills/sdlc-gone" is absent
      And a line of the output matches "^install: .*, 1 stale, 3 removed$"

  Rule: An upgrade keeps the copied skills and regenerates what an older release generated

    Background:
      Given I run the install command "init --harness claude --no-plugin"

    Scenario: Init --upgrade without flags keeps its copied skills
      Given the package file "skills/plan/steps/triage.md" holds "new triage\n"
      When I run the install command "init --upgrade"
      Then the installed file ".claude/skills/sdlc-plan/steps/triage.md" holds "new triage\n"

    Scenario: Init --upgrade registers the guard hook once and leaves the settings as they are
      Given I note the installed file ".claude/settings.json"
      When I run the install command "init --upgrade"
      Then the installed file ".claude/settings.json" is as noted
      And the installed file ".claude/settings.json" contains "guard.mjs" exactly 2 times
      And the output has the line "kept .claude/settings.json (the guard hook is registered)"

  Rule: An upgrade writes only under paths.factory and reports a root file it would change

    Scenario: Init --upgrade leaves .gitignore, AGENTS.md and an npx .mcp.json as they are, and says what to change
      Given I run the install command "init --harness claude --no-plugin"
      And the project has the file ".gitignore" holding "node_modules"
      And the project has the file ".mcp.json" holding '{"mcpServers":{"agentic-sdlc":{"command":"npx","args":["--no-install","agentic-sdlc","mcp"]}}}'
      And the project has the file "AGENTS.md" holding "# Mine\n"
      When I run the install command "init --upgrade"
      Then the installed file ".gitignore" holds "node_modules"
      And the installed file "AGENTS.md" holds "# Mine\n"
      And the installed file ".mcp.json" contains "npx"
      And a line of the output matches "^kept \\.mcp\\.json: .*\\.agents/bin/agentic-sdlc"
      And a line of the output matches "^kept AGENTS\\.md: "

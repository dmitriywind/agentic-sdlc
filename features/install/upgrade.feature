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

    Scenario: Init updates a skill file the adopter did not edit
      Given the package file "skills/plan/steps/shape.md" holds "v1"
      And I run the install command "init"
      And the package file "skills/plan/steps/shape.md" holds "v2"
      When I run the install command "init"
      Then the installed file ".agents/skills/sdlc-plan/steps/shape.md" holds "v2"

    Scenario: Init --force overwrites an edited skill file
      Given I run the install command "init"
      And the project has the file ".agents/skills/sdlc/SKILL.md" holding "mine"
      When I run the install command "init --force"
      Then the installed file ".agents/skills/sdlc/SKILL.md" does not contain "mine"

    Scenario: Init --upgrade updates a workflow still at its recorded hash
      Given I run the install command "init"
      And the package file "templates/gates/github/gate.yml" holds "on: pull_request\n"
      When I run the install command "init --upgrade"
      Then the installed file ".github/workflows/gate.yml" holds "on: pull_request\n"
      And the output has the line "updated .github/workflows/gate.yml"

    Scenario: After an upgrade the last line says what to run next
      Given I run the install command "init"
      And the package file "templates/gates/github/gate.yml" holds "on: pull_request\n"
      When I run the install command "init --upgrade"
      Then the output says "upgrade: review the kept files"

    Rule: A workflow the adopter edited is kept

      Background:
        Given I run the install command "init"
        And the project has the file ".github/workflows/gate.yml" holding "mine\n"
        And the package file "templates/gates/github/gate.yml" holds "on: schedule\n"
        And the adopter appends "# mine\n" to the installed file ".agents/binding.yml"

      Scenario: Init --upgrade keeps it and names the package file with the new version
        When I run the install command "init --upgrade"
        Then the installed file ".github/workflows/gate.yml" holds "mine\n"
        And a line of the output matches "^kept \.github/workflows/gate\.yml \(differs from every released version; --force overwrites, see .*templates/gates/github/gate\.yml\)$"

      Scenario: When nothing else changed the last line counts the kept files
        When I run the install command "init --upgrade"
        Then the output has the line "install: nothing to update; 1 kept (differ from every released version)"
        And no line of the output matches "^upgrade:"

      Scenario: Init does not report AGENTS.md as updated when its pointer block is current
        When I run the install command "init --upgrade"
        Then the output does not say "updated AGENTS.md"

      Scenario: Init --force overwrites the workflow but never the binding
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

    Scenario: A pre-lock file that equals a released version is updated and recorded
      Given I run the install command "init"
      And the install lock is removed
      And the project has the file ".github/workflows/gate.yml" holding "on: release\n"
      And the package lists "on: release\n" as a released version
      When I run the install command "init --upgrade"
      Then the installed file ".github/workflows/gate.yml" holds "on: push\n"
      And the output has the line "updated .github/workflows/gate.yml"
      And the install lock records the hash of "on: push\n" for ".github/workflows/gate.yml"

    Scenario: A pre-lock file that differs from every released version is kept, naming the package file
      Given I run the install command "init"
      And the install lock is removed
      And the project has the file ".agents/cycle-prompt.md" holding "mine"
      And the package lists "on: release\n" as a released version
      When I run the install command "init --upgrade"
      Then the installed file ".agents/cycle-prompt.md" holds "mine"
      And a line of the output matches "^kept \.agents/cycle-prompt\.md \(differs from every released version; --force overwrites, see .*templates/runner/cycle-prompt\.md\)$"

    Scenario: A stale lock entry does not hold back a released version
      Given I run the install command "init"
      And the install lock is changed to hold the hash of "older" for ".github/workflows/gate.yml"
      And the project has the file ".github/workflows/gate.yml" holding "on: release\n"
      And the package lists "on: release\n" as a released version
      When I run the install command "init --upgrade"
      Then the installed file ".github/workflows/gate.yml" holds "on: push\n"
      And the install lock records the hash of "on: push\n" for ".github/workflows/gate.yml"

    Scenario: Init reads the skills lock of an install from before the single lock
      Given I run the install command "init"
      And the old skills lock holds the entry of ".agents/skills/sdlc/SKILL.md" and the install lock is removed
      And the package file "skills/sdlc/SKILL.md" holds "---\nname: sdlc\ndescription: d2\nmetadata:\n  tier: fast\n---\n"
      When I run the install command "init"
      Then the installed file ".agents/skills/sdlc/SKILL.md" contains "description: d2"
      And the installed file ".agents/install.lock.json" exists

    Scenario: A renamed skill file is unedited when its package source is a released version
      Given I run the install command "init"
      And the install lock is removed
      And the package lists the current "skills/plan/SKILL.md" as a released version
      And the package file "skills/plan/SKILL.md" holds "---\nname: plan\ndescription: d\nmetadata:\n  steps:\n    triage: { tier: fast }\n    groom: { tier: balanced }\n    shape: { tier: deep }\n---\nbody\nmore\n"
      When I run the install command "init"
      Then the installed file ".agents/skills/sdlc-plan/SKILL.md" matches "^more$"
      And the installed file ".agents/skills/sdlc-plan/SKILL.md" matches "^name: sdlc-plan$"

    Scenario: The package lists the hash of every installable file it ships
      Then the known hashes of the package cover every installable file it ships

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

    Scenario: An edited workflow the package dropped is reported as stale and kept
      When I run the install command "init"
      Then the output has the line "stale .github/workflows/old2.yml: no longer part of the package"
      And the installed file ".github/workflows/old2.yml" exists

    Scenario: A skill folder the package dropped does not linger and trigger
      When I run the install command "init"
      Then the installed file ".agents/skills/sdlc-gone" is absent
      And the installed file ".agents/skills" exists

    Scenario: The last lines count the stale and removed files
      When I run the install command "init"
      Then a line of the output matches "^install: .*, 1 stale, 3 removed$"

    Scenario: An old skill folder that no lock tracks is removed when every file of it is a released version
      Given the project has the file ".agents/skills/implement-spec/SKILL.md" holding "---\nname: implement-spec\ndescription: old\nmetadata:\n  tier: balanced\n---\nrules\n"
      And the project has the file ".agents/skills/mine/SKILL.md" holding "my own skill\n"
      And the package lists "---\nname: implement-spec\ndescription: old\nmetadata:\n  tier: balanced\n---\nrules\n" as a released version
      When I run the install command "init"
      Then the installed file ".agents/skills/implement-spec" is absent
      And the installed file ".agents/skills/mine/SKILL.md" exists

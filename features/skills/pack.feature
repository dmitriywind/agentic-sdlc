# Source: skills/ (the pack), references/architecture.md "Skill pack"; the words come from FORBIDDEN in src/skills.ts
@skill:pack
Feature: The shipped skill pack
  The pack holds process only and works unchanged for every setup the package supports. This feature is its lint:
  it reads the files of skills/ and fails with every line that breaks a rule.

  Background:
    Given the shipped skill pack

  Rule: The pack is well formed

    Scenario: Every skill has a name and a description
      Then every skill folder has a SKILL.md whose name is the folder name and whose description is not empty

    Scenario: Every skill declares its tier
      Then every skill declares one tier, or the tier of each of its steps

    Scenario: Steps and their files match
      Then every declared step has a file in steps/ and every file in steps/ is declared

    Scenario: Links between skill files resolve
      Then every relative link in a skill file resolves

  Rule: A skill names only what the CLI offers

    Scenario: A skill calls only verbs that exist
      Then every "agentic-sdlc <group> <verb>" in a skill file names a verb of the CLI

    Scenario: A skill passes only flags that exist
      Then every flag a skill file passes to a board, forge or vcs verb is a flag of that verb

    Scenario: A skill dispatches only steps that exist
      Then every "agentic-sdlc dispatch <step>" in a skill file names a step of the pack

  Rule: A skill holds process only

    Scenario: No skill file names a setup, harness, forge or vendor
      Then no skill file holds a word that ties it to one setup, harness, forge or vendor

    Scenario: No skill file spells a comment marker
      Then no skill file spells a comment marker

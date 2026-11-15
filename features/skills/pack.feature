# Source: skills/ (the pack), references/architecture.md "Skill pack"; src/gates.ts "skillPackCheck"; the words come from FORBIDDEN in src/skills.ts
@skill:pack
Feature: The shipped skill pack
  The pack holds process only and works unchanged for every setup the package supports. This feature is its lint:
  it runs the very check the skill-regression gate runs on an install (the loader and skillPackCheck) over the files of
  skills/, and fails with every line that breaks a rule. loader.feature shows each rule catching a broken pack.

  Background:
    Given the shipped skill pack

  Rule: The pack passes the gate's own check

    Scenario: The pack check finds no error and no warning
      When the pack is checked
      Then the pack has no error and no warning

  Rule: A skill holds process only

    Scenario: No skill file spells a comment marker
      Then no skill file spells a comment marker

    Scenario: Every binding key a skill names is a key of the binding template
      Then every binding key a skill names is a key of templates/binding.yml

  Rule: The lint sees what a skill file says

    Scenario: The flags of a verb come from the CLI's tables
      Then the verb "forge verdict" takes the flag "body-file"
      And the verb "forge verdict" takes no flag "body"
      And the verb "dispatch" takes the flag "run-model"
      And the group "gate" has no flag table

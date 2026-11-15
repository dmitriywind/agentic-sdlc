# Source: src/install.ts "validate" and "missingBindingKeys"
@cli:validate
Feature: Validate checks the installed skills and the binding
  `agentic-sdlc validate` prints a `problem:` line for each broken rule and exits 1, prints a `warn:` line for each
  doubtful one, and tells which keys of the package's binding template the project binding does not set.

  Background:
    Given an installable package at version "9.9.9"
    And I run the install command "init"

  Rule: Each installed skill is checked

    Scenario: A skill with a top-level tier is a warning
      Given the project has the file ".agents/skills/old/SKILL.md" holding "---\nname: old\ndescription: d\ntier: deep\n---\n"
      When I run the install command "validate"
      Then the output says "warn: skill old: top-level tier is deprecated"

    Scenario: A skill with no tier and no steps is a problem
      Given the project has the file ".agents/skills/none/SKILL.md" holding "---\nname: none\ndescription: d\n---\n"
      When I run the install command "validate"
      Then a line of the output matches "^problem: skill none: .*metadata\.tier or metadata\.steps"
      And the exit code is 1

    Scenario: The skills with a top-level tier or from the pack are not problems
      Given the project has the file ".agents/skills/old/SKILL.md" holding "---\nname: old\ndescription: d\ntier: deep\n---\n"
      When I run the install command "validate"
      Then no line of the output matches "^problem: skill (old|sdlc):"

    Scenario: A step file that metadata.steps does not list is a problem
      Given the project has the file ".agents/skills/sdlc-plan/steps/extra.md" holding "x"
      When I run the install command "validate"
      Then a line of the output matches "^problem: skill sdlc-plan: steps/extra\.md is not in metadata\.steps"

    Scenario: A skill with no frontmatter is a problem
      Given the project has the file ".agents/skills/bad/SKILL.md" holding "no frontmatter"
      When I run the install command "validate"
      Then the exit code is 1

  Rule: An executors key names a step or a skill

    Scenario: An executor named after an old skill warns that it runs as the new one
      Given the installed binding also runs the executors "implement-spec"
      When I run the install command "validate"
      Then a line of the output matches "^warn: executors\.implement-spec: .* runs as build"

    Scenario: An executor that names no step or skill warns that no dispatch uses it
      Given the installed binding also runs the executors "mybot"
      When I run the install command "validate"
      Then a line of the output matches "^warn: executors\.mybot names no step or skill"

    Scenario: An executor named after a step is not warned about
      Given the installed binding also runs the executors "plan/shape"
      When I run the install command "validate"
      Then no line of the output matches "executors\.plan/shape"

  Rule: Warnings alone do not fail

    Scenario: Validate prints warn: lines and exits 0 when only warnings exist
      Given the installed binding is complete and runs a bot that is assigned work
      When I run the install command "validate"
      Then a line of the output matches "^warn: executors\.bot"
      And no line of the output matches "^problem:"
      And the exit code is 0

  Rule: The binding keys of the package template that the project binding lacks are listed

    Background:
      Given the package binding template also sets vcs.trunk and slo

    Scenario Outline: Init and validate list them in an info line
      When I run the install command "<command>"
      Then the output has the line "info: binding keys in the template that this binding does not set: vcs.trunk, slo"

      Examples:
        | command  |
        | init     |
        | validate |

    Scenario: The binding is not touched
      When I run the install command "init"
      Then the installed file ".agents/binding.yml" does not match "slo|trunk: main"

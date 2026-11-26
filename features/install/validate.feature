# Source: src/install.ts "validate", "pathWarnings" and "missingBindingKeys"; src/binding.ts "unresolved"
@cli:validate
Feature: Validate checks the installed skills and the binding
  `agentic-sdlc validate` prints a `problem:` line for each broken rule and exits 1, prints a `warn:` line for each
  doubtful one, and tells which keys of the package's binding template the project binding does not set.

  Background:
    Given an installable package at version "9.9.9"
    And I run the install command "init"

  Rule: Each installed skill is checked

    Scenario: A skill with no tier and no steps is a problem
      Given the project has the file ".agents/skills/none/SKILL.md" holding "---\nname: none\ndescription: d\n---\n"
      When I run the install command "validate"
      Then a line of the output matches "^problem: skill none: .*metadata\.tier or metadata\.steps"
      And the exit code is 1

  Rule: Warnings alone do not fail

    Scenario: Validate prints warn: lines and exits 0 when only warnings exist
      Given the installed binding is complete and names an executor for no step
      When I run the install command "validate"
      Then a line of the output matches "^warn: executors\.bot"
      And the exit code is 0

  Rule: A paths file key whose file is missing warns that the skills read nothing there

    Scenario: A missing file warns, an existing one does not, and a glob key never does
      Given the installed binding is the shipped template on a local board with the heartbeat ticket "1"
      And the project has the file "docs/narrative.md" holding "n"
      When I run the install command "validate"
      Then a line of the output matches "^warn: paths\\.glossary names GLOSSARY\\.md, which does not exist in the project; the skills will read nothing there"
      And a line of the output matches "^warn: paths\\.roadmap_doc names docs/roadmap\\.md"
      And no line of the output matches "paths\\.(guiding_narrative|factory|light_verify|lane_areas|no_proof)"

  Rule: The binding keys of the package template that the project binding lacks are listed

    Background:
      Given the package binding template also sets vcs.trunk and slo

    Scenario Outline: Init and validate list them in an info line
      When I run the install command "<command>"
      Then the output has the line "info: binding keys in the template that this binding does not set: vcs.trunk, slo"

      Examples:
        | command  |
        | validate |

    Scenario: The binding is not touched
      When I run the install command "init"
      Then the installed file ".agents/binding.yml" does not match "slo|trunk: main"

  Rule: A value init could not know is unresolved until it is replaced, and validate --json lists each one

    Scenario: An unresolved value fails validate, and the report names its key and hint
      Given the installed binding is complete and names an executor for no step
      And the installed binding leaves "commands.verify" unresolved: "the full test command"
      When I run the install command "validate --json"
      Then the exit code is 1
      And the validate report lists "commands.verify" unresolved with the hint "the full test command"

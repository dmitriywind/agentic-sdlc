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

    Scenario: The loader finds the seven skills and their steps
      When the pack is read
      Then the skills are "build, escalate, learn, plan, review, sdlc, ship"
      And the steps are "build, escalate, learn/judge, learn/improve, plan/triage, plan/groom, plan/shape, review/review, review/verify, sdlc, ship"

    Scenario: The frontmatter flags decide who may start a skill
      Then the frontmatter of each skill says:
        | skill    | model | user  |
        | build    | true  | false |
        | escalate | true  | false |
        | learn    | false | true  |
        | plan     | true  | false |
        | review   | true  | false |
        | sdlc     | true  | true  |
        | ship     | false | true  |

  Rule: A skill holds process only

    Scenario: No skill file spells a comment marker
      Then no skill file spells a comment marker

    Scenario: Every binding key a skill names is a key of the binding template
      Then every binding key a skill names is a key of templates/binding.yml

  Rule: The lint sees what a skill file says

    Scenario: The skill files hold many CLI calls of every group
      When the CLI calls in the skill files are counted
      Then there are more than 80 CLI calls
      And the skill files call a verb of each group "board, forge, vcs, gate, ledger, bench, dispatch"

    Scenario: A call is read from a code span, wrapped lines included, and a dotted key is not a call
      When the CLI calls are read from the text:
        """
        Run `agentic-sdlc forge verdict <n> --pass|--fail
          --body-file <f>` and `dispatch plan/shape --ticket <id>`; not `forge.provenance`, `board`
        """
      Then the calls are:
        | group    | verb       | line |
        | forge    | verdict    | 1    |
        | dispatch | plan/shape | 2    |

    Scenario: The flags of a verb come from the CLI's tables
      Then the verb "forge verdict" takes the flag "body-file"
      And the verb "forge verdict" takes no flag "body"
      And the verb "dispatch" takes the flag "run-model"
      And the group "gate" has no flag table

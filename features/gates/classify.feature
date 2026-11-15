# Source: src/gates.ts "classify", "diffPaths", "benchedSkills"; references/architecture.md "6. The self-improvement loop"
@gate:classify
Feature: The class of a CR
  Every gate that needs the class of a CR (approval, linkage, proofs-on-base, forge land and queue) classes it from its diff:
  product, tuning or guardrail. A CR is tuning only when it provably changes nothing but what the bench can measure; anything
  else under paths.factory is guardrail, and so is whatever cannot be classed. These scenarios read the class from the approval gate.

  Rule: A change to the models map of the binding, or to the tier of a benched skill, is tuning

    Scenario: The tier of a skill with a bench suite is tuning
      Given the skill "a" has a bench suite
      And a CR that changes the skill "a"
      And the skill "a" has the tier "fast" at the base and "deep" at the head
      When the approval gate runs
      Then the CR class is "tuning"

    Scenario: The tier of one step in metadata.steps is tuning
      Given the skill "a" has a bench suite
      And a CR that changes the skill "a"
      And the step "two" of the skill "a" has the tier "balanced" at the base and "deep" at the head
      When the approval gate runs
      Then the CR class is "tuning"

    Scenario: A tier change of a skill with no bench suite cannot be measured, so it is guardrail
      Given a CR that changes the skill "a"
      And the skill "a" has the tier "fast" at the base and "deep" at the head
      When the approval gate runs
      Then the CR class is "guardrail"

  Rule: Any other change under paths.factory is guardrail

    Scenario Outline: A tier change that comes with <other> is guardrail
      Given the skill "a" has a bench suite
      And a CR that changes the skill "a"
      And the skill "a" has the tier "fast" at the base and "deep" at the head
      And <other>
      When the approval gate runs
      Then the CR class is "guardrail"

      Examples:
        | other                                                             |
        | the text of the skill "a" differs at the head                     |
        | the frontmatter of the skill "a" has one more key at the head     |

    Scenario: A tier that is not a tier is guardrail
      Given the skill "a" has a bench suite
      And a CR that changes the skill "a"
      And the skill "a" has the tier "fast" at the base and "huge" at the head
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: A step tier that is not a tier is guardrail
      Given the skill "a" has a bench suite
      And a CR that changes the skill "a"
      And the step "two" of the skill "a" has the tier "balanced" at the base and "huge" at the head
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: Skill text alone is guardrail
      Given the skill "a" has a bench suite
      And a CR that changes the skill "a"
      And the text of the skill "a" differs at the head
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: Deleting a skill is guardrail
      Given the skill "a" has a bench suite
      And a CR that changes the skill "a"
      And the CR deletes the skill "a"
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: A file under paths.factory that is no skill and no binding is guardrail
      Given a CR that changes ".agents/gates.yml"
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: A binding change outside the models map is guardrail
      Given a CR that changes the binding file so that its head sets "forge.human_approval" to "never"
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: A binding file that cannot be read at the head is guardrail
      Given a CR that changes ".agents/binding.yml"
      When the approval gate runs
      Then the CR class is "guardrail"

  Rule: A CR that changes product paths, or whose paths cannot be read, is not tuning

    Scenario: A path renamed out of the factory makes a mixed CR, which is guardrail
      Given a CR whose diff is:
        """
        diff --git a/src/app.ts b/.agents/app.ts
        """
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: A path with a space is read from the header, and decides the class
      Given the binding sets "paths.factory" to the list "a b/**"
      And a CR that changes "a b/c.md"
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: A header with more than one way to split is not read, so the CR is guardrail
      Given a CR whose diff is:
        """
        diff --git a/x b/y b/z
        """
      When the approval gate runs
      Then the CR class is "guardrail"

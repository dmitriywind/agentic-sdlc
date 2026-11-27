# Source: src/skills.ts "readSkills"; src/gates.ts "skillPackCheck"
@skill:loader
Feature: The skill loader and the pack check catch a broken pack
  One loader reads the pack for validate, dispatch, skill-regression, the ledger and bench. A step is the unit that runs;
  its id is `<skill>/<step>`, or the skill name alone for a one-step skill. Problems come back as errors and warnings,
  and the steps that are sound still load. These scenarios use small fixture packs.

  Rule: Declared steps and step files agree

    Scenario: A step in the frontmatter with no file is an error, and the other steps still load
      Given a skills folder holding the standard fixture pack
      And the pack file "plan/steps/shape.md" is removed
      When the pack is read
      Then the pack has an error mentioning "step shape has no file steps/shape.md"
      And the steps are "build, escalate, learn/judge, learn/improve, plan/triage, plan/groom, review/review, review/verify, sdlc, ship"

    Scenario: A file in steps/ that the frontmatter does not declare is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "plan/steps/extra.md" is:
        """
        extra
        """
      When the pack is read
      Then the pack has an error mentioning "steps/extra.md is not in metadata.steps"

  Rule: The check reads what a skill file says

    Scenario: A broken relative link is an error
      Given a skills folder holding the standard fixture pack
      And the pack file "build/SKILL.md" is:
        """
        ---
        name: build
        description: d
        metadata:
          tier: deep
        ---
        see [the contract](../sdlc/references/nope.md)
        """
      When the pack is checked
      Then the pack has an error mentioning "broken link ../sdlc/references/nope.md"

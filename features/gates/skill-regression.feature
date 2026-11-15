# Source: src/gates.ts "skillRegression", "scorerErrors", "skillPackCheck"; the checks of a pack itself are in features/skills/loader.feature
@gate:skill-regression
Feature: Gate skill-regression
  A factory change keeps the installed skill pack and the scorers valid, so that a broken skill never reaches the trunk.
  The gate checks the pack in .agents/skills with the same check `validate` runs (features/skills/loader.feature), and
  the front matter of each scorer in .agents/scorers.

  Rule: The installed skill pack must pass its check

    Scenario: A valid pack passes
      Given the project has the installed fixture skill pack
      When I run "gate skill-regression"
      Then the exit code is 0
      And the JSON result "ok" is "true"

    Scenario: A project with no installed pack fails
      When I run "gate skill-regression"
      Then the exit code is 1
      And the output says "does not exist"

    Scenario: The problems of a skill are listed, with the skill and the line
      Given the project has the installed fixture skill pack
      And the installed skill file "sdlc-build/SKILL.md" is:
        """
        ---
        name: sdlc-build
        description: d
        metadata:
          tier: deep
        ---
        ok
        Run `agentic-sdlc board nope` here.
        """
      When I run "gate skill-regression"
      Then the exit code is 1
      And the output says ".agents/skills/sdlc-build/SKILL.md:8: 'board nope' is not a verb"

    Scenario: A top-level tier passes with a warning
      Given the project has the installed fixture skill pack
      And the installed skill file "sdlc-build/SKILL.md" is:
        """
        ---
        name: sdlc-build
        description: d
        tier: deep
        ---
        x
        """
      When I run "gate skill-regression"
      Then the exit code is 0
      And the output says "warning: sdlc-build: top-level tier is deprecated; move it to metadata.tier"

  Rule: A scorer names a step or a skill it applies to, and a scale

    Background:
      Given the project has the installed fixture skill pack

    Scenario: Scorers that apply to real steps, skills or every step pass
      Given a scorer "good" on the scale "pass-fail" that applies to "build, review/verify, plan"
      And the scorer file "star.md" is:
        """
        ---
        name: star
        applies_to: "*"
        scale: 0-4
        ---
        q
        """
      When I run "gate skill-regression"
      Then the exit code is 0

    Scenario: A scorer with a scale that does not exist is listed
      Given the scorer file "bad.md" is:
        """
        ---
        name: bad
        applies_to: "*"
        scale: 1-10
        ---
        q
        """
      When I run "gate skill-regression"
      Then the exit code is 1
      And the output says "scorers/bad.md: scale 1-10 invalid"

    Scenario: An applies_to that is neither "*" nor a list is listed
      Given the scorer file "bad.md" is:
        """
        ---
        name: bad
        applies_to: implement-spec
        scale: pass-fail
        ---
        q
        """
      When I run "gate skill-regression"
      Then the output says "scorers/bad.md: applies_to must be \"*\" or a list of step ids or skills"

    Scenario: An applies_to that names no step or skill is listed with the known ones
      Given a scorer "old" on the scale "pass-fail" that applies to "review-pr, plan/nope"
      When I run "gate skill-regression"
      Then the exit code is 1
      And the output says "scorers/old.md: applies_to 'review-pr' names no step or skill"
      And the output says "scorers/old.md: applies_to 'plan/nope' names no step or skill"

    Scenario: A scorer with no name is listed
      Given the scorer file "anon.md" is:
        """
        ---
        applies_to: "*"
        scale: pass-fail
        ---
        q
        """
      When I run "gate skill-regression"
      Then the output says "scorers/anon.md: frontmatter name missing"

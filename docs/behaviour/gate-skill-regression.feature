# Owner: src/gates.ts, skills/sdlc/references/gates.md, docs/forges.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:skill-regression
Feature: Gate skill-regression
  As the Factory owner
  I want a factory change to keep the skill pack valid
  So that a broken skill never reaches the trunk

  # Source: src/gates.ts, "skillRegression"
  # Proof: test/gates.test.ts "skill-regression: valid pack passes, bad frontmatter and broken links listed"
  Scenario: A valid skill pack passes
    Given each skill has name, description and metadata.tier
    And every relative link resolves
    When the gate runs
    Then the gate passes

  # Source: src/gates.ts, "skillRegression"
  # Proof: test/gates.test.ts "skill-regression: valid pack passes, bad frontmatter and broken links listed"
  Scenario: A bad skill is listed with its problem
    Given a skill lacks frontmatter, or has an invalid tier, or has a broken link
    When the gate runs
    Then the gate fails
    And the message lists each problem by skill

  # Source: src/gates.ts, "skillRegression" (scorers)
  # Proof: test/gates.test.ts "skill-regression: a good scorer passes; bad scorer frontmatter is listed"
  Scenario: A bad scorer is listed
    Given a scorer lacks a name, a valid applies_to or a valid scale
    When the gate runs
    Then the gate fails and lists the scorer

  # Source: src/gates.ts, "skillRegression" (deprecated tier)
  # Proof: test/gates.test.ts "skill-regression: valid pack passes, bad frontmatter and broken links listed"
  Scenario: A top-level tier passes with a warning
    Given a skill sets "tier" at the top level of the frontmatter
    When the gate runs
    Then the gate passes
    And it warns to move the tier to metadata.tier

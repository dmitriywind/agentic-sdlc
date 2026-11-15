# Source: evals/
@plugin
Feature: The plugin ships skill-triggering evals
  Each case under `evals/` has a prompt and typed graders, for `claude plugin eval`.

  Scenario: The graders name the current skills, never an old skill name
    Then no eval grader names an old skill
    And the grader "evals/release-not-model-invoked/graders/no-release-skills.md" names the skills "ship\|learn"

  Scenario: Each case has a real prompt and graders with a known type
    Then there are at least 3 eval cases
    And no eval prompt has a TODO
    And every eval case has graders of a known type

# Source: evals/
@plugin
Feature: The plugin ships skill-triggering evals
  Each case under `evals/` has a prompt and typed graders, for `claude plugin eval`.

  Scenario: Each case has a real prompt, graders of a known type, and no old skill name
    Then no eval grader names an old skill
    And the grader "evals/release-not-model-invoked/graders/no-release-skills.md" names the skills "ship\|learn"
    And there are at least 3 eval cases
    And no eval prompt has a TODO
    And every eval case has graders of a known type

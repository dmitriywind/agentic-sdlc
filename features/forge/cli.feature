# Source: src/forge/index.ts "cli", "VERBS", "GATE_CONTEXTS"; src/forge/util.ts "parseStrict", "bodyFile", "guard"
@cli:forge
Feature: The forge CLI prints JSON and exits with a clear code
  `agentic-sdlc forge <verb>` prints its result as JSON on stdout. Exit 0 is success, 1 a failure of the forge, 2 a
  usage error: a verb or a flag it does not know, a flag without its value, a value of the wrong kind, a file it cannot
  read. `--k=v` is the same as `--k v`.

  Background:
    Given the github forge for the repo "o/r"
    And the repo has the open pull request 7

  Rule: The result is JSON on stdout

    Scenario: A CR is found by its sha, with the flag as --k=v
      Given the commit "abc1234" is listed under the pull requests "7 head abc1234"
      When the forge CLI runs "view --sha=abc1234"
      Then the exit code is 0
      And the result "n" is "7"

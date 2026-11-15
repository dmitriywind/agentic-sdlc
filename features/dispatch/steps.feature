# Source: src/dispatch.ts "cli", "executorFor"; references/architecture.md "Dispatch"
@cli:dispatch
Feature: Dispatch takes step ids and finds the step's executor
  `agentic-sdlc dispatch <skill>[/<step>]` starts one step of the installed pack. The id is `<skill>/<step>`, or the
  skill alone when it has one step. The step's executor is the first entry the binding holds for the step, then for
  its skill, then the default.

  Background:
    Given the installed skill pack

  Rule: The id names a step of the installed pack

    Scenario Outline: An unknown id or a bare multi-step skill is a usage error that lists the valid ids
      When dispatch runs "<id> --ticket 1"
      Then the exit code is 2
      And the output matches "unknown step '<id>'.*valid ids: .*build.*plan/shape.*review/verify"

      Examples:
        | id   |
        | plan |

  Rule: The executor is looked up by step, then by skill, then by default

    Background:
      Given the executors are:
        | name       | run         |
        | default    | dflt        |
        | plan       | whole-skill |
        | plan/shape | one-step    |
        | review-pr  | old-name    |

    Scenario: A step of its own gets the command of its own entry, not the default's
      Given the executor "default" is '{"kind":"command","run":"bot {skill}"}'
      And the executor "plan/shape" is '{"kind":"command","run":"shape-bot {skill}"}'
      When dispatch runs "plan/shape --ticket 1"
      Then the command line mentions "shape-bot"

  Rule: Flags are checked

    Scenario: An unknown flag is a usage error
      Given the local board holds a ticket at Ready as ticket 1 and the heartbeat ticket 2
      When dispatch runs "review/review --ticket 1 --bogus build"
      Then the exit code is 2
      And the output says "unknown flag --bogus"

    Scenario: A flag without a value is a usage error
      When dispatch runs "review/review --ticket"
      Then the exit code is 2
      And the output says "--ticket needs a value"

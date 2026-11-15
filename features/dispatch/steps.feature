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
        | nope |

    Scenario: The task for a step names its step file and its tier
      When dispatch runs "plan/shape --ticket 1"
      Then the result "tier" is "deep"
      And the instruction matches "\.agents/skills/sdlc-plan/steps/shape\.md in a subagent at tier deep"

    Scenario: A step with no ticket and no change request is a usage error
      When dispatch runs "build"
      Then the exit code is 2
      And the output says "usage: agentic-sdlc dispatch"

    Scenario: No argument at all is a usage error
      When dispatch runs ""
      Then the exit code is 2

    Scenario: learn/improve works on the factory and needs neither a ticket nor a change request
      When dispatch runs "learn/improve"
      Then the exit code is 0
      And the result "kind" is "harness"
      And the result "key" is "factory-learn/improve"

  Rule: The executor is looked up by step, then by skill, then by default

    Background:
      Given the executors are:
        | name       | run         |
        | default    | dflt        |
        | plan       | whole-skill |
        | plan/shape | one-step    |
        | review-pr  | old-name    |

    Scenario Outline: The most specific entry wins, and an old skill name counts as the step that replaced it
      When dispatch runs "<step> <flag> 1"
      Then the command line mentions "<bot>"

      Examples:
        | step          | flag     | bot         |
        | plan/shape    | --ticket | one-step    |
        | plan/groom    | --ticket | whole-skill |
        | review/review | --cr     | old-name    |
        | build         | --ticket | dflt        |

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

    Scenario: A flag may carry its value after an equals sign
      When dispatch runs "build --ticket=1"
      Then the exit code is 0
      And the result "key" is "1-build"

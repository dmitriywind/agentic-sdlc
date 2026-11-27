# Source: src/next.ts "next"; skills/sdlc/routes.yml; src/ledger.ts "writeHeartbeat"; skills/sdlc/SKILL.md "Run one cycle"
@cli:next
Feature: The cycle asks the CLI what to do next and has it write the heartbeat
  `agentic-sdlc next` reads the board, the holds, the forge queue and the ledger once and applies the routes of
  skills/sdlc/routes.yml: the holds to release, then the work in the order the navigator acts, at most parallel_agents
  dispatches now and the rest later. `ledger heartbeat` posts the cycle's heartbeat and the done line that ends its claim.

  Background:
    Given a cycle on the local board

  Rule: A board with nothing to route is idle

    Scenario: Ideas, a held ticket and Done work give no work, and the cycle is idle
      Given these tickets:
        | id | status  | labels      |
        | 2  | Ideas   |             |
        | 3  | Ready   | needs-human |
        | 4  | Done    |             |
      When the cycle asks what is next
      Then the cycle is idle
      And there is no work

  Rule: A ticket routes by the first row its status and fields match

    Scenario: A Signal goes to triage, security first, and one Ready ticket to build under cycle.max_implementations
      Given these tickets:
        | id | status  | labels          | priority | created              |
        | 2  | Signals |                 |          | 2026-11-01T00:00:00Z |
        | 3  | Signals | signal:security |          | 2026-11-02T00:00:00Z |
        | 4  | Ready   | feature         | Low      | 2026-11-01T00:00:00Z |
        | 5  | Ready   | feature         | High     | 2026-11-03T00:00:00Z |
      When the cycle asks what is next
      Then the work is:
        | step        | ticket | cr |
        | plan/triage | 3      |    |
        | plan/triage | 2      |    |
        | build       | 5      |    |

  Rule: An answered hold is released first, and the ticket then routes

    Scenario: The owner replied to the ask on a held Ready ticket
      Given these tickets:
        | id | status | labels      |
        | 7  | Ready  | needs-human |
      And the owner replied to the ask on "7"
      When the cycle asks what is next
      Then the holds to release are "7"
      And the work is:
        | step  | ticket | cr |
        | build | 7      |    |

  Rule: A ticket at In review routes by the queue row of its CR, and review comes last

    Scenario: A CR with no verdict for its head is reviewed after the other work
      Given these tickets:
        | id | status    | labels |
        | 8  | In review |        |
        | 9  | Backlog   |        |
      And the open CR "21" closes "8"
      When the cycle asks what is next
      Then the work is:
        | step          | ticket | cr |
        | plan/groom    | 9      |    |
        | review/review | 8      | 21 |

  Rule: At most parallel_agents dispatches start now

    Scenario: Three Signals with two agents: two now, one later
      Given these tickets:
        | id | status  | labels | priority | created              |
        | 2  | Signals |        |          | 2026-11-01T00:00:00Z |
        | 3  | Signals |        |          | 2026-11-02T00:00:00Z |
        | 4  | Signals |        |          | 2026-11-03T00:00:00Z |
      And parallel_agents is 2
      When the cycle asks what is next
      Then the work is:
        | step        | ticket | cr |
        | plan/triage | 2      |    |
        | plan/triage | 3      |    |
      And the later work is:
        | step        | ticket | cr |
        | plan/triage | 4      |    |

  Rule: The heartbeat ends the cycle's claim

    Scenario: ledger heartbeat fills the run rows, posts the heartbeat and then the done line of the claim
      Given the cycle report "report.json" with a build run on "7" that ended "done"
      When I run "ledger heartbeat --file report.json"
      Then the exit code is 0
      And the heartbeat posted is a cycle heartbeat whose run "r1" has the tier "deep" and the executor "harness"
      And the last comment on the heartbeat ticket is the done line of the key "1-sdlc"

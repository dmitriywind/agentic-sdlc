# Source: src/gates.ts "linkage"; skills/sdlc/references/gates.md "Gates and checks"
@gate:linkage
Feature: Gate ticket-linkage
  Each product CR closes exactly one open ticket that its change line names, so that every change traces to one ticket.
  The gate posts the result as the status "ticket-linkage" on the head of the CR.

  Background:
    Given these tickets are on the board:
      | id | status  |
      | 12 | Backlog |
      | 13 | Done    |

  Rule: A product CR closes one open ticket that its change line names

    Scenario Outline: A CR that <problem> fails
      Given these CRs are on the forge:
        | cr | source   | closes   | changes  |
        | 1  | <source> | <closes> | src/x.ts |
      When the linkage gate runs for the CR "1"
      Then the gate fails with "<message>"
      And these statuses were posted:
        | sha | context        | state   |
        | h1  | ticket-linkage | failure |

      Examples:
        | problem                         | source      | closes | message                       |
        | closes a ticket not on the board | 99/add-x   | 99     | ticket 99 is not on the board |
        | closes a ticket that is Done     | 13/add-x   | 13     | ticket 13 is not open         |
        | closes two tickets               | 12/add-x   | 12, 13 | must close exactly one ticket |
        | is on a line naming another ticket | 14/add-x | 12     | does not name 12              |

    Scenario: A CR that closes the open ticket its line names passes
      Given these CRs are on the forge:
        | cr | source   | closes | changes  |
        | 1  | 12/add-x | 12     | src/x.ts |
      When the linkage gate runs for the CR "1"
      Then the gate passes
      And these statuses were posted:
        | sha | context        | state   |
        | h1  | ticket-linkage | success |

  Rule: A CR that changes only factory paths needs no ticket

    Scenario: A factory CR passes without a ticket, as a guardrail CR
      Given these CRs are on the forge:
        | cr | source       | closes | changes                   |
        | 1  | factory/tune |        | .agents/skills/a/SKILL.md |
      When the linkage gate runs for the CR "1"
      Then the gate passes
      And the gate result "factory" is "true"
      And the gate result "class" is "guardrail"

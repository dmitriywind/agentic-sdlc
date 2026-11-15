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

    Scenario: A CR that closes one open ticket named by its source passes
      Given these CRs are on the forge:
        | cr | source   | closes | changes  |
        | 1  | 12/add-x | 12     | src/x.ts |
      When the linkage gate runs for the CR "1"
      Then the gate passes
      And these statuses were posted:
        | sha | context        | state   |
        | h1  | ticket-linkage | success |

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
        | closes two tickets              | 12/add-x    | 12, 13 | must close exactly one ticket |
        | closes no ticket                | 12/add-x    |        | must close exactly one ticket |
        | closes a ticket that is Done    | 13/add-x    | 13     | ticket 13 is not open         |
        | closes a ticket not on the board | 99/add-x   | 99     | ticket 99 is not on the board |
        | has a change line that omits the ticket id | other/add-x | 12 | does not name 12     |

  Rule: A CR that changes only factory paths needs no ticket

    Scenario: A factory CR passes without a ticket, as a guardrail CR
      Given these CRs are on the forge:
        | cr | source       | closes | changes                   |
        | 1  | factory/tune |        | .agents/skills/a/SKILL.md |
      When the linkage gate runs for the CR "1"
      Then the gate passes
      And the gate result "factory" is "true"
      And the gate result "class" is "guardrail"

    Scenario: A CR that mixes product and factory paths still needs a ticket
      Given these CRs are on the forge:
        | cr | source       | closes | changes                |
        | 1  | factory/tune |        | .agents/x, src/y.ts    |
      When the linkage gate runs for the CR "1"
      Then the gate fails with "must close exactly one ticket"

    Scenario: A CR whose diff the forge cannot return is a guardrail CR that still needs its ticket
      Given these CRs are on the forge:
        | cr | source   | closes |
        | 1  | 12/add-x | 12     |
      And the forge cannot return the diff of the CR "1"
      When the linkage gate runs for the CR "1"
      Then the gate passes
      And the gate result "class" is "guardrail"
      And the gate result "factory" is "false"

    Scenario: A CR whose diff the forge cannot return and that closes no ticket fails
      Given these CRs are on the forge:
        | cr | source | closes |
        | 1  | x      |        |
      And the forge cannot return the diff of the CR "1"
      When the linkage gate runs for the CR "1"
      Then the gate fails with "must close exactly one ticket"

  Rule: A CR by a dependency bot needs no ticket

    Scenario: A dependency bot CR passes with no ticket
      Given these CRs are on the forge:
        | cr | source              | closes | author         | changes      |
        | 2  | dependabot/npm/yaml |        | dependabot[bot] | package.json |
      When the linkage gate runs for the CR "2"
      Then the gate passes
      And the gate result "dependency" is "true"
      And these statuses were posted:
        | sha | context        | state   |
        | h2  | ticket-linkage | success |

    Scenario: A dependency branch name from another author needs a ticket
      Given these CRs are on the forge:
        | cr | source      | closes | author  | changes  |
        | 1  | renovate/x  |        | mallory | src/a.ts |
      When the linkage gate runs for the CR "1"
      Then the gate fails with "must close exactly one ticket"

    Scenario: A change line that is not a dependency line needs a ticket
      Given these CRs are on the forge:
        | cr | source    | closes | changes  |
        | 3  | feature/x |        | src/a.ts |
      When the linkage gate runs for the CR "3"
      Then the gate fails with "must close exactly one ticket"
      And these statuses were posted:
        | sha | context        | state   |
        | h3  | ticket-linkage | failure |

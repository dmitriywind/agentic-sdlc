# Source: src/status.ts "liveStatus" and "cli"; skills/setup/SKILL.md "Answer from the state"
@cli:status
Feature: Status says what waits on the person and what the next cycle does
  `agentic-sdlc status` composes validate, the holds, the open CRs' approval checks, `next` and the ledger into one
  compact report: the setup skill answers "what now" from it alone.

  Background:
    Given a cycle on the local board

  Scenario: A hold and a CR waiting for the owner's approval are both listed, with the label that approves
    Given these tickets:
      | id | status    | labels      |
      | 3  | Ready     | needs-human |
      | 4  | In review |             |
    And the open CR "9" closes "4" and waits for an approval by "po"
    When the person asks for the status
    Then the status waits on the hold of "3"
    And the status waits on the approval of CR "9" by "po" with the label "approved"

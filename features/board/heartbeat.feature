# Source: src/board/index.ts "comment"; references/architecture.md "6.1"
@board:local
Feature: A heartbeat records the trunk sha as a bare string
  The cycle posts its heartbeat with `board comment --kind heartbeat`; its `factory` is the `sha` field of `vcs head`.

  Background:
    Given the board has these tickets:
      | title | status  |
      | hb    | Backlog |

  Rule: A heartbeat records the trunk sha, a bare string

    Scenario: A heartbeat whose factory is not a hex sha is refused
      Given a file "hb.json" containing:
        """
        {"kind":"cycle","factory":{"ref":"HEAD","sha":"0ebf991"},"runs":[],"errors":[]}
        """
      When I run "board comment 1 --kind heartbeat --body-file hb.json"
      Then the exit code is 2

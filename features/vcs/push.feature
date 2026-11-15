# Source: src/vcs/git.ts "push"
@cli:vcs
Feature: Vcs push
  The vcs port refuses to push the trunk, so that a change reaches the trunk only through a CR. A push from a
  detached HEAD names no branch, so it is refused too. A push from a change line goes through.

  Scenario Outline: A push from the trunk or a detached HEAD is refused
    Given the binding sets "vcs.trunk" to "main"
    And the checkout is on the branch "<branch>"
    When the vcs port pushes the checkout
    Then the push is refused saying "<message>"

    Examples:
      | branch | message       |
      | main   | trunk 'main'  |
      | HEAD   | detached HEAD |

  Scenario: A push from a change line goes through
    Given the binding sets "vcs.trunk" to "main"
    And the checkout is on the branch "T-1-x"
    When the vcs port pushes the checkout
    Then the push goes through

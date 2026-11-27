# Source: src/gates.ts "approval"; references/architecture.md section 11.4
@gate:approval
Feature: Gate human-approval
  Each CR gets the approvals its class needs, so that no CR merges without the right human decision.
  The gate classes the CR from its diff, decides who must approve, and posts the status "human-approval" on the head.

  Rule: A product CR needs a human only when its Lane or forge.human_approval says so

    Scenario Outline: The Lane and forge.human_approval decide whether a product CR waits for a human
      Given the binding sets "forge.human_approval" to "<mode>"
      And a product CR whose ticket has the Lane "<lane>"
      When the approval gate runs
      Then the CR class is "<class>"
      And the status "human-approval" is "<state>"

      Examples:
        | mode      | lane | class        | state   |
        | full-lane | Fast | product-fast | success |
        | full-lane | Full | product-full | pending |
        | always    | Fast | product-fast | pending |
        | never     | Full | product-full | success |

    Scenario: A missing Lane counts as Full
      Given a product CR whose ticket has no Lane
      When the approval gate runs
      Then the CR class is "product-full"
      And the status "human-approval" is "pending"

    Scenario: A path in paths.lane_areas forces the Full lane whatever the ticket says
      Given the binding sets "paths.lane_areas" to the list "src/**"
      And a product CR whose ticket has the Lane "Fast"
      When the approval gate runs
      Then the CR class is "product-full"
      And the status "human-approval" is "pending"

  Rule: Only a human of the repo approves a Full-lane CR
    A bot (by its forge name), the review identity, an outsider or a review with no author association approves nothing.

    Scenario Outline: Who approved the head decides the status
      Given the binding sets "forge.review_identity" to "reviewer"
      And the binding sets "owners.bots" to the account "acc-bot" on the board and "factory-bot" on the forge
      And a product CR whose ticket has the Lane "Full"
      And "<who>" with the association "<association>" approved the head
      When the approval gate runs
      Then the status "human-approval" is "<state>"

      Examples:
        | who         | association  | state   |
        | dana        | COLLABORATOR | success |
        | dana        | CONTRIBUTOR  | pending |
        | dana        | NONE         | pending |
        | dana        |              | pending |
        | factory-bot | MEMBER       | pending |
        | reviewer    | MEMBER       | pending |

    Scenario: The status names the human who approved, in lower case, on the head of the CR
      Given a product CR whose ticket has the Lane "Full"
      And "Dana" with the association "COLLABORATOR" approved the head
      When the approval gate runs
      Then the status description is "product-full: approved by dana"
      And the status is posted on the head of the CR
      And only the status "human-approval" is posted

  Rule: Only the latest decisive review of the current head counts

    Scenario: An approval of an earlier head does not count
      Given a product CR whose ticket has the Lane "Full"
      And these reviews are on the CR:
        | user | state    | commit | association |
        | dana | approved | old    | MEMBER      |
      When the approval gate runs
      Then the status "human-approval" is "pending"

    Scenario: A later request for changes withdraws an approval
      Given a product CR whose ticket has the Lane "Full"
      And these reviews are on the CR:
        | user | state             | commit | association |
        | bob  | approved          | head   | MEMBER      |
        | bob  | changes_requested | head   | MEMBER      |
      When the approval gate runs
      Then the status "human-approval" is "pending"

    Scenario: A later plain comment does not withdraw an approval
      Given a product CR whose ticket has the Lane "Full"
      And these reviews are on the CR:
        | user | state     | commit | association |
        | Ann  | approved  | head   | MEMBER      |
        | ann  | commented | head   | MEMBER      |
      When the approval gate runs
      Then the status "human-approval" is "success"

  Rule: With one account an owner approves by the approval label, for the head it was applied to
    GitHub refuses an approving review by the CR's author, so the gate also takes forge.approval_label
    (default approved) applied by an account the class asks for after the head reached the forge. An owner who is also
    the account the factory acts as counts: the guard hook and the CLI keep the agent from writing the label.

    Scenario Outline: The label approves only when the right account applied it after the head's push
      Given the binding sets "owners.product" to the list "po, factory-bot"
      And a product CR whose ticket has the Lane "Full"
      And the head reached the forge at "10:00"
      And "<who>" applied the approval label at "<at>"
      When the approval gate runs
      Then the status "human-approval" is "<state>"

      Examples:
        | who         | at    | state   |
        | PO          | 10:05 | success |
        | po          | 09:55 | pending |
        | dana        | 10:05 | pending |
        | factory-bot | 10:05 | success |

    Scenario: A push withdraws the label
      Given the binding sets "owners.product" to "po"
      And a product CR whose ticket has the Lane "Full"
      And the head reached the forge at "10:00"
      And "po" applied the approval label at "10:05"
      When the approval gate runs on a push
      Then the CR no longer carries the approval label
      And the status "human-approval" is "pending"

  Rule: A guardrail CR needs owners.factory, by the forge name

    Scenario Outline: Only a factory owner approves a guardrail CR
      Given the binding sets "owners.factory" to the list "someone, fo"
      And a CR that changes "skills/a/SKILL.md"
      And "<who>" with the association "<association>" approved the head
      When the approval gate runs
      Then the CR class is "guardrail"
      And the status "human-approval" is "<state>"

      Examples:
        | who  | association | state   |
        | fo   | OWNER       | success |
        | dana | MEMBER      | pending |
        | fo   |             | pending |

    Scenario Outline: An owner known by two names approves with the forge name only
      Given the binding sets "owners.factory" to the account "acc-7" on the board and "fo" on the forge
      And a CR that changes "skills/a/SKILL.md"
      And "<who>" with the association "OWNER" approved the head
      When the approval gate runs
      Then the status "human-approval" is "<state>"

      Examples:
        | who   | state   |
        | fo    | success |
        | acc-7 | pending |

  Rule: A tuning CR needs the owner unless learning.auto_merge_classes lists tuning

    Scenario Outline: A change of the models map alone is tuning
      Given the binding sets "learning.auto_merge_classes" to the list "<auto>"
      And a CR that changes only the models in the binding
      When the approval gate runs
      Then the CR class is "tuning"
      And the status "human-approval" is "<state>"

      Examples:
        | auto   | state   |
        | tuning | success |
        |        | pending |

  Rule: Whatever cannot be classed fails closed to guardrail

    Scenario: An unreadable diff is a guardrail CR
      Given the binding sets "forge.human_approval" to "never"
      And a CR whose diff the forge cannot return
      And "dana" with the association "MEMBER" approved the head
      When the approval gate runs
      Then the CR class is "guardrail"
      And the status "human-approval" is "pending"

    Scenario: A diff header that cannot be parsed is a guardrail CR
      Given a CR whose diff has a header with a quoted path
      When the approval gate runs
      Then the CR class is "guardrail"

    Scenario: A binding with no paths.factory classes every CR as guardrail
      Given the binding has no "paths.factory"
      And a product CR whose ticket has the Lane "Fast"
      When the approval gate runs
      Then the CR class is "guardrail"
      And the status "human-approval" is "pending"

  Rule: A CR is classed by the paths it changes

    Scenario Outline: A path under paths.factory makes a CR a guardrail CR, the glob decides what matches
      Given the binding sets "paths.factory" to the list "<glob>"
      And a CR that changes "<path>"
      When the approval gate runs
      Then the CR class is "<class>"

      Examples:
        | glob       | path                      | class        |
        | .agents/** | .agents/skills/a/SKILL.md | guardrail    |
        | a/*.md     | a/b/c.md                  | product-full |
        | a.md       | axmd                      | product-full |

    Scenario: A CR that changes product and factory paths is a guardrail CR
      Given a CR that changes "src/app.ts"
      And the CR also changes ".agents/binding.yml"
      When the approval gate runs
      Then the CR class is "guardrail"

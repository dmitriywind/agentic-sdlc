# Source: src/forge/github.ts "status", "approve", "implementer", "withToken"; references/architecture.md section 3.2; docs/forges.md "Review identity and approval"
@cli:forge
Feature: The github forge posts as the identity the binding names
  With two identities the review status and the approval are posted with options.review_token_env and never with the
  implementer's token. With one identity the status goes out with the implementer's token and an approval is refused,
  because GitHub refuses an approving review from the CR's author. A credential variable that is not set fails the
  verb and names the variable.

  Background:
    Given the github forge for the repo "o/r"
    And the forge option "token_env" is "TOK"
    And the environment variable "TOK" is "t"

  Rule: With two identities the review token posts the status and the approval

    Background:
      Given the forge has the review identity "reviewer"
      And the forge option "review_token_env" is "REV"
      And the environment variable "REV" is "r"
      And the repo has the open pull request 5 at the head "h"

    Scenario: The review status is posted with the review token
      When the forge posts the status "review" as "pending" on the commit "abcdef1"
      Then the call including "repos/o/r/statuses/abcdef1" runs with the token "r"

    Scenario: The approval is posted with the review token
      When the forge runs approve on "5"
      Then the call including "-X POST repos/o/r/pulls/5/reviews --input -" runs with the token "r"

    Scenario: Every other verb runs with the implementer token
      When the forge runs view on "5"
      Then the first call runs with the token "t"

  Rule: With two identities a missing review token fails and the implementer token is never used

    Background:
      Given the forge has the review identity "reviewer"
      And the forge option "review_token_env" is "UNSET"

    Scenario Outline: A status or an approval without the review token
      When the forge runs <verb> on "<id>"
      Then the verb fails matching "review_token_env"
      And the forge makes no call

      Examples:
        | verb    | id      |
        | status  | abcdef1 |
        | approve | 5       |

  Rule: With one identity the status uses the implementer token and the approval is refused

    Scenario: The review status is posted with the implementer token
      When the forge posts the status "review" as "success" on the commit "abcdef1"
      Then the call including "repos/o/r/statuses/abcdef1" runs with the token "t"

    Scenario: An approval is refused
      When the forge runs approve on "5"
      Then the verb fails matching "one identity"
      And the forge makes no call

  Rule: A credential variable that is not set fails and is named

    Scenario: The implementer token variable is not set
      Given the forge option "token_env" is "NOPE"
      And the repo has the open pull request 7
      When the forge runs view on "7"
      Then the verb fails matching "NOPE"

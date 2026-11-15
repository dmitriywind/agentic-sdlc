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
    And the forge credential variable "TOK" is "t"

  Rule: With two identities the review token posts the status and the approval

    Background:
      Given the forge has the review identity "reviewer"
      And the forge option "review_token_env" is "REV"
      And the forge credential variable "REV" is "r"
      And the repo has the open pull request 5 at the head "h"

  Rule: With two identities a missing review token fails and the implementer token is never used

    Background:
      Given the forge has the review identity "reviewer"
      And the forge option "review_token_env" is "UNSET"

  Rule: With one identity the status uses the implementer token and the approval is refused

  Rule: A credential variable that is not set fails and is named

# Source: src/forge/github.ts "cloud", "ccr", "implementer"; references/architecture.md section 3.2 "Adapter"
@cli:forge
Feature: In a Claude cloud session the forge is REST only
  A Claude cloud session's GitHub proxy refuses GraphQL and every path outside the attached repos, so every verb is a
  `gh api` call under repos/{owner}/{repo}/, and ready, draft and automerge use the proxy's ccr routes. An unset
  token_env falls back to the proxy's token; the review token never falls back.

  Background:
    Given the github forge without a repo option
    And the session is a Claude cloud session
    And the repo has the open pull request 5 at the head "h"

  Rule: Every verb is a REST call under the repo

    Scenario Outline: A verb on a CR calls its REST route
      When the forge runs <verb> on "5"
      Then every call is a gh api call under "repos/{owner}/{repo}/"
      And a call includes "<route>"
      And no call includes "graphql"

      Examples:
        | verb      | route                                                                   |
        | view      | repos/{owner}/{repo}/pulls/5                                            |
        | diff      | repos/{owner}/{repo}/pulls/5 -H Accept: application/vnd.github.diff    |
        | ready     | -X POST repos/{owner}/{repo}/pulls/5/ccr/ready_for_review              |
        | draft     | -X POST repos/{owner}/{repo}/pulls/5/ccr/convert_to_draft              |
        | sync      | -X PUT repos/{owner}/{repo}/pulls/5/update-branch                      |
        | automerge | -X PUT repos/{owner}/{repo}/pulls/5/ccr/auto_merge                     |
        | comments  | repos/{owner}/{repo}/issues/5/comments                                 |
        | approvals | repos/{owner}/{repo}/pulls/5/reviews                                   |

    Scenario: A CR is opened through REST with its body on stdin
      When the forge opens a draft CR from the branch "b" titled "T" with the body "Closes 1"
      Then every call is a gh api call under "repos/{owner}/{repo}/"
      And the call including "pulls --input -" sends '{"head":"b","base":"main","title":"T","body":"Closes 1","draft":true}'

    Scenario: A list is a REST call
      When the forge lists the CRs with "state=open"
      Then every call is a gh api call under "repos/{owner}/{repo}/"

    Scenario: A comment is a REST call
      When the forge comments "hi" on the CR "5"
      Then every call is a gh api call under "repos/{owner}/{repo}/"
      And the forge reads "id" as "9"

    Scenario: An approval is a REST call
      Given the forge has the review identity "reviewer"
      And the forge option "review_token_env" is "REV"
      And the environment variable "REV" is "r"
      When the forge runs approve on "5"
      Then every call is a gh api call under "repos/{owner}/{repo}/"

  Rule: An unset token_env falls back to the proxy

    Scenario: No call carries a token of its own
      Given the forge option "token_env" is "UNSET_IN_CLOUD"
      When the forge runs view on "5"
      Then no call carries a token of its own

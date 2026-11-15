# Source: src/forge/github.ts "cloud", "ccr", "implementer"; references/architecture.md section 3.2 "Adapter"
@cli:forge
Feature: In a Claude cloud session the forge is REST only
  A Claude cloud session's GitHub proxy refuses GraphQL and every path outside the attached repos, so every verb is a
  `gh api` call under repos/{owner}/{repo}/, and ready, draft and automerge use the proxy's ccr routes. An unset
  token_env falls back to the proxy's token; the review token never falls back.

  Background:
    Given the github forge without a repo option
    And the forge session is a Claude cloud session
    And the repo has the open pull request 5 at the head "h"

  Rule: Every verb is a REST call under the repo

    Scenario Outline: A verb on a CR calls its REST route
      When the forge runs <verb> on "5"
      Then every call is a gh api call under "repos/{owner}/{repo}/"
      And a call includes "<route>"
      And no call includes "graphql"

      Examples:
        | verb      | route                                                                   |
        | ready     | -X POST repos/{owner}/{repo}/pulls/5/ccr/ready_for_review              |
        | sync      | -X PUT repos/{owner}/{repo}/pulls/5/update-branch                      |

  Rule: An unset token_env falls back to the proxy

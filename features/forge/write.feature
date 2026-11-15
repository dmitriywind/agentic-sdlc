# Source: src/forge/github.ts "open", "ready", "draft", "sync", "automerge", "cut", "comment", "status", "approve"; references/architecture.md section 3.2
@cli:forge
Feature: The github forge changes a CR through gh
  Opening, readying, drafting and syncing a CR go through gh or its REST route. A repo that cannot hold draft pull
  requests marks a draft with the `draft` label, and a trunk with nothing to wait on is merged directly, once every
  required check is green.

  Background:
    Given the github forge for the repo "o/r"

  Rule: A draft is ready --undo outside the cloud, and a ready is gh pr ready

    Scenario: A CR is drafted with gh pr ready --undo
      Given the repo has the open pull request 5
      When the forge runs draft on "5"
      Then a call includes "pr ready 5 --undo"

    Scenario: A CR is marked ready with gh pr ready
      Given the repo has the open pull request 5
      When the forge runs ready on "5"
      Then a call includes "pr ready 5"
      And no call includes "--undo"

    Scenario: A CR is brought up to the trunk
      Given the repo has the open pull request 5
      When the forge runs sync on "5"
      Then a call includes "-X PUT repos/o/r/pulls/5/update-branch"

    Scenario: A CR is opened against the trunk
      When the forge opens a CR from the branch "b" titled "T" with the body "Closes 1"
      Then the forge reads "n" as "1"
      And the call including "pulls --input -" sends '{"head":"b","base":"main","title":"T","body":"Closes 1","draft":false}'

  Rule: A repo without draft pull requests marks a draft with the draft label

    Background:
      Given the repo refuses draft pull requests

    Scenario: A draft CR is opened ready, then labelled
      When the forge opens a draft CR from the branch "b" titled "T" with the body "Closes 1"
      Then the forge reads "draft" as "true"
      And a call includes "-X POST repos/o/r/issues/1/labels"

    Scenario: Ready removes the label
      Given the repo has the open pull request 5
      And the pull request 5 is labelled "draft"
      When the forge runs ready on "5"
      Then the forge reads "draft" as "false"
      And a call includes "-X DELETE repos/o/r/issues/5/labels/draft"

    Scenario: Draft adds the label when the native route refuses
      Given the repo has the open pull request 5
      When the forge runs draft on "5"
      Then the forge reads "draft" as "true"
      And a call includes "-X POST repos/o/r/issues/5/labels"

  Rule: A trunk that refuses auto-merge is merged directly, once ready and green

    Background:
      Given GitHub refuses to arm auto-merge
      And the forge requires the checks "ci"

    Scenario: A ready CR whose required checks are green is merged at its head
      Given the repo has the open pull request 5 at the head "h"
      And the head "h" has the check runs:
        | id | name | status    | conclusion |
        | 1  | ci   | completed | success    |
      When the forge runs automerge on "5"
      Then a call includes "api -X PUT repos/o/r/pulls/5/merge -f merge_method=squash -f sha=h"

    Scenario: A CR that is not ready and green is never merged
      Given the repo has the open pull request 5 at the head "h"
      And the pull request 5 is labelled "draft"
      And the head "h" has the check runs:
        | id | name | status    | conclusion |
        | 1  | ci   | completed | success    |
      When the forge runs automerge on "5"
      Then the verb fails matching "not allowed"
      And no call includes "pulls/5/merge"

    Scenario Outline: A required check that is not green stops the merge
      Given the repo has the open pull request 5 at the head "h"
      And the head "h" has the check runs:
        | id | name   | status    | conclusion   |
        | 1  | <name> | completed | <conclusion> |
      When the forge runs automerge on "5"
      Then the verb fails matching "not allowed"
      And no call includes "pulls/5/merge"

      Examples:
        | name  | conclusion | why                       |
        | ci    | failure    | the required check is red |
        | other | success    | the required check is missing |

  Rule: A release is requested from the release workflow

    Scenario: The cut returns the run newer than any before it
      Given gh lists the release runs, call by call:
        | runs        |
        | 10 old      |
        | 11 new, 10 old |
      When the forge cuts the revision "abc" as the version "1.2.0"
      Then the forge reads "run" as "11"
      And the forge reads "url" as "new"
      And a call includes "workflow run agentic-sdlc-release.yml -f revision=abc -f version=1.2.0"

  Rule: A comment is posted on the CR

    Scenario: A comment returns its id and url
      When the forge comments "hi" on the CR "5"
      Then the forge reads "id" as "9"
      And the forge reads "url" as "cu"

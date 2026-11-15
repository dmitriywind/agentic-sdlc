# Source: src/forge/github.ts "open", "ready", "draft", "sync", "automerge", "cut", "comment", "status", "approve"; references/architecture.md section 3.2
@cli:forge
Feature: The github forge changes a CR through gh
  Opening, readying, drafting and syncing a CR go through gh or its REST route. A repo that cannot hold draft pull
  requests marks a draft with the `draft` label, and a trunk with nothing to wait on is merged directly, once every
  required check is green.

  Background:
    Given the github forge for the repo "o/r"

  Rule: A draft is ready --undo outside the cloud, and a ready is gh pr ready

  Rule: A repo without draft pull requests marks a draft with the draft label

    Background:
      Given the repo refuses draft pull requests

    Scenario: A draft CR is opened ready, then labelled
      When the forge opens a draft CR from the branch "b" titled "T" with the body "Closes 1"
      Then the forge reads "draft" as "true"
      And a call includes "-X POST repos/o/r/issues/1/labels"

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

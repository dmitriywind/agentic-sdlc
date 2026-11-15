# Source: src/forge/github.ts "open", "ready", "draft", "sync", "automerge", "cut", "comment", "status", "approve"; references/architecture.md section 3.2
@cli:forge
Feature: The github forge changes a CR through gh
  Opening, readying, drafting and syncing a CR go through gh or its REST route. A repo that cannot hold draft pull
  requests marks a draft with the `draft` label, and a trunk with nothing to wait on is merged directly, once every
  required check is green.

  Background:
    Given the github forge for the repo "o/r"

  Rule: A repo without draft pull requests marks a draft with the draft label

    Background:
      Given the repo refuses draft pull requests

    Scenario: A draft CR is opened ready, then labelled
      When the forge opens a draft CR from the branch "b" titled "T" with the body "Closes 1"
      Then the forge reads "draft" as "true"
      And a call includes "-X POST repos/o/r/issues/1/labels"

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

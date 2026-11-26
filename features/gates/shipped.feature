# Source: src/gates.ts "shipped", "mergeShas"; skills/sdlc/references/gates.md; src/binding.ts "shippedOptions"
@gate:shipped
Feature: Gate shipped
  Shipped follows the real deploys, with safe tags and rollback, so that the board shows what runs in each environment.
  The binding of every scenario ships to the environments staging then production. A ticket ships to an environment when
  every merged CR that closes it is an ancestor of the deployed revision.

  Rule: A successful deploy ships the tickets whose merges are in the deployed revision

    Background:
      Given these tickets are on the board:
        | id | status  | shipped     | release_version |
        | 1  | Done    | Not shipped |                 |
        | 2  | Done    | Not shipped |                 |
        | 3  | Backlog | Not shipped |                 |
        | 4  | Done    | In release  | 2026.1          |
      And these CRs are on the forge:
        | cr | closes | merge |
        | m1 | 1      | m1    |
        | m2 | 2      | m2    |
        | m4 | 4      | m4    |

    Scenario: A Done ticket is On the environment; one further on or not yet Done is left alone
      Given every merge is an ancestor of the deployed revision
      When the shipped gate runs for "staging" with the result "success" at the revision "sha1"
      Then the ticket "1" has Shipped "On staging"
      And the ticket "2" has Shipped "On staging"
      And the ticket "3" has Shipped "Not shipped"
      And the ticket "4" has Shipped "In release"

    Scenario: A merge that is not in the deployed revision ships nothing
      Given the ancestry of the merges in the deployed revision is:
        | merge | ancestor |
        | m1    | yes      |
        | m2    | no       |
      When the shipped gate runs for "staging" with the result "success" at the revision "sha1"
      Then the gate result "changed" lists "1"

    Scenario: A VCS that cannot tell the ancestry ships nothing
      When the shipped gate runs for "staging" with the result "success" at the revision "sha1"
      Then the gate result "unknown" is "true"
      And the gate result "changed" lists "nothing"
      And the ticket "1" has Shipped "Not shipped"

  Rule: Only a Done ticket, or one In review whose merge the merge gate has not reached, ships

    Scenario: A deploy that reports before the merge gate ships the In review ticket and moves it to Done
      Given these tickets are on the board:
        | id | status    |
        | 7  | In review |
      And these CRs are on the forge:
        | cr | closes | merge |
        | m7 | 7      | m7    |
      And every merge is an ancestor of the deployed revision
      When the shipped gate runs for "staging" with the result "success" at the revision "x"
      Then the gate result "changed" lists "7"
      And the ticket "7" is at "Done"
      And the ticket "7" has Shipped "On staging"

  Rule: A later environment's value is never lowered

    Scenario: A slower deploy of an earlier environment keeps On production
      Given these tickets are on the board:
        | id | status | shipped     |
        | 50 | Done   | Not shipped |
      And these CRs are on the forge:
        | cr  | closes | merge |
        | m50 | 50     | m50   |
      And every merge is an ancestor of the deployed revision
      And a deploy of a later environment sets Shipped of the ticket "50" to "On production" while the gate runs
      When the shipped gate runs for "staging" with the result "success" at the revision "x"
      Then the gate result "changed" lists "nothing"
      And the ticket "50" has Shipped "On production"

  Rule: Merges are looked up per candidate ticket, then in the merged list
    The github forge searches merged CRs by the ticket they close; its search index can trail a merge.

    Background:
      Given these tickets are on the board:
        | id | status | shipped       |
        | 40 | Done   | Not shipped   |
        | 41 | Done   | On production |
      And these CRs are on the forge:
        | cr  | closes | merge |
        | m40 | 40     | m40   |
      And every merge is an ancestor of the deployed revision
      And the forge can search merged CRs by the ticket they close

    Scenario: A forge that searches by ticket is asked about the candidate tickets only
      When the shipped gate runs for "staging" with the result "success" at the revision "x"
      Then the gate result "changed" lists "40"
      And the forge was asked about the tickets "40" only

    Scenario: A merge the search index does not show yet is found in the merged list
      Given the forge search index does not show the merge yet
      When the shipped gate runs for "staging" with the result "success" at the revision "x"
      Then the gate result "changed" lists "40"

  Rule: The last environment tags the release

    Background:
      Given these tickets are on the board:
        | id | status | shipped    | release_version |
        | 1  | Done   | On staging | 2026.1          |
      And these CRs are on the forge:
        | cr | closes | merge |
        | m1 | 1      | m1    |
      And every merge is an ancestor of the deployed revision

    Scenario: A success in the last environment tags the version
      When the shipped gate runs for "production" with the result "success" at the revision "sha1"
      Then the ticket "1" has Shipped "On production"
      And the release tags are "v2026.1"
      And the gate result "tags" lists "v2026.1"

    Scenario: A tag failure leaves the board untouched, so a re-run retries
      Given the push of the release tag is rejected
      When the shipped gate runs for "production" with the result "success" at the revision "sha1"
      Then the gate fails with "push rejected"
      And the ticket "1" has Shipped "On staging"

  Rule: --version records the artifact version

    Scenario: A continuous deploy records its version on the ticket and tags it
      Given the binding sets "product.environments" to the list "production"
      And the binding sets "product.delivery" to "continuous"
      And these tickets are on the board:
        | id | status | shipped     |
        | 20 | Done   | Not shipped |
      And these CRs are on the forge:
        | cr  | closes | merge |
        | m20 | 20     | m20   |
      And every merge is an ancestor of the deployed revision
      When the shipped gate runs for "production" with the result "success" at the revision "x" and the version "4.1.0"
      Then the ticket "20" has Shipped "On production"
      And the ticket "20" has Release Version "4.1.0"
      And the release tags are "v4.1.0"

  Rule: A failed deploy opens one Signal and, in the last environment, returns the tickets of the failed revision

    Scenario: A failure in the last environment opens a held Signal and returns the cut tickets
      Given these tickets are on the board:
        | id | status | shipped     | release_version |
        | 1  | Done   | Not shipped |                 |
        | 2  | Done   | In release  | 2026.1          |
      And these CRs are on the forge:
        | cr | closes | merge |
        | m1 | 1      | m1    |
        | m2 | 2      | m2    |
      And every merge is an ancestor of the deployed revision
      When the shipped gate runs for "production" with the result "failure" at the revision "sha1"
      Then the gate result "changed" lists "2"
      And the ticket "2" has Shipped "On staging"
      And the ticket "2" has no Release Version
      And the ticket "1" has Shipped "Not shipped"
      And one Signal is opened with the labels "signal:deploy, needs-human"

    Scenario: With one environment a failure returns the tickets to Not shipped
      Given the binding sets "product.environments" to the list "production"
      And these tickets are on the board:
        | id | status | shipped    | release_version |
        | 1  | Done   | In release | 1               |
      And these CRs are on the forge:
        | cr | closes | merge |
        | m1 | 1      | m1    |
      And every merge is an ancestor of the deployed revision
      When the shipped gate runs for "production" with the result "failure" at the revision "sha1"
      Then the ticket "1" has Shipped "Not shipped"

    Scenario: Only the tickets whose merges are in the failed revision are reset
      Given these tickets are on the board:
        | id | status | shipped    | release_version |
        | 1  | Done   | In release | 2026.11.1       |
        | 2  | Done   | In release | 2026.11.2       |
      And these CRs are on the forge:
        | cr | closes | merge |
        | a  | 1      | A     |
        | b  | 2      | B     |
      And the ancestry of the merges in the deployed revision is:
        | merge | ancestor |
        | A     | yes      |
      When the shipped gate runs for "production" with the result "failure" at the revision "failed"
      Then the gate result "changed" lists "1"
      And the ticket "1" has Shipped "On staging"
      And the ticket "2" has Shipped "In release"
      And the ticket "2" has Release Version "2026.11.2"

    Scenario: A re-run of the same failed deploy opens no second Signal, and the Signal carries the environment label
      Given the binding sets "board.env_labels" to the list "env:staging"
      When the shipped gate runs for "staging" with the result "failure" at the revision "bad"
      And the shipped gate runs for "staging" with the result "failure" at the revision "bad"
      Then the gate result "signal" is "false"
      And one Signal is opened with the labels "signal:deploy, env:staging"

  Rule: A rollback steps back only the tickets that are not in the revision now running

    Scenario: A ticket merged after the running revision steps back and keeps its version
      Given these tickets are on the board:
        | id | status | shipped       | release_version |
        | 30 | Done   | On production | 5               |
        | 31 | Done   | On production | 4               |
      And these CRs are on the forge:
        | cr  | closes | merge |
        | m30 | 30     | new   |
        | m31 | 31     | old   |
      And the ancestry of the merges in the deployed revision is:
        | merge | ancestor |
        | old   | yes      |
      When the shipped gate runs for "production" with the result "rolled-back" at the revision "old"
      Then the gate result "changed" lists "30"
      And the ticket "30" has Shipped "On staging"
      And the ticket "30" has Release Version "5"
      And the ticket "31" has Shipped "On production"
      And no Signal is opened

  Rule: A deploy names a known environment and a known result

    Scenario: An unknown environment is refused and the known ones are listed
      When the shipped gate runs for "qa" with the result "success" at the revision "x"
      Then the gate fails with "unknown environment qa; one of staging, production"

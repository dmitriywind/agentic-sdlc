# Source: src/comments.ts "selectComments"; src/forge/index.ts "cli" (comments); src/forge/github.ts "comments"
@comments @cli:forge
Feature: Comments are selected newest first by one filter
  `forge comments` and `board comments` share one filter. The list is newest first. `--trusted` keeps the comments
  of the binding's bots and owners, by the name the forge knows them by; `--author` keeps the named authors; `--last`
  counts after those filters, so a forged comment never pushes a trusted one out.

  Background:
    Given the github forge for the repo "o/r"

  Rule: The pages come from gh api, oldest first, and the CLI answers newest first

  Rule: --trusted keeps the bots and owners by the name the forge knows them by

    Scenario: --last counts after the filter
      Given the binding sets "owners.product" to "owner"
      And the binding sets "owners.factory" to "fac"
      And the binding sets "owners.bots" to the list "bot"
      And the CR 7 has these comments:
        | author  | body |
        | owner   | b1   |
        | Bot     | b2   |
        | mallory | b3   |
      When the forge CLI runs "comments 7 --trusted --last 1"
      Then the "id" of the result entries are "2"

    Scenario: A person known by another name on the board is not trusted on the forge
      Given the binding sets "owners.product" to the account "acc-123" on the board and "ann-gh" on the forge
      And the binding sets "owners.factory" to "fac"
      And the binding sets "owners.bots" to the account "acc-bot" on the board and "bot[bot]" on the forge
      And the CR 7 has these comments:
        | author  | body |
        | ann-gh  | b1   |
        | acc-123 | b2   |
      When the forge CLI runs "comments 7 --trusted"
      Then the "id" of the result entries are "1"

  Rule: --kind and --ref filter by the marker on the first line

    Scenario: The comments of a kind for a head
      Given the CR 5 has these comments:
        | author | body                      |
        | bot    | <!-- review-pr h1 -->     |
        | bot    | <!-- review-pr h2 -->     |
        | bot    | <!-- note h1 -->          |
      When the forge CLI runs "comments 5 --kind verdict --ref h1"
      Then the printed comments open with "<!-- review-pr h1 -->"

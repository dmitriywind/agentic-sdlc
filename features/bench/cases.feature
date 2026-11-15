# Source: src/bench.ts "buildCases", "stratify", "diverse", "area"; src/cli.ts (bench build, propose)
@cli:bench
Feature: Bench cases from merged work
  `agentic-sdlc bench build` and `bench propose` make cases from the project's own Done tickets: a merged CR that
  closed the ticket and added tests. The tests are the oracle, the spec is what the agent is told.

  Background:
    Given the binding sets "board.done_statuses" to the list "Done"
    And the binding sets "spec_marker" to "<!-- spec -->"
    And the binding sets "owners.product" to "po"
    And the binding sets "owners.factory" to "fo"
    And the binding sets "owners.bots" to the list "factory-bot"

  Rule: A case is a Done ticket whose merged CR added a test

    Background:
      Given these Done tickets:
        | id | updated    | body  |
        | 1  | 2026-01-01 | body1 |
      And the forge has these change requests:
        | cr | closes | state  |
        | 10 | 1      | merged |
      And the diff of CR "10" changes "src/a.ts" and adds "test/a.test.ts, src/new.ts"

    Scenario: A CR that added no test is not a case
      Given these Done tickets:
        | id | updated    |
        | 2  | 2026-02-01 |
      And the forge has these change requests:
        | cr | closes | state  |
        | 20 | 2      | merged |
      And the diff of CR "20" changes "src/only.ts" and adds ""
      When the bench builds 5 cases
      Then the "id" of the result entries are "1"

  Rule: A case can be limited to paths and spread over sizes

    Background:
      Given the binding sets "sizes" to the list "S, M, L"
      And these Done tickets:
        | id | updated | size |
        | 1  | 2026-01 | S    |
        | 2  | 2026-02 | S    |
        | 3  | 2026-03 | S    |
        | 4  | 2026-04 | L    |
        | 5  | 2026-05 | S    |
      And the forge has these change requests:
        | cr | closes |
        | c1 | 1      |
        | c2 | 2      |
        | c3 | 3      |
        | c4 | 4      |
        | c5 | 5      |
      And the diff of CR "c1" changes "src/pay/x.ts" and adds "test/x.test.ts"
      And the diff of CR "c2" changes "docs/x.ts" and adds "test/x.test.ts"
      And the diff of CR "c3" changes "src/pay/x.ts" and adds "test/x.test.ts"
      And the diff of CR "c4" changes "src/pay/x.ts" and adds "test/x.test.ts"
      And the diff of CR "c5" changes "src/pay/x.ts" and adds "test/x.test.ts"

    Scenario: --per-size takes the cases of each size from the oldest to the newest merge
      When the bench builds cases with limit "9", per-size "2", paths "", merged-limit "" and since ""
      Then the "id" of the result entries are "1, 5, 4"
      And the "size" of the result entries are "S, S, L"
      And the "area" of the result entries are "src/pay, src/pay, src/pay"

  Rule: A proposal is diverse

    Scenario: Cases are taken one per size and area in turn
      Given these bench cases:
        | id | size | area |
        | 1  | S    | a    |
        | 2  | S    | a    |
        | 3  | L    | a    |
        | 4  | S    | b    |
      When 3 cases are picked for diversity
      Then the "id" of the result entries are "1, 3, 4"

# Source: src/binding.ts "validateBinding" and "bindingWarnings" (owners, board.scope); src/ports.ts "ownersFor"
@binding
Feature: Owners and board scope
  An owner is a name, or `{ board, forge }` when the board and the forge know the person by different accounts.
  A role takes one owner or a list. `board.scope` lets many repos share one board.

  Rule: An owner is a name or { board, forge }

    Background:
      Given a complete binding

  Rule: A role takes a list and optional roles exist

    Background:
      Given a complete binding
      And the binding value "owners" is '{"product":["a",{"board":"acc-1","forge":"ann"}],"factory":"b","operator":["ops"],"security":{"board":"s1","forge":"s2"},"compliance":["gc"],"bots":["bot"]}'

    Scenario Outline: An empty list or a half-set entry is a problem
      Given the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key             | value             | problem                              |
        | owners.product  | []                | owners.product must not be an empty list |
        | owners.operator | [""]              | owners.operator                      |

  Rule: An unknown role warns and the review identity is never an owner

    Background:
      Given a complete binding

    Scenario: An unknown owners key warns
      Given the binding value "owners.sec" is '"x"'
      When the binding is validated
      Then the warnings mention "owners.sec is not a known owner role"

  Rule: A repo that shares a board is scoped by a prefixed label

    Background:
      Given a complete binding

    Scenario: A home repo that lists every repo label is valid
      Given the binding value "board.scope" is '{"label":"repo:a","home":true,"repos":["repo:a","repo:b"]}'
      When the binding is validated
      Then validation finds no problems

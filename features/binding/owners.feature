# Source: src/binding.ts "validateBinding" and "bindingWarnings" (owners, board.scope); src/ports.ts "ownersFor"
@binding
Feature: Owners and board scope
  An owner is a name, or `{ board, forge }` when the board and the forge know the person by different accounts.
  A role takes one owner or a list. `board.scope` lets many repos share one board.

  Rule: An owner is a name or { board, forge }

    Background:
      Given a complete binding

    Scenario: An owner with one name for the board and another for the forge is valid
      Given the binding value "owners" is '{"product":{"board":"acc-1","forge":"ann"},"factory":{"board":"acc-2","forge":"fo"},"bots":["bot",{"board":"acc-3","forge":"bot[bot]"}]}'
      When the binding is validated
      Then validation finds no problems

    Scenario Outline: An owner with only one of board and forge is a problem
      Given the binding value "owners" is '<owners>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | owners                                                                          | problem         |
        | {"product":{"board":"acc-1"},"factory":"f","bots":[]}                           | owners.product  |
        | {"product":"p","factory":{"forge":"fo"},"bots":[]}                              | owners.factory  |
        | {"product":"p","factory":"f","bots":[{"board":"","forge":"x"}]}                 | owners.bots     |

  Rule: A role takes a list and optional roles exist

    Background:
      Given a complete binding
      And the binding value "owners" is '{"product":["a",{"board":"acc-1","forge":"ann"}],"factory":"b","operator":["ops"],"security":{"board":"s1","forge":"s2"},"compliance":["gc"],"bots":["bot"]}'

    Scenario: Roles that are lists and the optional roles are valid
      When the binding is validated
      Then validation finds no problems

    Scenario: Every role reads as a list of the forge accounts
      Then the owners read for the forge as:
        | role       | names    |
        | product    | a, ann   |
        | factory    | b        |
        | operator   | ops      |
        | security   | s2       |
        | compliance | gc       |
        | bots       | bot      |

    Scenario: Every role reads as a list of the board accounts
      Then the owners read for the board as:
        | role    | names   |
        | product | a, acc-1 |

    Scenario: --trusted keeps the comments of every entry of every role
      When comments by "bot, a, ann, b, ops, s2, gc, stranger" are selected with --trusted
      Then the selected comments are by "bot, a, ann, b, ops, s2, gc"

    Scenario Outline: An empty list or a half-set entry is a problem
      Given the binding value "<key>" is '<value>'
      When the binding is validated
      Then the problems mention "<problem>"

      Examples:
        | key             | value             | problem                              |
        | owners.product  | []                | owners.product must not be an empty list |
        | owners.operator | [""]              | owners.operator                      |
        | owners.security | [{"board":"x"}]   | owners.security                      |

  Rule: An unknown role warns and the review identity is never an owner

    Background:
      Given a complete binding

    Scenario: An unknown owners key warns
      Given the binding value "owners.sec" is '"x"'
      When the binding is validated
      Then the warnings mention "owners.sec is not a known owner role"

    Scenario: A review identity equal to an owner is a problem
      Given the binding value "forge" is '{"adapter":"github","review_identity":"B","options":{"review_token_env":"T"}}'
      And the binding value "owners.factory" is '"B"'
      When the binding is validated
      Then the problems mention "review_identity must not be an owner"

    Scenario: A review identity that no owner has is accepted
      Given the binding value "forge" is '{"adapter":"github","review_identity":"B","options":{"review_token_env":"T"}}'
      And the binding value "owners.factory" is '"b2"'
      When the binding is validated
      Then the problems do not mention "review_identity must not be an owner"

  Rule: A repo that shares a board is scoped by a prefixed label

    Background:
      Given a complete binding

    Scenario: A scope label must be prefixed
      Given the binding value "board.scope" is '{"label":"app-a"}'
      When the binding is validated
      Then the problems mention "board.scope.label must be"

    Scenario: Only the home repo lists repos
      Given the binding value "board.scope" is '{"label":"repo:a","repos":["repo:a"]}'
      When the binding is validated
      Then the problems mention "home repo only"

    Scenario: The home repo must list every repo label, its own included
      Given the binding value "board.scope" is '{"label":"repo:a","home":true,"repos":["repo:b"]}'
      When the binding is validated
      Then the problems mention "board.scope.repos must list"

    Scenario: A home repo that lists every repo label is valid
      Given the binding value "board.scope" is '{"label":"repo:a","home":true,"repos":["repo:a","repo:b"]}'
      When the binding is validated
      Then validation finds no problems

# Source: src/exec.ts "ghRetry", "ghReads"; src/forge/github.ts "gh"
@cli:forge
Feature: gh calls are retried on a rate limit or a server error
  A read tries up to 3 times on HTTP 429, a 403 that names a rate limit and HTTP 5xx, waiting what gh asks for, else
  1 second then 2. A write retries only on a rate limit, because a write that failed with a 5xx may have happened.

  Background:
    Given the github forge for the repo "o/r"
    And the repo has the open pull request 5

  Rule: A read is retried on a rate limit and on a server error

    Scenario Outline: A read that fails and then answers
      Given the gh calls fail <times> times with "<failure>" before they answer
      When the forge runs diff on "5"
      Then the forge made <calls> calls
      And the slept milliseconds are "<waits>"

      Examples:
        | failure                                                                  | times | calls | waits      |
        | gh: HTTP 502: Bad Gateway                                                | 2     | 3     | 1000, 2000 |
        | gh: HTTP 429: slow down. Retry-After: 7                                  | 1     | 2     | 7000       |
        | gh: HTTP 403: You have exceeded a secondary rate limit. please retry after 3 seconds | 1 | 2 | 3000       |

    Scenario: A read that keeps failing gives up after 3 tries
      Given the gh calls fail 3 times with "gh: HTTP 503" before they answer
      When the forge runs diff on "5"
      Then the verb fails matching "503"
      And the forge made 3 calls

    Scenario: A 403 that is not a rate limit is not retried
      Given the gh calls fail 1 times with "gh: HTTP 403: Resource not accessible" before they answer
      When the forge runs diff on "5"
      Then the verb fails matching "403"
      And the forge made 1 calls

  Rule: A write is retried only on a rate limit

    Scenario: A write that is rate limited is retried
      Given the gh calls fail 1 times with "gh: HTTP 429" before they answer
      When the forge comments "hi" on the CR "5"
      Then the forge reads "id" as "9"
      And the forge made 2 calls

    Scenario: A write that fails with a server error is not retried
      Given the gh calls fail 1 times with "gh: HTTP 502" before they answer
      When the forge comments "hi" on the CR "5"
      Then the verb fails matching "502"
      And the forge made 1 calls

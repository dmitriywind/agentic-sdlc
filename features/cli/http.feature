# Owner: src/exec.ts, "http" and "retryWait". The HTTP helper the REST adapters share, against a stubbed fetch and a fake clock.
Feature: The HTTP helper retries what is safe, gives up on time and keeps secrets out of errors
  A webhook URL may hold a token and a POST that failed with a server error may have started something,
  so the helper retries only what is safe and never prints a URL.

  Rule: A call is retried only when that is safe

    Scenario: A 429 and a 5xx are retried, honouring Retry-After, and the third try succeeds
      Given the API answers in turn:
        | status | retry-after |
        | 429    | 2           |
        | 503    |             |
        | 200    |             |
      When the adapter makes a GET call to "https://h/x"
      Then the call returns '{"ok":true}'
      And the helper waited "2000, 2000" milliseconds
      And the API was called 3 times

    Scenario: A call that keeps failing is given up after 3 tries and names the method, host and status
      Given the API answers in turn:
        | status |
        | 500    |
        | 502    |
        | 503    |
        | 200    |
      When the adapter makes a GET call to "https://h/x"
      Then the call fails with "GET h -> 503"
      And the API was called 3 times

    Scenario: A 4xx is not retried
      Given the API answers in turn:
        | status |
        | 404    |
        | 200    |
      When the adapter makes a GET call to "https://h/x"
      Then the API was called 1 times

    Scenario: A 5xx on POST is not retried, because the POST may have started something
      Given the API answers in turn:
        | status |
        | 500    |
        | 200    |
      When the adapter makes a POST call to "https://h/x"
      Then the API was called 1 times

    Scenario: A 429 on POST is retried
      Given the API answers in turn:
        | status |
        | 429    |
        | 200    |
      When the adapter makes a POST call to "https://h/x"
      Then the call returns '{"ok":true}'

    Scenario: A caller can ask for a single try
      Given the API answers in turn:
        | status |
        | 503    |
        | 200    |
      When the adapter makes a GET call to "https://h/x" allowing 1 try
      Then the API was called 1 times

  Rule: The wait between tries is bounded

    Scenario Outline: Retry-After is read as seconds or as a date, backs off without it, and is capped at 30 seconds
      Then the wait for the Retry-After "<header>" on attempt <attempt> at "2026-11-09T00:00:00Z" is <ms> milliseconds

      Examples:
        | header                        | attempt | ms    |
        | 5                             | 1       | 5000  |
        | Mon, 09 Nov 2026 00:00:10 GMT | 1       | 10000 |
        |                               | 2       | 2000  |
        | 3600                          | 1       | 30000 |

  Rule: A call that gets no answer is aborted

    Scenario: A request that never gets a response fails after the time limit
      Given an API that never answers
      And the time limit of a request is 100 milliseconds
      When the adapter makes a GET call to the API
      Then the call fails

  Rule: Errors never show a URL

    Scenario: A 2xx that is not JSON still counts and returns its text
      Given the API answers in turn:
        | status | body     |
        | 200    | accepted |
      When the adapter makes a POST call to "https://h/hooks/secret-token"
      Then the call returns '{"raw":"accepted"}'

    Scenario: An error answer names the method, the host and the status, never the path
      Given the API answers in turn:
        | status | body |
        | 400    | no   |
      When the adapter makes a POST call to "https://h/hooks/secret-token"
      Then the call fails with exactly "POST h -> 400: no"

    Scenario: A call that fails before any answer does not print its URL
      Given the network fails before any answer, quoting the URL
      When the adapter makes a POST call to "https://user:s3cret@h/hooks/tok-123" allowing 1 try
      Then the call fails with "POST request failed"
      And the error does not mention "s3cret"
      And the error does not mention "tok-123"
      And the error does not mention "h/hooks"
      And the API was called 1 times

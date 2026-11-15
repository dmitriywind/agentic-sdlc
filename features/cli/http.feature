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

    Scenario: A wait is capped at 30 seconds
      Given the API answers in turn:
        | status | retry-after |
        | 429    | 3600        |
        | 200    |             |
      When the adapter makes a GET call to "https://h/x"
      Then the call returns '{"ok":true}'
      And the helper waited "30000" milliseconds

    Scenario: A call that keeps failing is given up after 3 tries and names the method, host and status
      Given the API answers in turn:
        | status |
        | 503    |
      When the adapter makes a GET call to "https://h/x"
      Then the call fails with "GET h -> 503"
      And the API was called 3 times

  Rule: A call that gets no answer is aborted

    Scenario: A request that never gets a response fails after the time limit
      Given an API that never answers
      And the time limit of a request is 100 milliseconds
      When the adapter makes a GET call to the API
      Then the call fails

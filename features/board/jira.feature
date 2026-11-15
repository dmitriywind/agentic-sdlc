# Source: src/board/jira.ts; references/architecture.md "Board port"
@board:jira
Feature: The Jira board
  Tickets are Jira issues, read and written over the REST API with the email and token the binding names.

  Rule: A read follows every page or fails

    Scenario: A list follows the next page token until the last page
      Given the jira board adapter
      And Jira lists the issues "PROJ-1" and "PROJ-2" on two pages
      When the factory lists the tickets
      Then the listed ticket ids are "PROJ-1, PROJ-2"
      And the search was called 2 times

    Scenario: A list whose page does not advance is an error, not a partial list
      Given the jira board adapter
      And Jira answers every page with the same next page token
      When the factory lists the tickets
      Then the verb fails matching "jira: list does not advance"

    Scenario: The comments of every page are read
      Given the jira board adapter
      And Jira holds 150 comments and the comment 120 says "marker-x"
      When the factory reads the comments of the ticket "PROJ-1"
      Then the board returns 150 comments

    Scenario: A marker on the second page of comments is found
      Given the jira board adapter
      And Jira holds 150 comments and the comment 120 says "marker-x"
      When the factory reads the comments of the ticket "PROJ-1" with the marker "marker-x"
      Then the comment ids are "120"

  Rule: A search text cannot break out of its JQL string

    Scenario: A backslash and a quote in the search text are escaped
      Given the jira board adapter
      When the factory searches the tickets for "a\\\"b"
      Then the JQL searches for the text "a\\\"b" with the backslash and the quote escaped

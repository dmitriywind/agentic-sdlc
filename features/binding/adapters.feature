# Source: src/binding.ts "validateBinding" (adapter options, github-issues field_ids)
@binding
Feature: Adapter options are checked per adapter
  Each adapter lists the options it reads. An option the adapter does not read is a typo; an option it needs and
  does not get is a failure that would only show at run time.

  Rule: Options are checked against the adapter that reads them

    Background:
      Given a complete binding

    Scenario: A board option the adapter requires is missing
      Given the binding value "board.adapter" is '"jira"'
      And the binding value "board.options" is '{"base_url":"u","project":"P","email_env":"E","token_env":"T"}'
      When the binding is validated
      Then the problems mention "board.options.project_key is required"

  Rule: github-issues field_ids map the status and board fields to org issue field ids

    Background:
      Given a complete binding
      And the binding value "board.adapter" is '"github-issues"'
      And the binding value "board.fields" is '{"size":"Size"}'

    Scenario: A map of the status and a board field to positive ids is valid
      Given the binding value "board.options" is '{"repo":"o/r","field_ids":{"status":10,"size":11}}'
      When the binding is validated
      Then validation finds no problems

    Scenario: A key that is neither status nor a board field is rejected
      Given the binding value "board.options" is '{"repo":"o/r","field_ids":{"stage":10}}'
      When the binding is validated
      Then the problems mention "board.options.field_ids.stage is not 'status' or a key of board.fields"

    Scenario: An id that is not a positive integer is rejected
      Given the binding value "board.options" is '{"repo":"o/r","field_ids":{"status":"abc"}}'
      When the binding is validated
      Then the problems mention "board.options.field_ids.status must be a positive integer"

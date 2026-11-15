# Source: src/binding.ts "validateBinding" (adapter options)
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

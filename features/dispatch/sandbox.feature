# Source: src/dispatch.ts "cli" (the sandbox check); templates/runner/local.md
@cli:dispatch
Feature: An unattended run uses local execution only when both opt-ins are set
  A stage runs on the machine of the cycle when it names sandbox local, and an unattended run refuses that unless the
  runner also sets AGENTIC_SDLC_LOCAL=1. A stage with no sandbox of its own takes the default stage's sandbox.

  Background:
    Given the installed skill pack
    And the runner sets "U" to "https://h/x"

  Rule: Local execution is opt-in twice

    Scenario Outline: The stage's sandbox and the runner's variable decide whether an unattended run starts
      Given the executor "default" is '<stage>'
      And the runner sets "AGENTIC_SDLC_LOCAL" to "<local>"
      And the runner sets "AGENTIC_SDLC_UNATTENDED" to "<unattended env>"
      When dispatch runs "build --ticket 1 <flag>"
      Then the exit code is <exit>

      Examples:
        | stage                                                  | local | unattended env | flag         | exit |
        | {"kind":"harness","sandbox":"local"}                   | 1     |                | --unattended | 0    |
        | {"kind":"command","run":"bot","sandbox":"local"}       | 1     |                | --unattended | 0    |
        | {"kind":"harness"}                                     | 1     |                | --unattended | 1    |
        | {"kind":"command","run":"bot"}                         |       |                | --unattended | 1    |
        | {"kind":"harness","sandbox":"local"}                   | yes   |                | --unattended | 1    |
        | {"kind":"command","run":"bot","sandbox":"local"}       |       | 1              |              | 1    |
        | {"kind":"command","run":"bot","sandbox":"local"}       |       |                |              | 0    |
        | {"kind":"command","run":"bot","sandbox":"container"}   |       |                | --unattended | 0    |
        | {"kind":"webhook","url_env":"U"}                       |       |                | --unattended | 0    |

  Rule: A stage with no sandbox of its own takes the default stage's

    Scenario Outline: The default's sandbox applies to a step that names none
      Given the executor "default" is '{"kind":"harness","sandbox":"<sandbox>"}'
      And the executor "build" is '{"kind":"command","run":"bot"}'
      When dispatch runs "build --ticket 1 --unattended"
      Then the exit code is <exit>

      Examples:
        | sandbox   | exit |
        | container | 0    |
        | local     | 1    |

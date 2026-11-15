# Source: src/dispatch.ts "cli" (the command executor), src/bench.ts "quote"
@cli:dispatch
Feature: A command stage starts a detached bot
  The stage's run template is filled with quoted values and run through the platform shell, detached, with its output
  in a run log. The bot gets a minimal environment plus the secrets the stage lists, never a secret on disk.

  Background:
    Given the installed skill pack

  Rule: The template is filled with quoted words

    Scenario: Each placeholder becomes one quoted word and the shell runs the line
      Given the executor "ship" is '{"kind":"command","run":"bot {skill} {ticket} {cr} {workdir}"}'
      When dispatch runs "ship --ticket 5 --cr 9 --workdir 'C:/my dir'"
      Then the exit code is 0
      And the command line is the template "bot {} {} {} {}" filled with the quoted words "ship|5|9|C:/my dir"

    Scenario: A value with a line break is refused
      Given the executor "default" is '{"kind":"command","run":"bot {ticket}"}'
      When dispatch runs build for a ticket whose id holds a line break
      Then the exit code is 1

  Rule: The bot runs detached with a private run log

    Scenario: The pid is the run reference and the output goes to a run log
      Given the executor "default" is '{"kind":"command","run":"bot"}'
      When dispatch runs "ship --ticket 5"
      Then the exit code is 0
      And the result "ref" is "1234"
      And the command runs detached with its input ignored
      And the run log is in the folder agentic-sdlc-runs of the temp folder and ends with "-ship-5.log"

    Scenario: The run log folder and the log are private to the user
      Given the executor "default" is '{"kind":"command","run":"bot"}'
      When dispatch runs "ship --ticket 5"
      Then the run log folder is private to the user and so is the run log

  Rule: The bot gets only what the stage lists

    Background:
      Given the models are fast "f", balanced "b" and deep "d"
      And the binding has "mcps" set to the JSON '{"docs":{"url":"https://docs/mcp","token_env":"DOCS_TOKEN"},"db":{"command":"db-mcp"}}'
      And the executor "default" is '{"kind":"command","run":"bot {model} {mcps_file}","mcps":["docs"],"secrets":["NPM_TOKEN"],"model":{"tier":"deep"}}'
      And the runner sets "PATH" to "/bin"
      And the runner sets "HOME" to "/h"
      And the runner sets "DOCS_TOKEN" to "docs-secret"
      And the runner sets "OTHER" to "build"

    Scenario: The environment holds the minimal variables and the listed secrets only
      Given the runner sets "NPM_TOKEN" to "npm-secret"
      When dispatch runs "build --ticket 1"
      Then the exit code is 0
      And the child environment holds "NPM_TOKEN" as "npm-secret"
      And the child environment holds "PATH" as "/bin"
      And the child environment has no "OTHER"
      And the child environment has no "DOCS_TOKEN"

    Scenario: The mcps file names the listed servers and holds no token value
      Given the runner sets "NPM_TOKEN" to "npm-secret"
      When dispatch runs "build --ticket 1"
      Then the mcps file holds exactly the servers '{"docs":{"url":"https://docs/mcp","token_env":"DOCS_TOKEN"}}'
      And the mcps file does not hold "docs-secret"

    Scenario: The model of the stage's tier fills {model}
      Given the runner sets "NPM_TOKEN" to "npm-secret"
      When dispatch runs "build --ticket 1"
      Then the command line mentions "'d'"
      And the result "model" is "d"

    Scenario: A listed secret that is unset stops the dispatch
      When dispatch runs "build --ticket 1"
      Then the exit code is 1
      And the output says "set the NPM_TOKEN environment variable"

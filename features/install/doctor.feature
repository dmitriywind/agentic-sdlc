# Source: src/install.ts "doctor", "trunkProtection", "implementerToken", "selfHostedRunner", "cloudBoard", "deliveryWorkflow", "unpinnedActions", "cliPin", "probeFailure"
@cli:doctor
Feature: Doctor checks what the gates rely on
  `agentic-sdlc doctor` validates, then probes the board, the forge and the vcs and checks the project's setup: that
  the trunk is protected by checks pinned to CI, that the implementer's token cannot post a commit status, that
  the runners are safe, that the delivery workflow and the CLI pin match the binding. A line starts with `ok`,
  `warn` or `fail`; a `fail` makes doctor exit 1.

  Rule: The trunk must enforce the required checks, each pinned to the app that posts it

    Background:
      Given the binding sets "forge.options.repo" to "o/r"

    Scenario: A required check that is not pinned to an app is warned about
      Given the trunk rules require the checks:
        | context  | integration_id |
        | Required | 15368          |
        | review   |                |
      When doctor checks the trunk protection
      Then doctor line 2 matches "not pinned.*: review;"

  Rule: A classic implementer token can post commit statuses

    Background:
      Given the binding sets "forge.options.token_env" to "IMPL"
      And the environment variable "IMPL" is "x"

    Scenario: A token with the repo scope warns that code a cycle runs can post commit statuses
      Given the user read at GitHub answers with the token scopes "read:org, repo, workflow"
      When doctor checks the implementer token
      Then doctor line 1 matches "^warn: the implementer token \(IMPL\) has scope repo"

  Rule: A self-hosted runner must not run a fork's code or share one runner between code and secrets

    Background:
      Given the binding sets "forge.options.repo" to "o/r"

    Scenario: Hosted runners print nothing
      Given the repo variable "AGENTIC_RUNS_ON" is '"ubuntu-latest"'
      And the repo is "private"
      When doctor checks the self-hosted runner
      Then doctor prints no line

    Scenario: A self-hosted runner on a public repo fails
      Given the repo variable "AGENTIC_RUNS_ON" is '"self-hosted"'
      And the repo is "public"
      When doctor checks the self-hosted runner
      Then doctor line 1 matches "^fail runner: a self-hosted runner on a public repo"

    Scenario: One self-hosted runner for the CR code and the secret jobs warns
      Given the repo variable "AGENTIC_RUNS_ON" is '"self-hosted"'
      And the repo is "private"
      When doctor checks the self-hosted runner
      Then doctor line 1 matches "^warn: runner: CR code and the secret jobs share one self-hosted runner"

  Rule: The delivery workflow must name the trunk and the delivery of the binding

    Background:
      Given the binding sets "vcs.trunk" to "main"
      And the binding sets "vcs.release_prefix" to "release/"

    Scenario: An env.DELIVERY that is not product.delivery fails
      Given the delivery workflow pushes on the branches "main" and sets the env:
        | TRUNK    | main       |
        | DELIVERY | continuous |
      And the binding has no "product.delivery"
      When doctor checks the delivery workflow
      Then doctor line 1 matches "^fail delivery workflow: env\.DELIVERY"

  Rule: An installed workflow action should be pinned to a commit SHA

    Scenario: An installed workflow whose action is a tag is a warning naming the file and the action
      Given the project has the file ".github/workflows/agentic-sdlc-cr.yml" holding "jobs:\n  j:\n    steps:\n      - uses: actions/setup-node@v4\n"
      When doctor checks the workflow actions
      Then doctor line 1 matches "^warn workflow actions:.*agentic-sdlc-cr\.yml: actions/setup-node@v4"

  Rule: The CLI pin must parse, and the launcher must exist and run

    Scenario Outline: A pin that is not a JSON object or has no sha or tag ref fails doctor
      Given the project has the file ".agents/cli.json" holding '<pin>'
      When doctor checks the CLI pin
      Then doctor line 1 matches "<line>"

      Examples:
        | pin                           | line                                    |
        | null                          | ^fail cli pin: .*not a JSON object      |
        | {"package":"p","ref":"main"}  | ^fail cli pin: ref 'main'               |

  Rule: A failed probe says why and shows no secret

    Scenario: The line holds the command and the first line of its error, with the value of every env var the binding names masked
      Given the binding sets "forge.options.token_env" to "GH_PAT_X"
      And the environment variable "GH_PAT_X" is "hunter2hunter2"
      When a probe fails with the message "Command failed: gh api repos/acme/shop/pulls\nHTTP 403: bad credentials hunter2hunter2\nmore"
      Then doctor line 1 is "Command failed: gh api repos/acme/shop/pulls (HTTP 403: bad credentials ***)"

  Rule: The forge probe reads check data

    Scenario: A token that cannot read checks fails doctor
      Given an installable package at version "9.9.9"
      And I run the install command "init --board local"
      And the installed binding is the shipped template on a local board with the heartbeat ticket "1"
      And the forge lists one pull request but refuses check data
      When doctor runs against the fake forge
      Then the forge was asked for check runs
      And the exit code is 1
      And a line of the output matches "^fail forge\.list:"

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

    Scenario: Doctor accepts the checks that block a merge
      Given the trunk rules require the checks:
        | context  | integration_id |
        | Required | 15368          |
      When doctor checks the trunk protection
      Then doctor line 1 matches "^ok"

    Scenario: A required check that is not pinned to an app is warned about
      Given the trunk rules require the checks:
        | context  | integration_id |
        | Required | 15368          |
        | review   |                |
      When doctor checks the trunk protection
      Then doctor line 2 matches "not pinned.*: review;"

    Scenario: A trunk with no required check fails
      Given the trunk rules require the checks:
        | context | integration_id |
      When doctor checks the trunk protection
      Then doctor line 1 matches "^fail trunk protection: no required status checks"

    Scenario: With no repo to read, doctor reminds to pin each check
      Given the binding has no "forge.options.repo"
      When doctor checks the trunk protection
      Then a doctor line matches "^warn: pin each required check"

    Scenario: A repo that cannot enforce rules warns that no gate blocks a merge
      Given reading the trunk rules fails with "Command failed: gh api\ngh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)"
      When doctor checks the trunk protection
      Then doctor prints one line
      And doctor line 1 matches "^warn: trunk protection: main has no enforced ruleset or branch protection, so no gate blocks a merge"

    Scenario: No rules and no branch protection warn the same
      Given the trunk rules are empty
      And the trunk branch protection reads "false"
      When doctor checks the trunk protection
      Then doctor line 1 matches "no gate blocks a merge"

    Scenario: Classic branch protection is reported, to be checked by hand
      Given the trunk rules are empty
      And the trunk branch protection reads "true\n"
      When doctor checks the trunk protection
      Then doctor line 1 matches "classic branch protection is on"

    Scenario Outline: Rules that cannot be read say to check manually
      Given reading the trunk rules fails with "<error>"
      When doctor checks the trunk protection
      Then doctor line 1 matches "check manually"

      Examples:
        | error                                                  |
        | network down                                           |
        | gh: Resource not accessible by integration (HTTP 403)  |

  Rule: A classic implementer token can post commit statuses

    Background:
      Given the binding sets "forge.options.token_env" to "IMPL"
      And the environment variable "IMPL" is "x"

    Scenario Outline: A token with the repo scope warns that code a cycle runs can post commit statuses
      Given the user read at GitHub answers with the token scopes "<scopes>"
      When doctor checks the implementer token
      Then doctor line 1 matches "^warn: the implementer token \(IMPL\) has scope <named>"

      Examples:
        | scopes                  | named      |
        | read:org, repo, workflow | repo       |
        | repo:status             | repo:status |

    Scenario: The scope read uses the token the binding names
      Given the user read at GitHub answers with the token scopes "read:org, repo, workflow"
      When doctor checks the implementer token
      Then the user read used the token "x"

    Scenario: A fine-grained token prints no warning
      Given the user read at GitHub answers with the token scopes "read:org"
      When doctor checks the implementer token
      Then doctor prints no line

    Scenario: A token whose scopes GitHub does not report prints no warning
      Given the user read at GitHub answers with no token scopes header
      When doctor checks the implementer token
      Then doctor prints no line

    Scenario: A failed read prints no warning, since forge.list reports the failure
      Given the user read at GitHub fails with "401"
      When doctor checks the implementer token
      Then doctor prints no line

  Rule: A self-hosted runner must not run a fork's code or share one runner between code and secrets

    Background:
      Given the binding sets "forge.options.repo" to "o/r"

    Scenario Outline: Hosted runners and no variables print nothing
      Given the repo variable "AGENTIC_RUNS_ON" is '<runs_on>'
      And the repo is "private"
      When doctor checks the self-hosted runner
      Then doctor prints no line

      Examples:
        | runs_on          |
        |                  |
        | "ubuntu-latest"  |

    Scenario: A self-hosted runner on a public repo fails
      Given the repo variable "AGENTIC_RUNS_ON" is '["self-hosted"]'
      And the repo is "public"
      When doctor checks the self-hosted runner
      Then doctor line 1 matches "^fail runner: .*public repo"

    Scenario: One self-hosted runner for code and secrets warns
      Given the repo variable "AGENTIC_RUNS_ON" is '["self-hosted"]'
      And the repo is "private"
      When doctor checks the self-hosted runner
      Then doctor line 1 matches "^warn: runner: CR code and the secret jobs share"

    Scenario: Two separate runners are ok
      Given the repo variable "AGENTIC_RUNS_ON" is '["self-hosted","code"]'
      And the repo variable "AGENTIC_RUNS_ON_TRUSTED" is '["self-hosted","trusted"]'
      And the repo is "private"
      When doctor checks the self-hosted runner
      Then doctor line 1 matches "^ok   runner: self-hosted"

    Scenario: A repo whose variables cannot be read prints nothing, since forge.list reports it
      Given reading the repo variables fails with "403"
      When doctor checks the self-hosted runner
      Then doctor prints no line

  Rule: A Claude cloud session cannot reach GitHub Projects

    Scenario: A github board in a cloud session fails and names the boards it can reach
      Given the binding sets "board.adapter" to "github"
      And the session is a Claude cloud session
      When doctor checks the board against the session
      Then doctor line 1 matches "^fail board: .*cannot reach GitHub Projects.*github-issues, jira or linear.*GitHub Actions"

    Scenario: A github board outside a cloud session prints nothing
      Given the binding sets "board.adapter" to "github"
      When doctor checks the board against the session
      Then doctor prints no line

    Scenario: A jira board in a cloud session prints nothing
      Given the binding sets "board.adapter" to "jira"
      And the session is a Claude cloud session
      When doctor checks the board against the session
      Then doctor prints no line

  Rule: The delivery workflow must name the trunk and the delivery of the binding

    Background:
      Given the binding sets "vcs.trunk" to "main"
      And the binding sets "vcs.release_prefix" to "release/"

    Scenario: A workflow that does not push on the trunk fails
      Given the delivery workflow pushes on the branches "main, release/**" and sets the env:
        | TRUNK          | main         |
        | RELEASE_PREFIX | release/     |
        | DELIVERY       | release-line |
      And the binding sets "vcs.trunk" to "master"
      When doctor checks the delivery workflow
      Then doctor line 1 matches "^fail delivery workflow:.*trunk master"

    Scenario: A workflow that names the trunk and the release line is ok
      Given the delivery workflow pushes on the branches "main, release/**" and sets the env:
        | TRUNK          | main         |
        | RELEASE_PREFIX | release/     |
        | DELIVERY       | release-line |
      When doctor checks the delivery workflow
      Then doctor line 1 matches "^ok   delivery workflow: names trunk main"

    Scenario: An env.TRUNK that is not the trunk fails
      Given the delivery workflow pushes on the branches "main, release/**" and sets the env:
        | TRUNK          | trunk        |
        | RELEASE_PREFIX | release/     |
        | DELIVERY       | release-line |
      When doctor checks the delivery workflow
      Then doctor line 1 matches "^fail delivery workflow: env.TRUNK"

    Scenario: Continuous delivery needs no release prefix
      Given the delivery workflow pushes on the branches "main" and sets the env:
        | TRUNK    | main       |
        | DELIVERY | continuous |
      And the binding sets "product.delivery" to "continuous"
      When doctor checks the delivery workflow
      Then doctor line 1 matches "^ok   delivery workflow"

    Scenario: An env.DELIVERY that is not product.delivery fails
      Given the delivery workflow pushes on the branches "main" and sets the env:
        | TRUNK    | main       |
        | DELIVERY | continuous |
      And the binding has no "product.delivery"
      When doctor checks the delivery workflow
      Then doctor line 1 matches "^fail delivery workflow: env\.DELIVERY"

    Scenario: A project with no delivery workflow prints nothing
      When doctor checks the delivery workflow
      Then doctor prints no line

  Rule: An installed workflow action should be pinned to a commit SHA

    Scenario: A project with no workflows prints nothing
      When doctor checks the workflow actions
      Then doctor prints no line

    Scenario: Pinned actions and workflows of the project's own are not warned about
      Given the project has the file ".github/workflows/agentic-sdlc-verify.yml" holding "jobs:\n  j:\n    steps:\n      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v7.0.1\n"
      And the project has the file ".github/workflows/ci.yml" holding "jobs:\n  j:\n    steps:\n      - uses: actions/checkout@v4\n"
      When doctor checks the workflow actions
      Then doctor prints no line

    Scenario: An installed workflow whose action is a tag is a warning naming the file and the action
      Given the project has the file ".github/workflows/agentic-sdlc-cr.yml" holding "jobs:\n  j:\n    steps:\n      - uses: actions/setup-node@v4\n"
      When doctor checks the workflow actions
      Then doctor line 1 matches "^warn workflow actions:.*agentic-sdlc-cr\.yml: actions/setup-node@v4"

  Rule: The CLI pin must parse, and the launcher must exist and run

    Background:
      Given an installable package at version "9.9.9"

    Scenario: Before init the pin and the launcher are missing
      When doctor checks the CLI pin
      Then a doctor line matches "^fail cli pin: \.agents/cli\.json is missing"
      And a doctor line matches "^fail cli pin: \.agents/bin/agentic-sdlc is missing"

    Scenario: A tag pin warns that a tag can move
      Given I run the install command "init"
      When doctor checks the CLI pin
      Then doctor line 1 matches "^warn: cli pin: ref v9\.9\.9 is a tag, and a tag can move"
      And doctor prints one line

    Scenario: A commit pin is ok
      Given I run the install command "init"
      And the project has the file ".agents/cli.json" holding '{"package":"github:x/y","ref":"cccccccccccccccccccccccccccccccccccccccc"}'
      When doctor checks the CLI pin
      Then doctor line 1 is "ok   cli pin: github:x/y at commit cccccccccccc"
      And doctor prints one line

    Scenario: A ref that is neither a sha nor a version tag fails
      Given I run the install command "init"
      And the project has the file ".agents/cli.json" holding '{"package":"github:x/y","ref":"main"}'
      When doctor checks the CLI pin
      Then doctor line 1 matches "^fail cli pin: ref 'main'"

    Scenario: A pin that is not JSON fails
      Given I run the install command "init"
      And the project has the file ".agents/cli.json" holding "{ nope"
      When doctor checks the CLI pin
      Then doctor line 1 matches "^fail cli pin: .*not valid JSON"

    Scenario: A launcher that is not executable fails
      Given I run the install command "init"
      And the adopter makes the installed file ".agents/bin/agentic-sdlc" not executable
      When doctor checks the CLI pin
      Then a doctor line matches "^fail cli pin: .*not executable"

  Rule: A failed probe says why and shows no secret

    Scenario: The line holds the command and the first line of its error, with the value of every env var the binding names masked
      Given the binding sets "forge.options.token_env" to "GH_PAT_X"
      And the environment variable "GH_PAT_X" is "hunter2hunter2"
      When a probe fails with the message "Command failed: gh api repos/acme/shop/pulls\nHTTP 403: bad credentials hunter2hunter2\nmore"
      Then doctor line 1 is "Command failed: gh api repos/acme/shop/pulls (HTTP 403: bad credentials ***)"

    Scenario: A plain reason is shown as its first line
      When a probe fails with the message "plain reason\nsecond line"
      Then doctor line 1 is "plain reason"

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

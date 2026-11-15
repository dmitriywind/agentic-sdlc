# Source: src/install.ts "pinCli", templates/bin/agentic-sdlc, templates/gates/github/*.yml, templates/runner/*, templates/gates/hooks/pre-push
@cli:init
Feature: The CLI pin and the launcher
  A project runs the CLI through `.agents/bin/agentic-sdlc`, which installs the version pinned in
  `.agents/cli.json` once and runs it. Init writes the pin and the launcher, moves a pin it wrote to the package's
  version, and keeps a pin the project chose. It never edits package.json or .npmrc.

  Rule: Init writes the pin as a factory file

    Background:
      Given an installable package at version "9.9.9"

    Scenario: Init pins the CLI at the package's release tag and touches neither package.json nor .npmrc
      Given the project has the file "package.json" holding '{\n    "name": "p"\n}\n'
      When I run the install command "init --harness cursor"
      Then the installed file ".agents/cli.json" sets "package" to "github:dmitriywind/agentic-sdlc"
      And the installed file ".agents/cli.json" sets "ref" to "v9.9.9"
      And the installed file "package.json" holds '{\n    "name": "p"\n}\n'
      And the installed file ".npmrc" is absent

  Rule: An upgrade moves the pin that init wrote and keeps the one the project chose

    Background:
      Given an installable package at version "9.9.9"

    Scenario: An unedited pin follows the package
      Given I run the install command "init"
      And the package is at version "9.10.0"
      When I run the install command "init --upgrade"
      Then the installed file ".agents/cli.json" sets "ref" to "v9.10.0"

    Scenario: A commit sha the project set is kept
      Given I run the install command "init"
      And the project has the file ".agents/cli.json" holding '{"package":"github:me/fork","ref":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
      And the package is at version "9.11.0"
      When I run the install command "init --upgrade"
      Then the installed file ".agents/cli.json" sets "ref" to "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      And the output says "kept .agents/cli.json"

    Scenario: --ref moves the pin and keeps the package, and --force follows the package over a sha the project set
      Given I run the install command "init"
      And the project has the file ".agents/cli.json" holding '{"package":"github:me/fork","ref":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
      When I run the install command "init --ref v1.2.3"
      Then the installed file ".agents/cli.json" sets "package" to "github:me/fork"
      And the installed file ".agents/cli.json" sets "ref" to "v1.2.3"
      When I run the install command "init --force"
      Then the installed file ".agents/cli.json" sets "ref" to "v9.9.9"

  Rule: The launcher installs the pinned ref once and runs it

    Background:
      Given a project with the launcher and the pin "github:acme/tool" at "v1.2.3"
      And an npm that lays out a CLI printing its arguments

    Scenario: The launcher installs the pinned ref beside its final folder, without scripts, and runs the CLI with its arguments
      When I run the launcher with "board list --status Ready"
      Then the output says '["board","list","--status","Ready"]'
      And npm call 1 installed "github:acme/tool" at "v1.2.3" beside the final folder, without scripts
      And the installed folder ".agents/.cli" holds exactly "v1.2.3"

    Scenario: The second call runs the same install, and a new ref installs again beside the old one
      Given I run the launcher with "board list"
      When I run the launcher with "gate linkage"
      Then the output says '["gate","linkage"]'
      And npm ran 1 times
      Given the pin is changed to "github:acme/tool" at "dddddddddddddddddddddddddddddddddddddddd"
      When I run the launcher with "doctor"
      Then npm ran 2 times
      And the installed folder ".agents/.cli" holds exactly "v1.2.3, dddddddddddddddddddddddddddddddddddddddd"

    Scenario Outline: A ref that could leave the folder is refused before npm runs
      Given the pin is changed to "github:acme/tool" at "<ref>"
      When I run the launcher with "doctor"
      Then the exit code is 1
      And the output says "ref is missing or not a commit sha or version tag"
      And npm ran 0 times

      Examples:
        | ref |
        | ../x |
        | ..   |

  Rule: The stock files run the CLI through the launcher

    Scenario Outline: No stock workflow, runner or hook file installs or versions the CLI another way
      Then no stock workflow, runner or hook file contains '<text>'

      Examples:
        | text                             |
        | AGENTIC_SDLC_VERSION             |
        | npx --no agentic-sdlc            |

    Scenario: Every CLI call in a workflow goes through the launcher
      Then no stock workflow calls agentic-sdlc gate or vcs except through the launcher

    Scenario: The stock files call the launcher
      Then the stock file "templates/gates/github/agentic-sdlc-cr.yml" matches "\.agents/bin/agentic-sdlc gate approval"

    Scenario: A job that holds secrets runs the launcher and cli.json of the trunk
      Then every job of the stock workflow "templates/gates/github/agentic-sdlc-cr.yml" that runs the launcher checks out the base

# Source: src/install.ts "pinCli", templates/bin/agentic-sdlc, templates/gates/github/*.yml, templates/runner/*, templates/gates/hooks/pre-push
@cli:init
Feature: The CLI pin and the launcher
  A project runs the CLI through `.agents/bin/agentic-sdlc`, which installs the version pinned in
  `.agents/cli.json` once and runs it. Init writes the pin and the launcher, moves a pin it wrote to the package's
  version, and keeps a pin the project chose. It never edits package.json or .npmrc.

  Rule: Init writes the pin as a factory file

    Background:
      Given an installable package at version "9.9.9"

    Scenario: Init pins the CLI at the package's release tag
      When I run the install command "init"
      Then the installed file ".agents/cli.json" sets "package" to "github:dmitriywind/agentic-sdlc"
      And the installed file ".agents/cli.json" sets "ref" to "v9.9.9"

    Scenario: Init touches neither package.json nor .npmrc
      Given the project has the file "package.json" holding '{\n    "name": "p"\n}\n'
      When I run the install command "init --harness cursor"
      Then the installed file "package.json" holds '{\n    "name": "p"\n}\n'
      And the installed file ".npmrc" is absent

    Scenario: A product with no package.json needs none
      When I run the install command "init"
      Then the installed file ".agents/cli.json" exists
      And the installed file "package.json" is absent

    Scenario: Init reports a devDependency pin and says how to drop it
      Given the project has the file "package.json" holding '{"devDependencies":{"agentic-sdlc":"github:dmitriywind/agentic-sdlc#v0.0.1"}}'
      When I run the install command "init"
      Then a line of the output matches "npm rm agentic-sdlc.*\.agents/cli\.json"
      And the installed file "package.json" holds '{"devDependencies":{"agentic-sdlc":"github:dmitriywind/agentic-sdlc#v0.0.1"}}'

    Scenario: A package.json with no devDependency on the CLI gets no such report
      Given the project has the file "package.json" holding "{}"
      When I run the install command "init"
      Then no line of the output matches "npm rm"

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
      Then the installed file ".agents/cli.json" sets "package" to "github:me/fork"
      And the installed file ".agents/cli.json" sets "ref" to "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      And the output says "kept .agents/cli.json"

    Scenario: --ref moves the pin and keeps the package
      Given I run the install command "init"
      And the project has the file ".agents/cli.json" holding '{"package":"github:me/fork","ref":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
      When I run the install command "init --ref v1.2.3"
      Then the installed file ".agents/cli.json" sets "package" to "github:me/fork"
      And the installed file ".agents/cli.json" sets "ref" to "v1.2.3"

    Scenario: --ref takes a commit sha
      Given I run the install command "init"
      When I run the install command "init --ref bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      Then the installed file ".agents/cli.json" sets "ref" to "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

    Scenario: --force follows the package over a sha the project set
      Given I run the install command "init"
      And the project has the file ".agents/cli.json" holding '{"package":"github:dmitriywind/agentic-sdlc","ref":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'
      When I run the install command "init --force"
      Then the installed file ".agents/cli.json" sets "ref" to "v9.9.9"

    Scenario: A sha that init wrote for --ref is not a hand edit, so the next plain init moves it
      Given I run the install command "init --ref bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      When I run the install command "init"
      Then the installed file ".agents/cli.json" sets "ref" to "v9.9.9"

  Rule: The launcher installs the pinned ref once and runs it

    Background:
      Given a project with the launcher and the pin "github:acme/tool" at "v1.2.3"
      And an npm that lays out a CLI printing its arguments

    Scenario: The launcher runs the CLI with its arguments
      When I run the launcher with "board list --status Ready"
      Then the output says '["board","list","--status","Ready"]'

    Scenario: The launcher installs the pinned ref beside its final folder, without scripts
      When I run the launcher with "board list"
      Then npm call 1 installed "github:acme/tool" at "v1.2.3" beside the final folder, without scripts
      And the installed file ".agents/.cli/v1.2.3/node_modules/agentic-sdlc/dist/bin.js" exists

    Scenario: The second call runs the same install
      Given I run the launcher with "board list"
      When I run the launcher with "gate linkage"
      Then the output says '["gate","linkage"]'
      And npm ran 1 times

    Scenario: No temp folder is left after an install
      When I run the launcher with "board list"
      Then the installed folder ".agents/.cli" holds exactly "v1.2.3"

    Scenario: A new ref installs again, beside the old one
      Given I run the launcher with "board list"
      And the pin is changed to "github:acme/tool" at "dddddddddddddddddddddddddddddddddddddddd"
      When I run the launcher with "doctor"
      Then npm ran 2 times
      And the installed folder ".agents/.cli" holds exactly "v1.2.3, dddddddddddddddddddddddddddddddddddddddd"

    Scenario: A ref that could leave the folder is refused before npm runs
      Given the pin is changed to "github:acme/tool" at "../x"
      When I run the launcher with "doctor"
      Then the exit code is 1
      And the output says "ref is missing or not a commit sha or version tag"
      And npm ran 0 times

  Rule: The stock files run the CLI through the launcher

    Scenario Outline: No stock workflow, runner or hook file installs or versions the CLI another way
      Then no stock workflow, runner or hook file contains '<text>'

      Examples:
        | text                             |
        | AGENTIC_SDLC_VERSION             |
        | --no-install                     |
        | npx --no agentic-sdlc            |
        | "node_modules/agentic-sdlc"      |
        | npm i -g --ignore-scripts        |

    Scenario: Every CLI call in a workflow goes through the launcher
      Then no stock workflow calls agentic-sdlc gate or vcs except through the launcher

    Scenario Outline: The stock files call the launcher
      Then the stock file "<file>" matches "<pattern>"

      Examples:
        | file                                           | pattern                                       |
        | templates/gates/github/agentic-sdlc-cr.yml     | \.agents/bin/agentic-sdlc gate approval       |
        | templates/gates/hooks/pre-push                 | \.\./bin/agentic-sdlc\x22 gate branch-names      |
        | templates/runner/setup.sh                      | ^\.agents/bin/agentic-sdlc validate           |

    Scenario: A job that holds secrets runs the launcher and cli.json of the trunk
      Then every job of the stock workflow "templates/gates/github/agentic-sdlc-cr.yml" that runs the launcher checks out the base

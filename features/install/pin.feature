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
      When I run the install command "init"
      Then the installed file ".agents/cli.json" sets "package" to "github:dmitriywind/agentic-sdlc"
      And the installed file ".agents/cli.json" sets "ref" to "v9.9.9"
      And the installed file "package.json" holds '{\n    "name": "p"\n}\n'
      And the installed file ".npmrc" is absent

    Scenario: The launcher stays tracked in a project that ignores bin folders
      Given the project has the file ".gitignore" holding "[Bb]in/\n"
      When I run the install command "init"
      Then the installed file ".agents/.gitignore" contains "!bin/"
      And the installed file ".gitignore" holds "[Bb]in/\n"

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

    Scenario: A commit sha that --ref set is kept by a later upgrade
      Given I run the install command "init --ref bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      And the package is at version "9.11.0"
      When I run the install command "init --upgrade"
      Then the installed file ".agents/cli.json" sets "ref" to "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      And the output says "kept .agents/cli.json"

  Rule: The launcher installs the pinned ref once and runs it

    Background:
      Given a project with the launcher and the pin "github:acme/tool" at "v1.2.3"
      And an npm that lays out a CLI printing its arguments

    Scenario: The launcher installs the pinned ref beside its final folder, without scripts, and runs the CLI with its arguments
      When I run the launcher with "board list --status Ready"
      Then the output says '["board","list","--status","Ready"]'
      And npm call 1 installed "github:acme/tool" at "v1.2.3" beside the final folder, without scripts
      And the installed folder ".agents/.cli" holds exactly "v1.2.3"

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

    Scenario: A job that holds secrets runs the launcher and cli.json of the trunk
      Then every job of the stock workflow "templates/gates/github/agentic-sdlc-cr.yml" that runs the launcher checks out the base

# Owner: src/binding.ts (validateBinding, bindingWarnings), src/install.ts (init, validate, doctor). The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@cli:init @cli:validate @cli:doctor
Feature: Install and validate the binding
  As an adopter
  I want to install the factory in my project and check my binding
  So that the gates and skills run with my project values

  # Source: src/install.ts, "init"
  # Proof: test/install.test.ts "init writes skills, binding, gates, pointer; second run is idempotent and keeps edits"
  Scenario: Init writes the skills, the binding, the gates and the pointer
    Given a project with no .agents folder
    When the adopter runs "agentic-sdlc init"
    Then .agents/skills holds the skill pack
    And .agents/binding.yml exists
    And the forge gate files and .agents/hooks/pre-push exist
    And AGENTS.md holds one pointer block to the sdlc skill

  # Source: src/install.ts, "init" (kept files)
  # Proof: test/install.test.ts "init writes skills, binding, gates, pointer; second run is idempotent and keeps edits"
  Scenario: A second init keeps the adopter's edits
    Given the adopter edited .agents/binding.yml
    When the adopter runs "agentic-sdlc init" again
    Then the binding keeps the edit
    And AGENTS.md still holds one pointer block

  # Source: src/install.ts, "syncSkills"
  # Proof: test/install.test.ts "init keeps an edited skill file unless --force, and updates an unedited one"
  Scenario: Init updates an unedited skill and keeps an edited one
    Given the adopter edited one skill file
    And the package holds a new version of another skill
    When the adopter runs "agentic-sdlc init"
    Then the edited skill file is kept
    And the unedited skill file is updated
    And "--force" overwrites the edited file

  # Source: src/install.ts, "init" (vcs and forge checks)
  # Proof: test/install.test.ts "init writes skills, binding, gates, pointer; second run is idempotent and keeps edits"
  Scenario: Init refuses a VCS or a forge it does not support
    When the adopter runs "agentic-sdlc init --vcs hg" or "agentic-sdlc init --forge swarm"
    Then the command exits with code 1

  # Source: src/install.ts, "init" (profile)
  # Proof: test/install.test.ts "init --profile enterprise writes traces and container sandbox; warnings keep validate at 0"
  Scenario: The enterprise profile sets traces and a container sandbox
    When the adopter runs "agentic-sdlc init --profile enterprise"
    Then the binding has "profile: enterprise" and a container sandbox
    And the binding has a traces.uri
    And an unknown profile makes the command exit with code 1

  # Source: src/binding.ts, "validateBinding"
  # Proof: test/binding.test.ts "validateBinding reports each broken rule"
  Scenario: Validate lists each broken rule
    Given a binding with a wrong version, an unknown adapter, a missing status and a change_pattern without <ticket>
    When the adopter runs "agentic-sdlc validate"
    Then each problem prints as a "problem:" line
    And the command exits with code 1

  # Source: src/binding.ts, "validateBinding" (adapter options)
  # Proof: test/binding.test.ts "validateBinding rejects unknown option keys and missing required ones per adapter"
  Scenario: Adapter options are checked per adapter
    Given the board adapter is "jira" and its options lack "project_key" and hold an unknown key
    When the binding is validated
    Then the problems name the missing option
    And the problems name the unknown option

  # Source: src/binding.ts, "validateBinding" (vcs keys)
  # Proof: test/binding.test.ts "validateBinding requires the vcs keys the gates and hook dereference"
  Scenario: The vcs keys that the gates need are required
    Given a binding with no vcs.trunk, vcs.release_prefix or vcs.factory_change_pattern
    When the binding is validated
    Then each missing key is a problem
    And an empty vcs.tag_prefix is valid

  # Source: src/binding.ts, "bindingWarnings"
  # Proof: test/binding.test.ts "bindingWarnings flags profile mismatches without failing validation"
  Scenario: Profile mismatches warn and do not fail
    Given an individual profile with a managed executor
    When the adopter runs "agentic-sdlc validate"
    Then a "warn:" line names the executor
    And the command exits with code 0

  # Source: src/binding.ts, "bindingWarnings" (review_runtime)
  # Proof: test/binding.test.ts "validateBinding requires each executor kind its keys; review_runtime only warns as unused"
  Scenario: forge.review_runtime is an unused key
    Given the binding sets forge.review_runtime
    When the binding is validated
    Then a warning says review-pr always runs in its own runtime

  # Source: src/install.ts, "doctor" and "trunkProtection"
  # Proof: test/install.test.ts "doctor: unpinned required checks warn; non-GitHub gets a reminder"
  Scenario: Doctor warns about required checks that are not pinned
    Given the trunk rules hold a required check with no integration_id
    When the adopter runs "agentic-sdlc doctor"
    Then a warning names that check
    And on a forge other than GitHub doctor prints a reminder to pin each check

  # Source: src/install.ts, "doctor" and "deliveryWorkflow"
  # Proof: test/install.test.ts "doctor: the delivery workflow must name the trunk and release line"
  Scenario: Doctor fails when the delivery workflow does not name the trunk
    Given the delivery workflow push branches do not name vcs.trunk
    When the adopter runs "agentic-sdlc doctor"
    Then doctor prints a "fail delivery workflow" line
    And the command exits with code 1

  # Source: src/binding.ts, "validateBinding" (product.delivery)
  # Proof: test/binding.test.ts "product.delivery: continuous needs no release prefix; release-line needs two environments"
  Scenario: The delivery mode decides which release keys are required
    Given product.delivery is continuous
    Then vcs.release_prefix is not required
    When product.delivery is release-line with one environment
    Then validation fails with "release-line needs two or more environments"

  # Source: src/install.ts, "deliveryWorkflow"
  # Proof: test/install.test.ts "doctor: env.DELIVERY must match product.delivery; continuous needs no release prefix"
  Scenario: doctor checks the delivery workflow's mode
    Given the delivery workflow sets env.DELIVERY
    When doctor runs
    Then it fails when env.DELIVERY differs from product.delivery

  # Source: src/board/github.ts, "items"
  # Proof: test/board-adapters.test.ts "github: a Project shared by two repos yields only the issues of this repo"
  Scenario: Repos can share one GitHub Project
    Given a GitHub Project holds issue 12 of this repo and issue 12 of another repo
    When the board adapter lists the board
    Then it returns only the issue of board.options.repo

  # Source: src/binding.ts, "validateBinding" and "bindingWarnings" (product.evidence)
  # Proof: test/binding.test.ts "product.evidence: known kinds only; evidence without commands.evidence_check warns"
  Scenario: Release evidence needs a command that proves it
    Given product.evidence lists sbom and provenance
    And commands.evidence_check is unset
    When the binding is validated
    Then a warning says no release can show its evidence

  # Source: src/binding.ts, "bindingWarnings" and "validateBinding"
  # Proof: test/binding.test.ts "bindingWarnings: a GitHub heartbeat ticket must be a number; env labels must name an environment; an empty release prefix fails"
  Scenario: Setups that fail at run time are named before the first cycle
    Given a GitHub board with heartbeat.ticket "HEARTBEAT-1"
    And board.env_labels lists "env:qa" while product.environments has no "qa"
    When the binding is validated
    Then a warning names each of them
    And an empty vcs.release_prefix fails validation

  # Source: src/binding.ts, "validateBinding" (owners); src/ports.ts, "ownersFor"
  # Proof: test/binding.test.ts "validateBinding: an owner is a name or { board, forge }"
  Scenario: An owner can have one name on the board and another on the forge
    Given owners.product is { board: "acc-1", forge: "ann" }
    And an owners.bots entry is { board: "acc-3", forge: "bot[bot]" }
    When the binding is validated
    Then it has no problems
    And an owner with only one of board and forge is a problem

  # Source: src/binding.ts, "validateBinding" (heartbeat)
  # Proof: test/binding.test.ts "validateBinding: an empty heartbeat.ticket is a problem"
  Scenario: A binding with no heartbeat ticket fails validation
    Given heartbeat.ticket is empty, as the template writes it
    When the binding is validated
    Then a problem says to create the heartbeat ticket and put its id in heartbeat.ticket

  # Source: src/install.ts, "init" (heartbeat ticket)
  # Proof: test/install.test.ts "init --board local creates the heartbeat ticket off every route and sets heartbeat.ticket"
  Scenario: init on a local board creates the heartbeat ticket
    Given an empty project
    When the adopter runs "agentic-sdlc init --board local"
    Then the local board holds one ticket "Heartbeat" with status Cancelled
    And heartbeat.ticket names that ticket

  # Source: src/install.ts, "implementerToken"
  # Proof: test/install.test.ts "doctor: a classic implementer token with repo scope warns; a fine-grained one is quiet"
  Scenario: doctor warns when the implementer token can post commit statuses
    Given forge.options.token_env names a classic token with scope "repo"
    When the adopter runs "agentic-sdlc doctor"
    Then a warning says to use a fine-grained token with Commit statuses: no access
    And a fine-grained token prints no warning

  # Source: src/install.ts, "selfHostedRunner"
  # Proof: test/install.test.ts "doctor: a self-hosted runner fails on a public repo and warns when CR code and secrets share it"
  Scenario: doctor checks the self-hosted runner setup
    Given the repo variable AGENTIC_RUNS_ON names a self-hosted runner
    When the adopter runs "agentic-sdlc doctor"
    Then on a public repo the runner check fails
    And on a private repo with no separate AGENTIC_RUNS_ON_TRUSTED runner a warning says CR code and the secret jobs share one runner
    And with two separate runners the runner check is ok

  # Source: src/install.ts, "cloudBoard"
  # Proof: test/install.test.ts "doctor: a Claude cloud session with a GitHub board names the runner that can reach Projects"
  Scenario: doctor in a Claude cloud session names a runner that can reach the GitHub board
    Given a binding with board adapter "github"
    And doctor runs in a Claude cloud session
    When the board probe fails
    Then doctor says a cloud session cannot reach GitHub Projects
    And it names GitHub Actions as the runner for the cycle

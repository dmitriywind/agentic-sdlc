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
    Given the forge adapter is "gitlab" and its options lack "base_url" and hold an unknown key
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

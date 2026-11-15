# Owner: src/gates.ts, templates/gates/github/agentic-sdlc-cr.yml, skills/sdlc/references/contract.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:provenance
Feature: Gate provenance (agent commits carry trailers)
  As a factory owner
  I want every agent commit on a CR to name its run and model
  So that I can trace a change back to the run that made it

  # Source: skills/sdlc/references/contract.md, "Provenance"
  # Proof: skill text only
  Scenario: An agent ends each commit with trailers and the CR body lists its run ids
    Given a run whose task text gives a run id
    When the agent commits on a change line
    Then the commit ends with Agent-Run and Agent-Model trailers, and Agent-Skill and Agent-Harness when known
    And the CR body has a Provenance line with the run ids

  # Source: src/gates.ts, "provenance"
  # Proof: test/gates.test.ts "provenance: agent commits with well-formed trailers pass; human and merge commits are listed and ignored"
  Scenario: Agent commits with trailers pass and other commits are only listed
    Given forge.provenance is require
    And a CR with agent commits that carry Agent-Run and Agent-Model
    And a commit by a human and a branch-update merge commit
    When the gate runs
    Then status agent-provenance is success
    And the report counts the agent and human commits

  # Source: src/gates.ts, "provenance"
  # Proof: test/gates.test.ts "provenance: a missing, malformed or body-only trailer fails under require and passes under warn"
  Scenario: A missing or malformed trailer fails under require and passes under warn
    Given an agent commit with no trailer, a malformed one, a repeated one or one outside the last paragraph
    When the gate runs with forge.provenance require
    Then status agent-provenance is failure and the report names each problem
    When the gate runs with forge.provenance warn
    Then the status is success and the report still names each problem

  # Source: src/gates.ts, "provenance"
  # Proof: test/gates.test.ts "provenance: off, or no key, does nothing and posts nothing"
  Scenario: Provenance off does nothing
    Given forge.provenance is off or unset
    When the gate runs
    Then it reads no commits and posts no status

  # Source: src/gates.ts, "provenance"
  # Proof: test/gates.test.ts "provenance: commits the forge cannot list fail closed under require"
  Scenario: Commits that cannot be read fail closed under require
    Given the forge cannot list the CR's commits
    When the gate runs with forge.provenance require
    Then status agent-provenance is failure
    When the gate runs with forge.provenance warn
    Then the status is success and the report says the commits are unreadable

  # Source: src/gates.ts, "trailers"
  # Proof: test/gates.test.ts "provenance: trailers are the key: value lines of the last paragraph only"
  Scenario: Only the last paragraph of the message holds trailers
    Given a commit message with an Agent-Run line in its body
    When the gate reads its trailers
    Then the body line does not count

  # Source: templates/gates/github/agentic-sdlc-cr.yml, job agent-provenance
  # Proof: skill text only
  Scenario: The CI job runs no CR code and the queue commit carries the result
    Given a CR event or a merge queue event
    When job agent-provenance runs from the trunk's copy of the workflow
    Then it reads the commits through the forge API and posts the status with the job's token
    And on the queue commit it posts success, as the head was checked

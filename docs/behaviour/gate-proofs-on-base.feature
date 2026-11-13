# Owner: src/gates.ts, skills/sdlc/references/gates.md, docs/forges.md. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@gate:proofs-on-base
Feature: Gate proofs-on-base
  As the factory
  I want each new proof to fail on the merge base
  So that a proof really tests the new change

  # Source: src/gates.ts, "proofsOnBase"; docs/forges.md
  # Proof: test/gates.test.ts "proofs-on-base: each new proof must fail on the merge base; factory CRs pass; unset command fails closed"
  Scenario: Each new proof fails on the merge base
    Given a product CR adds or changes proof files
    And commands.proofs_on_base is set
    When each proof file runs alone against the product code of the merge base
    And each run fails
    Then the status "proofs-on-base" is success
    And the working tree returns to the head

  # Source: src/gates.ts, "proofsOnBase"
  # Proof: test/gates.test.ts "proofs-on-base: each new proof must fail on the merge base; factory CRs pass; unset command fails closed"
  Scenario: A proof that passes on the merge base fails the gate
    Given a new proof file passes on the merge base
    When the gate runs
    Then the status "proofs-on-base" is failure
    And the message names that file

  # Source: src/gates.ts, "proofsOnBase" (fail closed)
  # Proof: test/gates.test.ts "proofs-on-base: each new proof must fail on the merge base; factory CRs pass; unset command fails closed"
  Scenario Outline: The gate fails closed when it cannot run the proofs
    Given a product CR where <case>
    When the gate runs
    Then the status "proofs-on-base" is failure
    And the message says <message>

    Examples:
      | case                              | message                               |
      | commands.proofs_on_base is unset  | commands.proofs_on_base is not set    |
      | the CR has no new or changed proof | no new or changed proof file          |

  # Source: src/gates.ts, "proofRunner"
  # Proof: test/gates.test.ts "proofRunner: only a real non-zero exit is a failing proof; anything else is not a test result"
  Scenario: A broken runner is not a failing proof
    Given the command runner is killed or runs out of buffer
    When the gate runs a proof
    Then the gate throws "proof runner failed"
    And it does not count the run as a failing proof

  # Source: src/gates.ts, "proofsOnBase" (factory CR)
  # Proof: test/gates.test.ts "proofs-on-base: each new proof must fail on the merge base; factory CRs pass; unset command fails closed"
  Scenario: A factory CR has no product proof
    Given a CR changes only files under paths.factory
    When the gate runs
    Then the status "proofs-on-base" is success

  # Source: src/gates.ts, "proofsOnBase" (posted)
  # Proof: test/gates.test.ts "proofs-on-base: each new proof must fail on the merge base; factory CRs pass; unset command fails closed"
  Scenario: The job holds no secrets, so its exit code carries the result
    Given the job cannot post the status
    When the gate runs
    Then the result reports posted as false
    And the exit code is the check

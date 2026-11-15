# Source: src/gates.ts "proofsOnBase", "proofFiles", "proofRunner"; docs/forges.md
@gate:proofs-on-base
Feature: Gate proofs-on-base
  Each new proof of a product CR must fail on the merge base, so that a proof really tests the new change.
  The gate keeps the product code of the merge base, runs each new or changed proof file alone with commands.proofs_on_base,
  and posts the status "proofs-on-base" on the head.

  Rule: Each new proof fails on the merge base

    Background:
      Given the binding sets "commands.proofs_on_base" to "npx test {files}"
      And these CRs are on the forge:
        | cr | changes                                      |
        | 1  | src/a.ts, test/a.test.ts, test/b.test.ts     |

    Scenario: A proof that passes on the merge base fails the gate and is named
      Given the proofs "b.test" pass on the merge base
      When the proofs-on-base gate runs for the CR "1"
      Then the gate fails with "test/b.test.ts"
      And the gate result "passedOnBase" lists "test/b.test.ts"
      And the status "proofs-on-base" is "failure"

    Scenario: A deleted proof file is not run on the merge base
      Given the CR "1" has the diff:
        """
        diff --git a/src/a.ts b/src/a.ts
        --- a/src/a.ts
        diff --git a/test/a.test.ts b/test/a.test.ts
        new file mode 100644
        diff --git a/test/old.test.ts b/test/old.test.ts
        deleted file mode 100644
        diff --git a/src/b.spec.ts b/src/b.spec.ts
        """
      When the proofs-on-base gate runs for the CR "1"
      Then the gate result "files" lists "test/a.test.ts, src/b.spec.ts"

  Rule: The gate fails closed when it cannot run the proofs

  Rule: A CR with no product proof to make passes

    Scenario: A product CR that also changes code still needs a proof file
      Given the binding sets "commands.proofs_on_base" to "npx test {files}"
      And the binding sets "paths.no_proof" to the list "docs/**, **/*.md"
      And these CRs are on the forge:
        | cr | changes             |
        | 1  | docs/a.md, src/a.ts |
      When the proofs-on-base gate runs for the CR "1"
      Then the gate fails with "no new or changed proof"

  Rule: The job holds no secrets, so its exit code carries the result

  Rule: Only a real non-zero exit is a failing proof

    Scenario Outline: The proof runner tells a failing proof from a broken runner
      When the proof runner runs a command that "<command>"
      Then the proof runner answers "<answer>"

      Examples:
        | command                     | answer            |
        | exits 0                     | passing           |

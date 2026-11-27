# Source: src/gates.ts "provenance", "trailers"; src/forge/util.ts "parseArgs"; skills/sdlc/references/contract.md "Provenance"
@gate:provenance
Feature: Gate provenance
  Every agent commit on a CR names its run and model in trailers, so that a change traces back to the run that made it.
  The gate reads the commits through the forge API, runs no CR code, and posts the status "agent-provenance" on the head.
  forge.provenance is off (default), warn (report, still succeed) or require (fail on any agent commit without the trailers).

  Background:
    Given the binding sets "owners.bots" to the list "bot[bot], Agent"
    And these CRs are on the forge:
      | cr | head |
      | 1  | h1   |

  Rule: Agent commits with well-formed trailers pass; other commits are only listed

    Scenario: Agent commits pass, a human commit and a branch-update merge are listed and ignored
      Given the binding sets "forge.provenance" to "require"
      And these commits are on the CR "1":
        | sha | author | committer | parents | message                                                                                           |
        | a   | bot[bot] |         | 1       | fix: x\n\nAgent-Run: 12-build-r1\nAgent-Model: claude-sonnet-5-5\nCo-Authored-By: Claude <noreply@anthropic.com> |
        | b   | alice  |           | 1       | fix: y                                                                                            |
        | c   | AGENT  |           | 1       | fix: z\n\nAgent-Run: 12-build-r2\nAgent-Model: claude-sonnet-5-5                                  |
        | d   | bot[bot] | web-flow | 2       | Merge branch 'main' into 12/x                                                                     |
        | e   | alice  |           | 2       | Merge branch 'main' into 12/x                                                                     |
      When the provenance gate runs for the CR "1"
      Then the gate passes
      And the commits are classed as "agent, human, agent, merge, human"
      And the gate result "agentCommits" is "2"
      And the gate result "humanCommits" is "2"
      And the commit "a" names the run "12-build-r1" and the model "claude-sonnet-5-5"
      And the report names no problem
      And these statuses were posted:
        | sha | context          | state   |
        | h1  | agent-provenance | success |
      And the status is posted as "ci"

  Rule: A missing or malformed trailer fails under require and passes under warn

    Background:
      Given these commits are on the CR "1":
        | sha | author   | message                                                                       |
        | a   | bot[bot] | fix: no trailers                                                              |
        | b   | bot[bot] | fix: body\n\nAgent-Run: r1\nAgent-Model: m1\n\nmore text after                |
        | c   | bot[bot] | fix: bad\n\nAgent-Run: has spaces!\nAgent-Model: m1                           |
        | d   | bot[bot] | fix: two\n\nAgent-Run: r1\nAgent-Run: r2\nAgent-Model: m1                     |

    Scenario: Under require the gate fails and names each problem
      Given the binding sets "forge.provenance" to "require"
      When the provenance gate runs for the CR "1"
      Then the gate fails with "aaaaaaaaaaaa: Agent-Run trailer is missing"
      And the gate fails with "cccccccccccc: Agent-Run trailer is malformed"
      And the report names 6 problems
      And the gate result "state" is "failure"
      And the status "agent-provenance" is "failure"

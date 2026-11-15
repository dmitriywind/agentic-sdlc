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

    Scenario: A merge commit by anyone but the forge web identity is checked like a commit of its author
      Given the binding sets "forge.provenance" to "require"
      And these commits are on the CR "1":
        | sha | author   | committer | parents | message                       |
        | a   | bot[bot] |           | 2       | Merge branch 'main' into 12/x |
        | b   | bot[bot] | alice     | 2       | Merge x                       |
        | c   | alice    |           | 2       | Merge y                       |
      When the provenance gate runs for the CR "1"
      Then the gate fails with "aaaaaaaaaaaa: Agent-Run trailer is missing"
      And the commits are classed as "agent, agent, human"

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

    Scenario: Under warn the gate succeeds and the report still names each problem
      Given the binding sets "forge.provenance" to "warn"
      When the provenance gate runs for the CR "1"
      Then the gate result "state" is "success"
      And the gate result "ok" is "false"
      And the report names 6 problems
      And the status "agent-provenance" is "success"

  Rule: Commits the forge cannot list fail closed under require

    Scenario: Under require unreadable commits are a failure
      Given the binding sets "forge.provenance" to "require"
      And the forge cannot list the commits of the CR "1"
      When the provenance gate runs for the CR "1"
      Then the gate fails with "commits unreadable: forge: CR c has 250"
      And the status "agent-provenance" is "failure"

    Scenario: Under warn unreadable commits are reported and the status succeeds
      Given the binding sets "forge.provenance" to "warn"
      And the forge cannot list the commits of the CR "1"
      When the provenance gate runs for the CR "1"
      Then the gate result "state" is "success"
      And the report names the problem "unreadable"

  Rule: Provenance off does nothing

    Scenario Outline: With forge.provenance <setting> the gate reads no commits and posts no status
      Given the binding <setting>
      And the forge fails if the commits of the CR "1" are read
      When the provenance gate runs for the CR "1"
      Then the gate skips with "off"
      And no status is posted

      Examples:
        | setting                           |
        | sets "forge.provenance" to "off"  |
        | has no "forge.provenance"         |

  Rule: Only the last paragraph of the message holds trailers

    Scenario: The subject alone holds none
      When the trailers are read from the message:
        """
        subject only
        """
      Then no trailer is read

    Scenario: The key: value lines of the last paragraph are the trailers
      When the trailers are read from the message:
        """
        s

        Agent-Run: r1 
        not a trailer
        Co-Authored-By: A <a@b>
        """
      Then the trailer "agent-run" is "r1"
      And the trailer "co-authored-by" is "A <a@b>"

    Scenario: A trailer-like line in the body does not count
      When the trailers are read from the message:
        """
        s

        Agent-Run: in body

        footer text
        """
      Then no trailer is read

  Rule: A gate flag takes --k=v as well as --k v

    Background:
      Given the binding sets "forge.adapter" to "github"
      And the binding sets "forge.options.repo" to "o/r"
      And the binding sets "vcs.adapter" to "git"

    Scenario: --cr=1 is the same as --cr 1
      When I run "gate provenance --cr=1"
      Then the exit code is 0
      And the JSON result "cr" is "1"

    Scenario: --cr 1 gives the same result
      When I run "gate provenance --cr 1"
      Then the exit code is 0
      And the JSON result "cr" is "1"

    Scenario: A flag with no value is a usage error
      When I run "gate provenance --cr"
      Then the exit code is 2
      And the output says "--cr needs a value"

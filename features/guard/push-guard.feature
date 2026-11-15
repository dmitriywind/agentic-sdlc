# Source: hooks/guard.mjs, hooks/hooks.json, templates/gates/hooks/pre-push
@cli:guard
Feature: Push guard
  A hook runs before each tool call of an agent. It blocks pushes to the trunk and approvals by an agent,
  so that every change reaches the trunk through a CR and a review. The hook exits 2 to block a call and
  0 to allow it. The trunk named in the binding of the checkout decides what a push to the trunk is.

  Background:
    Given a checkout "work" on the branch "feat" of a project whose trunk is "main"
    And the agent works in "work"

  Rule: A push that reaches the trunk is blocked

    Scenario Outline: A push to the trunk or to many branches is blocked, and the agent is told why
      When the agent runs "<command>"
      Then the command is blocked
      And the agent is told "<told>"

      Examples:
        | command                   | told                                                 |
        | git push origin HEAD:main | push to the trunk 'main' is not allowed: open a CR.  |
        | git -C . push origin main | push to the trunk 'main' is not allowed: open a CR.  |
        | git push --all origin     | push your change line by name                        |
        | git push origin {feat,main} | push your change line by name                      |

    Scenario Outline: A push is read in the checkout of the trunk or of a change line
      Given a checkout "on-trunk" on the branch "main" of a project whose trunk is "main"
      And the agent works in "<where>"
      When the agent runs "<command>"
      Then the command is <verdict>

      Examples:
        | where    | command              | verdict |
        | work     | git push origin feat | allowed |
        | work     | git push             | allowed |
        | on-trunk | git push             | blocked |
        | on-trunk | git push origin feat | allowed |

    Scenario: A push from a checkout of the trunk tells the agent to start a change line
      Given a checkout "on-trunk" on the branch "main" of a project whose trunk is "main"
      And the agent works in "on-trunk"
      When the agent runs "git push"
      Then the agent is told "start a change line and open a CR."

  Rule: The trunk is the one the binding names

    Scenario: The binding is found from a subdirectory of the project
      Given a checkout "other" on the branch "feat" of a project whose trunk is "master"
      And the agent works in "other/sub"
      When the agent runs "git push origin master"
      Then the command is blocked

    Scenario Outline: Without a binding, main and master are both trunks
      Given a checkout "bare" on the branch "feat" of a project whose trunk is "master"
      And the checkout "bare" has no binding file
      And the agent works in "bare"
      When the agent runs "<command>"
      Then the command is <verdict>

      Examples:
        | command                   | verdict |
        | git push origin main      | blocked |
        | git push origin feature-x | allowed |

  Rule: A push is read in the checkout where it runs

    Background:
      Given a checkout "trunk-co" on the branch "main" of a project whose trunk is "main"
      And a checkout "feat-co" on the branch "feat" of a project whose trunk is "main"
      And the agent works in "work/sub"

    Scenario Outline: A push from another checkout is read there, and a cd that cannot be followed blocks it
      When the agent runs "<command>"
      Then the command is <verdict>

      Examples:
        | command                                | verdict |
        | cd {{trunk-co}} && git push            | blocked |
        | git -C {{trunk-co}} push               | blocked |
        | cd {{feat-co}} && git push origin feat | allowed |
        | cd $WT && git push origin feat         | blocked |

  Rule: A push built from a variable, an alias or a substitution is blocked

    Scenario Outline: A push whose words are not literal is blocked
      When the agent runs "<command>"
      Then the command is blocked

      Examples:
        | command                           |
        | B=main; git push origin $B        |
        | git -c alias.p=push p origin main |
        | echo $(git push origin main)      |

  Rule: Only the review runtime approves

    Scenario Outline: forge approve is blocked without the review role however it is launched, and allowed with it
      Given the environment sets "AGENTIC_SDLC_ROLE" to "<role>"
      When the agent runs "<command>"
      Then the command is <verdict>

      Examples:
        | role   | command                                  | verdict |
        |        | agentic-sdlc forge approve 3             | blocked |
        |        | agentic-sdlc --root=. forge approve 1    | blocked |
        |        | .agents/bin/agentic-sdlc forge approve 3 | blocked |
        |        | npx agentic-sdlc@latest forge approve 1  | blocked |
        |        | a=approve; agentic-sdlc forge $a 1       | blocked |
        | review | agentic-sdlc forge approve 3             | allowed |

  Rule: Only the review runtime posts a status, unless the runner opts in

    Scenario Outline: forge status and the MCP tools follow the role and the opt-in
      Given the environment sets "<variable>" to "<value>"
      When the agent <call>
      Then the command is <verdict>

      Examples:
        | variable                  | value  | call                                                                       | verdict |
        | AGENTIC_SDLC_ROLE         |        | runs "agentic-sdlc forge status abc --state success"                       | blocked |
        | AGENTIC_SDLC_ROLE         | review | runs "agentic-sdlc forge status abc --state success"                       | allowed |
        | AGENTIC_SDLC_ALLOW_STATUS | 1      | runs "agentic-sdlc forge status abc --state success"                       | allowed |
        | AGENTIC_SDLC_ALLOW_STATUS | 1      | calls the MCP tool "mcp__plugin_agentic-sdlc_agentic-sdlc__forge_status"    | allowed |
        | AGENTIC_SDLC_ROLE         |        | calls the MCP tool "mcp__agentic-sdlc__forge_status"                        | blocked |
        | AGENTIC_SDLC_ALLOW_STATUS | 1      | runs "agentic-sdlc forge approve 3"                                         | blocked |
        | AGENTIC_SDLC_ALLOW_STATUS | 1      | calls the MCP tool "mcp__agentic-sdlc__forge_approve"                       | blocked |

    Scenario: The hook entry for MCP tools covers the forge tools of the plugin and of a manual install
      Then the hook entry that matches MCP tools matches "mcp__plugin_agentic-sdlc_agentic-sdlc__forge_status"
      And the hook entry that matches MCP tools matches "mcp__agentic-sdlc__forge_approve"

  Rule: The sdlc-reviewer agent runs only the agentic-sdlc CLI in Bash

    Background:
      Given the agent is the subagent "agentic-sdlc:sdlc-reviewer"

    Scenario Outline: The reviewer may run a read-only CLI verb and nothing else
      When the agent runs "<command>"
      Then the command is <verdict>

      Examples:
        | command                                    | verdict |
        | agentic-sdlc forge view 3 2>/dev/null      | allowed |
        | npx --no agentic-sdlc forge diff 1         | allowed |
        | npm test                                   | blocked |
        | agentic-sdlc forge view 3 && npm test      | blocked |
        | x=agentic-sdlc; $x forge view 3            | blocked |
        | ../.agents/bin/agentic-sdlc forge view 3   | blocked |
        | agentic-sdlc forge approve 3               | blocked |

  Rule: Other agents and ordinary commands are not restricted

    Scenario Outline: An ordinary command passes
      Given the agent is the subagent "<agent>"
      When the agent runs "<command>"
      Then the command is allowed

      Examples:
        | agent                  | command                                              |
        | agentic-sdlc:sdlc-fast | npm test                                             |
        | main                   | git commit -m \"wip # push\" && git push origin feat |

  Rule: The guard fails closed, except on input that is not a tool call

    Scenario: Input that is not JSON is let through, and a hook that cannot run blocks the tool call
      When the hook receives the input "not json {"
      Then the command is allowed
      And every hook entry blocks the call when the hook fails

  Rule: The pre-push hook checks the branch names being pushed

    Background:
      Given the checkout "work" has the binding file:
        """
        vcs:
          trunk: main
          release_prefix: release/
          change_pattern: "<ticket>-<name>"
          factory_change_pattern: "factory/<name>"
        """

    Scenario Outline: A branch is pushed only if it follows a binding pattern
      When git hands the pre-push hook of the checkout "work" these lines:
        """
        <line>
        """
      Then the exit code is <code>

      Examples:
        | line                                             | code |
        | refs/heads/12-fix-x SHA refs/heads/12-fix-x ZERO | 0    |
        | refs/heads/wip SHA refs/heads/wip ZERO           | 1    |
        | (delete) ZERO refs/heads/wip SHA                 | 0    |

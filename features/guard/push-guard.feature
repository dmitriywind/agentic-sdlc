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

    Scenario: A push to the trunk is blocked, and the agent is told to open a CR
      When the agent runs "git push origin main"
      Then the command is blocked
      And the agent is told "push to the trunk 'main' is not allowed: open a CR."

    Scenario Outline: A push to the trunk is blocked however it is spelled
      When the agent runs "<command>"
      Then the command is blocked

      Examples:
        | command                           |
        | git push origin main              |
        | git push origin HEAD:main         |
        | git push --repo=origin main       |
        | git push origin feat:\"main\"     |
        | git push origin feat:main>/dev/null |
        | git push origin feat:main#        |
        | git -C . push origin main         |

    Scenario Outline: A push that can reach many branches is blocked
      When the agent runs "<command>"
      Then the command is blocked
      And the agent is told "push your change line by name"

      Examples:
        | command                                      |
        | git push --all origin                        |
        | git push --mirror origin                     |
        | git push origin 'refs/heads/*:refs/heads/*'  |
        | git push 'refs/heads/*:refs/heads/*'         |
        | git push origin {feat,main}                  |

    Scenario Outline: A push of a named change line is allowed
      When the agent runs "<command>"
      Then the command is allowed

      Examples:
        | command                |
        | git push origin feat   |
        | git push -u origin feat |
        | git push               |
        | git push origin feat/x |

    Scenario Outline: A push from a checkout of the trunk without a change line is blocked
      Given a checkout "on-trunk" on the branch "main" of a project whose trunk is "main"
      And the agent works in "on-trunk"
      When the agent runs "<command>"
      Then the command is <verdict>

      Examples:
        | command               | verdict |
        | git push              | blocked |
        | git push origin       | blocked |
        | git push -u origin    | blocked |
        | git push origin feat  | allowed |

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
        | command                  | verdict |
        | git push origin master   | blocked |
        | git push origin main     | blocked |
        | git push origin feature-x | allowed |

  Rule: A push is read in the checkout where it runs

    Background:
      Given a checkout "trunk-co" on the branch "main" of a project whose trunk is "main"
      And a checkout "feat-co" on the branch "feat" of a project whose trunk is "main"
      And the agent works in "work/sub"

    Scenario Outline: A push from another checkout that is on the trunk is blocked
      When the agent runs "<command>"
      Then the command is blocked

      Examples:
        | command                                          |
        | cd {{trunk-co}} && git push                      |
        | cd {{trunk-co}}; git push origin                 |
        | git -C {{trunk-co}} push                         |
        | git --git-dir={{trunk-co}}/.git push             |
        | pushd {{trunk-co}} && git push                   |

    Scenario: A cd to a checkout on a change line is fine
      Given the agent works in "trunk-co"
      When the agent runs "cd {{feat-co}} && git push origin feat"
      Then the command is allowed

    Scenario Outline: A cd that cannot be followed blocks the push
      When the agent runs "<command>"
      Then the command is blocked

      Examples:
        | command                                    |
        | cd $WT && git push origin feat             |
        | cd \"$(pwd)/x\" && git push origin feat    |
        | cd nowhere-here && git push origin feat    |
        | git -C $WT push origin feat                |

    Scenario: A cd that cannot be followed tells the agent to push without cd
      When the agent runs "cd $WT && git push"
      Then the agent is told "without cd"

  Rule: A push built from a variable, an alias or a substitution is blocked

    Scenario Outline: A push whose words are not literal is blocked
      When the agent runs "<command>"
      Then the command is blocked

      Examples:
        | command                                   |
        | B=main; git push origin $B                |
        | g=git; $g push origin main                |
        | git -c alias.p=push p origin main         |
        | git push origin feat#1:main               |
        | git push origin $(echo main)              |
        | git push origin `echo main`               |
        | git push \"$REMOTE\" feat                 |
        | X=push; git $X origin main                |
        | eval 'g=git; $g push origin main'         |
        | bash -c \"$CMD push origin main\"         |

    Scenario Outline: A push inside a command substitution is scanned too
      When the agent runs "<command>"
      Then the command is blocked

      Examples:
        | command                         |
        | echo $(git push origin main)    |
        | echo `git push origin main`     |

  Rule: Only the review runtime approves

    Scenario Outline: Without the review role, forge approve is blocked however it is launched
      When the agent runs "<command>"
      Then the command is blocked
      And the agent is told "forge approve is for the review runtime only"

      Examples:
        | command                                                     |
        | agentic-sdlc forge approve 3                                |
        | .agents/bin/agentic-sdlc forge approve 3                    |
        | ./.agents/bin/agentic-sdlc forge approve 3                  |
        | node dist/bin.js forge approve 3                            |
        | agentic-sdlc.cmd forge approve 3                            |
        | npx agentic-sdlc@latest forge approve 1                     |
        | a=approve; agentic-sdlc forge $a 1                          |
        | node node_modules/agentic-sdlc/dist/bin.js forge approve 1  |
        | node node_modules/agentic-sdlc/dist/cli.js forge approve 1  |
        | agentic-sdlc forge `echo approve` 1                         |
        | echo $(agentic-sdlc forge approve 1)                        |

    Scenario Outline: With the review role, forge approve is allowed
      Given the environment sets "AGENTIC_SDLC_ROLE" to "review"
      When the agent runs "<command>"
      Then the command is allowed

      Examples:
        | command                                  |
        | agentic-sdlc forge approve 3             |
        | npx agentic-sdlc@latest forge approve 1  |
        | .agents/bin/agentic-sdlc forge approve 3 |

    Scenario: The MCP tool forge_approve is blocked without the review role
      When the agent calls the MCP tool "mcp__agentic-sdlc__forge_approve"
      Then the command is blocked

    Scenario: The runner's opt-in to forge status does not open forge approve
      Given the environment sets "AGENTIC_SDLC_ALLOW_STATUS" to "1"
      When the agent runs "agentic-sdlc forge approve 3"
      Then the command is blocked

    Scenario: The runner's opt-in to forge status does not open the MCP tool forge_approve
      Given the environment sets "AGENTIC_SDLC_ALLOW_STATUS" to "1"
      When the agent calls the MCP tool "mcp__agentic-sdlc__forge_approve"
      Then the command is blocked

  Rule: Only the review runtime posts a status, unless the runner opts in

    Scenario Outline: Without the review role or the opt-in, forge status is blocked
      When the agent runs "<command>"
      Then the command is blocked
      And the agent is told "forge status is for the review runtime only"

      Examples:
        | command                                                              |
        | agentic-sdlc forge status abc --context review --state success       |
        | npx --no agentic-sdlc forge status abc --context review --state success |
        | echo $(agentic-sdlc forge status abc)                                |
        | .agents/bin/agentic-sdlc forge status abc --context review --state success |

    Scenario Outline: The review role or the runner's opt-in allows forge status
      Given the environment sets "<variable>" to "<value>"
      When the agent runs "agentic-sdlc forge status abc --context review --state success"
      Then the command is allowed

      Examples:
        | variable                  | value  |
        | AGENTIC_SDLC_ROLE         | review |
        | AGENTIC_SDLC_ALLOW_STATUS | 1      |

    Scenario Outline: The MCP tool forge_status follows the same rule
      Given the environment sets "<variable>" to "<value>"
      When the agent calls the MCP tool "<tool>"
      Then the command is <verdict>

      Examples:
        | tool                                                   | variable                  | value  | verdict |
        | mcp__plugin_agentic-sdlc_agentic-sdlc__forge_status    | AGENTIC_SDLC_ROLE         |        | blocked |
        | mcp__plugin_agentic-sdlc_agentic-sdlc__forge_status    | AGENTIC_SDLC_ROLE         | review | allowed |
        | mcp__agentic-sdlc__forge_status                        | AGENTIC_SDLC_ALLOW_STATUS | 1      | allowed |

    Scenario Outline: The hook entry for MCP tools covers the forge tools of the plugin and of a manual install
      Then the hook entry that matches MCP tools matches "<tool>"

      Examples:
        | tool                                                 |
        | mcp__plugin_agentic-sdlc_agentic-sdlc__forge_status  |
        | mcp__agentic-sdlc__forge_approve                     |

  Rule: The sdlc-reviewer agent runs only the agentic-sdlc CLI in Bash

    Background:
      Given the agent is the subagent "agentic-sdlc:sdlc-reviewer"

    Scenario Outline: The reviewer may run a read-only CLI verb
      When the agent runs "<command>"
      Then the command is allowed

      Examples:
        | command                                          |
        | agentic-sdlc forge view 1                        |
        | agentic-sdlc forge view 3 2>/dev/null            |
        | agentic-sdlc forge view 3 > /dev/null 2>&1       |
        | npx --no agentic-sdlc forge diff 1               |
        | npx --no-install agentic-sdlc forge diff 3       |
        | .agents/bin/agentic-sdlc forge diff 1            |
        | ./.agents/bin/agentic-sdlc forge diff 1          |

    Scenario Outline: The reviewer may run nothing else
      When the agent runs "<command>"
      Then the command is blocked

      Examples:
        | command                                            |
        | npm test                                           |
        | cat .env                                           |
        | node script.js                                     |
        | agentic-sdlc forge view 3 && npm test              |
        | agentic-sdlc forge view 3 > out.txt                |
        | echo $(npm test)                                   |
        | x=agentic-sdlc; $x forge view 3                    |
        | cd sub                                             |
        | node ./evil.js agentic-sdlc                        |
        | /tmp/agentic-sdlc forge view 3                     |
        | ../.agents/bin/agentic-sdlc forge view 3           |
        | bin/agentic-sdlc forge view 3                      |
        | npx evil-pkg agentic-sdlc                          |
        | ./agentic-sdlc board list                          |
        | /tmp/x/agentic-sdlc                                |
        | node node_modules/agentic-sdlc/dist/bin.js board get 4 |
        | FOO=1 agentic-sdlc board list                      |
        | agentic-sdlc board list $(id)                      |
        | agentic-sdlc board list `id`                       |
        | agentic-sdlc board list $HOME                      |
        | npx --package=evil agentic-sdlc board list         |
        | agentic-sdlc forge list --checks \| head -5        |

    Scenario: The reviewer cannot approve without the review role
      When the agent runs "agentic-sdlc forge approve 3"
      Then the command is blocked

    Scenario: The reviewer can approve with the review role
      Given the environment sets "AGENTIC_SDLC_ROLE" to "review"
      When the agent runs "agentic-sdlc forge approve 3"
      Then the command is allowed

  Rule: Other agents and ordinary commands are not restricted

    Scenario Outline: An agent that is not the reviewer may run any command
      Given the agent is the subagent "<agent>"
      When the agent runs "npm test"
      Then the command is allowed

      Examples:
        | agent                  |
        | agentic-sdlc:sdlc-fast |
        | sdlc-fast              |

    Scenario Outline: An ordinary command passes
      When the agent runs "<command>"
      Then the command is allowed

      Examples:
        | command                                           |
        | cd sub && npm test                                |
        | git -c user.name=x commit -m \"fix #1\"           |
        | git commit -m \"wip # push\" && git push origin feat |
        | agentic-sdlc forge view 1                         |
        | echo $HOME && ls \"$PWD\"                         |
        | for f in a b; do echo $f; done                    |
        | v=$(git rev-parse HEAD); echo $v                  |

  Rule: The guard fails closed, except on input that is not a tool call

    Scenario: Input that is not JSON is let through
      When the hook receives the input "not json {"
      Then the command is allowed

    Scenario: A hook that cannot run blocks the tool call
      Then every hook entry blocks the call when the hook fails

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

    Scenario: A branch that follows the change pattern is pushed
      When git hands the pre-push hook of the checkout "work" these lines:
        """
        refs/heads/12-fix-x SHA refs/heads/12-fix-x ZERO
        """
      Then the exit code is 0

    Scenario: A branch outside the binding patterns is refused
      When git hands the pre-push hook of the checkout "work" these lines:
        """
        refs/heads/wip SHA refs/heads/wip ZERO
        """
      Then the exit code is 1
      And the output says "branch name not allowed: wip"

    Scenario: A deleted branch is not checked
      When git hands the pre-push hook of the checkout "work" these lines:
        """
        (delete) ZERO refs/heads/wip SHA
        """
      Then the exit code is 0

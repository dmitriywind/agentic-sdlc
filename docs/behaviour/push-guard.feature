# Owner: hooks/guard.mjs, templates/gates/hooks/pre-push. The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@cli:guard
Feature: Push guard
  As the factory
  I want a hook to block pushes to the trunk and approvals by agents
  So that every change reaches the trunk through a CR and a review

  # Source: hooks/guard.mjs, header comment and trunk check
  # Proof: test/guard.test.ts "blocks pushes that reach the trunk"
  Scenario: A push to the trunk is blocked
    Given the agent runs "git push origin main" and main is the trunk
    When the guard hook reads the command
    Then the hook exits with code 2
    And the agent sees "push to the trunk 'main' is not allowed: open a CR."

  # Source: hooks/guard.mjs, "--all, --mirror, --branches" and glob refspec checks
  # Proof: test/guard.test.ts "blocks pushes that reach the trunk"
  Scenario Outline: A push that can reach many branches is blocked
    Given the agent runs "<command>"
    When the guard hook reads the command
    Then the hook exits with code 2
    And the agent sees a message to push the change line by name

    Examples:
      | command                                   |
      | git push --all origin                     |
      | git push --mirror origin                  |
      | git push origin 'refs/heads/*:refs/heads/*' |

  # Source: hooks/guard.mjs, trunk check
  # Proof: test/guard.test.ts "allows pushing a named change line"
  Scenario: A push of a named change line is allowed
    Given the agent runs "git push -u origin feat"
    When the guard hook reads the command
    Then the hook exits with code 0

  # Source: hooks/guard.mjs, "the binding lives at the project root"
  # Proof: test/guard.test.ts "finds the binding from a subdirectory"
  Scenario: The trunk name comes from the binding
    Given .agents/binding.yml sets vcs.trunk to "master"
    And the agent works in a subdirectory of the project
    When the agent runs "git push origin master"
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, "trunks = main, master"
  # Proof: test/guard.test.ts "without a binding, main and master are both trunks"
  Scenario: Without a binding, main and master are both trunks
    Given the project has no .agents/binding.yml
    When the agent runs "git push origin main" or "git push origin master"
    Then the hook exits with code 2
    And "git push origin feature-x" exits with code 0

  # Source: hooks/guard.mjs, "forge approve" checks
  # Proof: test/guard.test.ts "forge approve is for the review role only"
  Scenario: Only the review runtime approves
    Given AGENTIC_SDLC_ROLE is not "review"
    When the agent runs "agentic-sdlc forge approve 3"
    Then the hook exits with code 2
    And the agent sees that forge approve is for the review runtime only
    And the same command exits with code 0 when AGENTIC_SDLC_ROLE is "review"

  # Source: hooks/guard.mjs, "forge_approve" tool check
  # Proof: test/install.test.ts "plugin guard hook blocks trunk pushes and forge approve outside the review role"
  Scenario: The MCP approve tool is blocked outside the review role
    Given AGENTIC_SDLC_ROLE is not "review"
    When the agent calls the MCP tool "forge_approve"
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, command split and token clean-up
  # Proof: test/guard.test.ts "sees through command substitution"
  Scenario: A wrapped command is scanned too
    Given the agent runs "echo $(git push origin main)"
    When the guard hook reads the command
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, "git global options"
  # Proof: test/install.test.ts "plugin guard hook blocks trunk pushes and forge approve outside the review role"
  Scenario: Git global options do not hide a push
    Given the agent runs "git -C . push origin trunk" and trunk is the trunk
    When the guard hook reads the command
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, "cd", "-C", "--git-dir" and "--work-tree" handling
  # Proof: test/guard.test.ts "a cd to another checkout is followed, or the push is refused"
  Scenario: A push in another checkout is read from that checkout
    Given the agent runs "cd ../repo-main && git push" and that checkout is on the trunk
    When the guard hook reads the command
    Then the hook exits with code 2
    And a cd to a path that is not a literal, existing directory before a push also exits with code 2
    And the agent sees a message to run the push from the change worktree without cd

  # Source: hooks/guard.mjs, "shell expansion" and "alias" checks
  # Proof: test/guard.test.ts "indirection in a push is blocked"
  Scenario: A push built from a variable, an alias or a substitution is blocked
    Given the agent runs "B=main; git push origin $B" or "git -c alias.p=push p origin main"
    When the guard hook reads the command
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, "CLI" match and verb check
  # Proof: test/guard.test.ts "forge approve through another launcher or a variable is blocked"
  Scenario: Another launcher or a variable does not hide forge approve
    Given AGENTIC_SDLC_ROLE is not "review"
    When the agent runs "npx agentic-sdlc@latest forge approve 1" or "agentic-sdlc forge $a 1"
    Then the hook exits with code 2

  # Source: hooks/guard.mjs, fail-closed checks
  # Proof: test/guard.test.ts "ordinary commands still pass"
  Scenario: Ordinary commands still pass
    When the agent runs "git push", "cd sub && npm test" or "agentic-sdlc forge view 1"
    Then the hook exits with code 0

  # Source: hooks/hooks.json, "onFailure"
  # Proof: test/guard.test.ts "both guard hook entries block when the hook fails"
  Scenario: A guard that cannot run blocks the call
    Given the guard hook times out or fails to start
    Then Claude Code blocks the tool call because the hook entries set "onFailure" to "block"

  # Source: hooks/guard.mjs, trunk check (no refspec)
  # Proof: test/guard.test.ts "a push from a checkout of the trunk with at most one argument is blocked"
  Scenario: A push from a checkout of the trunk is blocked
    Given the current branch is the trunk
    When the agent runs "git push" with at most one argument
    Then the hook exits with code 2
    And the agent sees a message to start a change line and open a CR

  # Source: hooks/guard.mjs, input parse
  # Proof: test/guard.test.ts "input that is not JSON is let through"
  Scenario: Input that is not JSON is let through
    Given the hook receives input that is not valid JSON
    When the hook starts
    Then the hook exits with code 0

  # Source: templates/gates/hooks/pre-push
  # Proof: test/guard.test.ts "pre-push: branch-names --stdin-prepush checks pushed branches and skips deletes"
  Scenario: The pre-push hook runs the branch-names gate
    Given the project enabled the hook with "git config core.hooksPath .agents/hooks"
    When a developer pushes a branch
    Then git runs "agentic-sdlc gate branch-names --stdin-prepush"
    And a branch outside the binding patterns is refused

  # Source: src/vcs/git.ts, "push"
  # Proof: test/install.test.ts "vcs push refuses the trunk and a detached HEAD"
  Scenario: The vcs push command refuses the trunk and a detached HEAD
    Given the checkout is on the trunk, or on a detached HEAD
    When a skill runs "agentic-sdlc vcs push"
    Then the command fails and names the trunk or the detached HEAD
    And a push from a change line succeeds

  # Source: src/vcs/git.ts, "start" and "drop"
  # Proof: test/vcs.test.ts "git start and drop refuse a change line name that is an option or leaves .agents/work"
  Scenario: A change line name cannot be an option or a path out of the work folder
    When an agent starts or drops a change line named "--upload-pack=x", "../../x" or "a b"
    Then the vcs port refuses it before it runs git

  # Source: src/vcs/git.ts, "changed", "tag", "cut", "snapshot" and "checkoutTests"
  # Proof: test/vcs.test.ts "git refuses a revision, tag name or path that is an option, and lists non-ASCII paths unquoted"
  Scenario: A revision, tag name or path cannot be a git option, and file names stay unquoted
    When an agent passes "--output=/x" as a revision, tag name or path to a vcs command
    Then the vcs port refuses it before it runs git
    And a changed file named with non-ASCII characters is listed by its real name

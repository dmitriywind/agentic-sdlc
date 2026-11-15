# Owner: src/vcs/git.ts. Real git repositories in a temp folder, driven through the vcs port.
Feature: The git vcs port
  A change line is a worktree under .agents/work on a branch of its own. The port starts it, reports what it
  changed from the trunk, publishes it and removes it, and it refuses any name, revision or path that git
  could read as an option.

  Rule: A change line runs from start to drop

    Background:
      Given a trunk with one commit, pushed to an origin
      And the change line "claude/feature/t-1-x" is started

    Scenario: Changed lists the files the line changed from the trunk
      When the line "claude/feature/t-1-x" commits the file "b.txt" containing "2"
      Then the files the line "claude/feature/t-1-x" changed are "b.txt"
      And the base of the line "claude/feature/t-1-x" is the trunk tip

    Scenario: Cut puts a release branch on the origin at the given commit
      Given the line "claude/feature/t-1-x" commits the file "b.txt" containing "2"
      When the line "claude/feature/t-1-x" cuts the release "2026.1" at its head
      Then the cut ref is "refs/heads/release/2026.1"
      And the origin has "release/2026.1" at the head of the line "claude/feature/t-1-x"

  Rule: Start finds the work that already exists

    Background:
      Given a trunk with one commit, pushed to an origin

    Scenario: A line deleted locally reopens from its branch on the origin
      Given the change line "claude/feature/t-2-x" is started
      And the line "claude/feature/t-2-x" commits the file "b.txt" containing "2"
      And the line "claude/feature/t-2-x" is pushed
      And the line "claude/feature/t-2-x" is deleted locally, worktree and branch
      When the change line "claude/feature/t-2-x" is started again
      Then the line "claude/feature/t-2-x" is at the commit that was pushed
      And the push reported the ref "claude/feature/t-2-x" at its head

    Scenario: A reused workdir fast-forwards to the work on the origin
      Given the change line "claude/feature/t-2-x" is started
      And the line "claude/feature/t-2-x" is pushed
      And another clone pushes a commit to "claude/feature/t-2-x"
      When the change line "claude/feature/t-2-x" is started again
      Then the line "claude/feature/t-2-x" is at the commit the other clone pushed

  Rule: A snapshot is a detached tree that holds no later commit

    Background:
      Given a repository with a commit, and a later commit that adds "later.txt"
      And a snapshot is taken of the first commit

    Scenario: Changed sees edits, adds and deletes in the snapshot
      When the snapshot gets the file "a.txt" containing "2"
      And the snapshot gets the file "new.txt" containing "n"
      And the snapshot loses the file "gone.txt"
      Then the files the snapshot changed are "a.txt, gone.txt, new.txt"

  Rule: A name, revision or path that git could read as an option is refused

    Scenario Outline: A revision, tag name or path cannot be an option
      Given a repository with a commit, and a later commit that adds "later.txt"
      When I try the vcs verb "<verb>" with "<first>" and "<second>"
      Then the call fails saying "not allowed"

      Examples:
        | verb           | first          | second |
        | checkout-tests | HEAD           | -f     |
        | start          | 7-x            |        |

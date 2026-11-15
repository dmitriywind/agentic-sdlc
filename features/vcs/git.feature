# Owner: src/vcs/git.ts. Real git repositories in a temp folder, driven through the vcs port.
Feature: The git vcs port
  A change line is a worktree under .agents/work on a branch of its own. The port starts it, reports what it
  changed from the trunk, publishes it and removes it, and it refuses any name, revision or path that git
  could read as an option.

  Rule: A change line runs from start to drop

    Background:
      Given a trunk with one commit, pushed to an origin
      And the change line "t-1-x" is started

    Scenario: A change line is a worktree under .agents/work on a branch of its own
      Then the line "t-1-x" is a worktree under ".agents/work/t-1-x" on the branch "t-1-x"

    Scenario: Changed lists the files the line changed from the trunk
      When the line "t-1-x" commits the file "b.txt" containing "2"
      Then the files the line "t-1-x" changed are "b.txt"
      And the base of the line "t-1-x" is the trunk tip

    Scenario: Push publishes the branch of the line to the origin
      Given the line "t-1-x" commits the file "b.txt" containing "2"
      When the line "t-1-x" is pushed
      Then the origin has the branch "t-1-x"

    Scenario: Cut puts a release branch on the origin at the given commit
      Given the line "t-1-x" commits the file "b.txt" containing "2"
      When the line "t-1-x" cuts the release "2026.1" at its head
      Then the cut ref is "refs/heads/release/2026.1"
      And the origin has "release/2026.1" at the head of the line "t-1-x"

    Scenario: Tags are created at a commit and listed by prefix
      Given the line "t-1-x" commits the file "b.txt" containing "2"
      When the line "t-1-x" tags its head "v1" and "v2"
      Then the tags with the prefix "v" are "v1, v2", both at the head of the line "t-1-x"

    Scenario: Checkout-tests puts the base tree back and keeps only the named test paths
      Given the line "t-1-x" commits the file "a.txt" containing "changed"
      And the line "t-1-x" commits the file "t/x.test" containing "T"
      And the line "t-1-x" commits the file "new.txt" containing "product code the proof could lean on"
      When the line "t-1-x" checks out the trunk tip keeping the paths "t"
      Then in the index of the line "t-1-x" the file "a.txt" holds "1"
      And in the index of the line "t-1-x" the file "t/x.test" holds "T"
      And the line "t-1-x" has no file "new.txt"

    Scenario: Checkout-tests of HEAD restores the tree
      Given the line "t-1-x" commits the file "t/x.test" containing "T"
      And the line "t-1-x" commits the file "new.txt" containing "n"
      And the line "t-1-x" checks out the trunk tip keeping the paths "t"
      When the line "t-1-x" checks out its head keeping no path
      Then the line "t-1-x" has the file "new.txt"

    Scenario: Drop removes the worktree and the branch
      When the change line "t-1-x" is dropped
      Then the line "t-1-x" has no worktree
      And the project has no branch "t-1-x"

  Rule: Start finds the work that already exists

    Background:
      Given a trunk with one commit, pushed to an origin

    Scenario: A new change line starts from the trunk tip
      When the change line "t-2-x" is started
      Then the line "t-2-x" is at the trunk tip

    Scenario: Starting a line that is already open returns the same workdir
      Given the change line "t-2-x" is started
      When the change line "t-2-x" is started again
      Then both starts returned the same workdir

    Scenario: A line deleted locally reopens from its branch on the origin
      Given the change line "t-2-x" is started
      And the line "t-2-x" commits the file "b.txt" containing "2"
      And the line "t-2-x" is pushed
      And the line "t-2-x" is deleted locally, worktree and branch
      When the change line "t-2-x" is started again
      Then the line "t-2-x" is at the commit that was pushed

    Scenario: A reused workdir fast-forwards to the work on the origin
      Given the change line "t-2-x" is started
      And the line "t-2-x" is pushed
      And another clone pushes a commit to "t-2-x"
      When the change line "t-2-x" is started again
      Then the line "t-2-x" is at the commit the other clone pushed

    Scenario: A reused branch without a workdir fast-forwards to the work on the origin
      Given the change line "t-2-x" is started
      And the line "t-2-x" is pushed
      And another clone pushes a commit to "t-2-x"
      And the worktree of the line "t-2-x" is removed but its branch stays
      When the change line "t-2-x" is started again
      Then the line "t-2-x" is at the commit the other clone pushed

    Scenario: A fetch error that is not a missing ref does not start from the trunk
      Given the origin is moved to a place that does not exist
      When I try to start the change line "t-3-y"
      Then the call fails

  Rule: A snapshot is a detached tree that holds no later commit

    Background:
      Given a repository with a commit, and a later commit that adds "later.txt"
      And a snapshot is taken of the first commit

    Scenario: The snapshot is outside the repository and holds no later commit
      Then the snapshot is outside the repository
      And the snapshot has no file "later.txt"

    Scenario: Changed sees edits, adds and deletes in the snapshot
      When the snapshot gets the file "a.txt" containing "2"
      And the snapshot gets the file "new.txt" containing "n"
      And the snapshot loses the file "gone.txt"
      Then the files the snapshot changed are "a.txt, gone.txt, new.txt"

    Scenario: A file named with non-ASCII characters is listed by its real name
      When the snapshot gets the file "né.txt" containing "n"
      Then the files the snapshot changed are "né.txt"

    Scenario: Drop removes the tree and its worktree entry
      When the snapshot is dropped
      Then the snapshot folder is gone
      And git lists no bench worktree

  Rule: A name, revision or path that git could read as an option is refused

    Scenario Outline: A change line name cannot be an option or leave the work folder
      Given the git vcs port for the project
      When I try to <action> the change line "<name>"
      Then the call fails saying "not allowed"

      Examples:
        | action | name           |
        | start  | --upload-pack=x |
        | start  | ../../x        |
        | start  | a b            |
        | drop   | --upload-pack=x |
        | drop   | ../../x        |
        | drop   | a b            |

    Scenario Outline: A revision, tag name or path cannot be an option
      Given a repository with a commit, and a later commit that adds "later.txt"
      When I try the vcs verb "<verb>" with "<first>" and "<second>"
      Then the call fails saying "not allowed"

      Examples:
        | verb           | first          | second |
        | changed        | --output=pwned |        |
        | tag            | -x             | HEAD   |
        | tag            | v1             | --x    |
        | cut            | --x            | 1      |
        | snapshot       | --x            |        |
        | checkout-tests | --x            |        |
        | checkout-tests | HEAD           | -f     |

    Scenario: An option given as a revision writes no file
      Given a repository with a commit, and a later commit that adds "later.txt"
      When I try the vcs verb "changed" with "--output=pwned" and ""
      Then the project has no file "pwned"

    Scenario: Changed lists a file named with non-ASCII characters by its real name
      Given a repository with a commit, and a later commit that adds "café.txt"
      And the first commit is the trunk on the origin
      When the files changed since the first commit are listed
      Then the files listed are "café.txt"

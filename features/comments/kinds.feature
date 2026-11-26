# Source: src/comments.ts "KINDS", "stamp", "matches", "isMarked", "stampBody", "verdictOf", "parseKind", "parseWritableKind"; src/board/index.ts and src/forge/index.ts "comment", "comments"
@comments
Feature: Comment kinds are one registry of first lines
  A marker is always the first line of a comment. The registry holds the one table of kinds and the exact line each
  carries, in the formats boards already hold. A writer stamps a marker, a reader matches it, and `comment --kind`
  and `comments --kind` on the board and the forge use the same table.

  Rule: Every kind stamps the format boards already hold, and matches its own stamp

    Scenario Outline: A kind with its ref is stamped on the first line
      When the marker of the kind "<kind>" is stamped with the ref "<ref>"
      Then the marker line is "<line>"
      And a comment opening with that line is of that kind, with the ref or without it

      Examples:
        | kind             | ref          | line                                |
        | ask              | scope        | ### Needs human: scope              |

  Rule: A body is stamped once

    Scenario Outline: The marker goes first, and a body that has it is not stamped twice
      When the body "<body>" is stamped as the kind "heartbeat"
      Then the stamped body is "<stamped>"

      Examples:
        | body                         | stamped                      |
        | text                         | <!-- heartbeat -->\ntext     |

  Rule: A kind only one verb writes cannot be written by hand

    Scenario Outline: comment --kind refuses a kind only a verb writes
      Given the board has these tickets:
        | title | status  |
        | T     | Backlog |
      And a file "b.md" with "x"
      When I run "board comment 1 --body-file b.md --kind <kind> --ref x"
      Then the exit code is 2
      And the output says "written only by"

      Examples:
        | kind     |
        | verdict  |
        | scores   |

  Rule: board comment --kind stamps and board comments --kind filters

    Background:
      Given the binding sets "spec_marker" to "spec.md"
      And the board has these tickets:
        | title | status  |
        | T     | Backlog |
      And a file "b.md" with "text"
      And I run "board comment 1 --body-file b.md --kind done --ref k1"
      And I run "board comment 1 --body-file b.md --kind spec"

    Scenario: The comments of a kind and ref
      When I run "board comments 1 --kind done --ref k1"
      Then the printed comments open with "<!-- agentic-sdlc:done k1 -->"

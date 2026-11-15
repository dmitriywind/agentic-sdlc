# Owner: skills/implement-spec/SKILL.md. The skill holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@skill:implement-spec
Feature: Implement a spec
  As the factory
  I want to implement a ticket's spec test first on one change line and open a draft CR
  So that the Product owner gets a small, proven change that review-pr can grade

  # Source: skills/implement-spec/SKILL.md, "Claim" and "Draft CR"
  # Proof: skill text only
  Scenario: A Ready ticket becomes a draft CR
    Given a ticket at Status Ready with a trusted spec
    And the ticket has no needs-human label
    And no one but this run's executor is assigned to the ticket
    When the factory runs implement-spec
    Then the ticket moves to In progress
    And the factory opens one draft CR for one change line
    And the CR body has exactly one line "Closes <id>" for this ticket
    And the ticket shows In review

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: test/board-adapters.test.ts "board move on github, jira and linear refuses when the status differs and writes nothing, else writes the resolved id"
  Scenario: A second run cannot claim the same ticket
    Given a ticket at Status Ready
    And another run has already moved it to In progress
    When the factory runs "board move <id> "In progress" --only-from Ready"
    Then the move is refused
    And the board does not change

  # Source: skills/implement-spec/SKILL.md, intro paragraph
  # Proof: skill text only
  Scenario: A ticket with no trusted spec goes back to shape
    Given a ticket at Status Ready, in either lane
    And no trusted comment starts with the spec marker
    And the ticket body lists criteria
    When the factory runs implement-spec
    Then the ticket moves to Backlog with "--only-from Ready"
    And one comment names the missing spec
    And the factory writes no code

  # Source: skills/implement-spec/SKILL.md, "Test first"
  # Proof: skill text only
  Scenario: Each plan step starts with a failing proof
    Given a spec with a plan of several steps
    When the factory implements a step
    Then it writes one failing proof through the public interface
    And it sees the proof red
    And it keeps the red output for the CR body
    And it makes the proof green
    And it refactors

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: test/forge.test.ts "cli: comments --trusted keeps the owners and bots by forge name, --last counts after the filter, and pages come from gh api"
  Scenario: Rework from CR comments
    Given a ticket at In progress
    And an open CR closes the ticket
    And the CR has a trusted review-pr report with Important findings
    When the factory runs implement-spec
    Then it reads the newest report with "forge comments <n> --last 1 --marker "<!-- review-pr" --trusted"
    And it fixes each Important finding first
    And it opens no second CR

  # Source: skills/implement-spec/SKILL.md, "Branch"
  # Proof: test/vcs.test.ts "git: start resumes an existing change line"
  Scenario: Rework resumes the existing change line
    Given a change line already exists for the ticket
    When the factory runs "vcs start" with the name of the CR's source branch
    Then the existing change line reopens
    And the factory does not start a new line from the trunk tip

  # Source: skills/implement-spec/SKILL.md, "Branch"
  # Proof: test/vcs.test.ts "git start: no remote branch starts from trunk; a reused branch or workdir fast-forwards to the remote"
  Scenario: A new ticket starts from the trunk tip
    Given no change line exists for the ticket
    When the factory runs "vcs start" with a name that matches vcs.change_pattern
    Then the change line starts from the trunk tip
    And the factory works in the workdir that the command returns

  # Source: skills/implement-spec/SKILL.md, "Draft CR"
  # Proof: skill text only
  Scenario: A CR that is already open moves the ticket to In review
    Given a ticket at In progress
    And a CR opened by the factory for the change line is already open
    When the fast check passes and the change line is pushed
    Then the ticket moves to In review
    And the factory opens no second CR

  # Source: skills/implement-spec/SKILL.md, "Claim"
  # Proof: skill text only
  Scenario: A CR a person opened is handed to review, not taken over
    Given a ticket at Ready or In progress
    And an open CR closes the ticket
    And an author outside owners.bots opened the CR
    When implement-spec claims the ticket
    Then the ticket moves to In review with --only-from its status
    And implement-spec posts one comment that review-pr reviews the CR
    And implement-spec pushes nothing to that change line

  # Source: skills/implement-spec/SKILL.md, "Rules"
  # Proof: skill text only
  Scenario: A diff over the size limit goes back to Backlog
    Given the diff outgrows the size limit
    When the factory finds the size problem
    Then the ticket goes back to Backlog with the reason
    And shape splits the ticket

  # Source: skills/implement-spec/SKILL.md, "Rules"
  # Proof: skill text only
  Scenario: A cause that is not known goes to shape
    Given a fix fails and its cause is not known
    When the factory meets the failure
    Then the diagnosis belongs to shape, not to implement-spec

  # Source: references/architecture.md, "Adapter"; src/board/
  # Proof: test/board-adapters.test.ts "a board adapter without its credential fails naming the variable, and github passes token_env as GH_TOKEN on every call"
  Scenario: A board adapter without its credential fails and names the variable
    Given a board adapter whose token_env or credential variables are unset
    When the factory runs a board verb
    Then the verb fails
    And the message names the missing variable
    And no call reaches the board

  # Source: references/architecture.md, "Adapter"; src/board/
  # Proof: test/board-adapters.test.ts "board reads on jira, linear and github follow every page, and fail instead of returning a partial list"
  # Proof: test/board-adapters.test.ts "github-issues comments page, newest first, and filter by marker"
  Scenario: A board read returns every page or fails
    Given a board with more items or comments than one page holds
    When the factory runs "board list" or "board comments <id>"
    Then it gets every item or comment from every page
    And a board that does not advance, or holds more than the read limit, makes the verb fail

  # Source: src/board/index.ts, "comments"
  # Proof: test/board-local.test.ts "comments come newest first and narrow by marker, last and author, with --last counted after the filter"
  Scenario: Board comments come newest first and narrow by marker, author and count
    Given a ticket with comments from several authors
    When the factory runs "board comments <id>" with --marker, --author or --last
    Then the newest comment comes first
    And --author keeps only the named authors
    And --last counts after the filter

  # Source: references/architecture.md, "Adapter"; src/vcs/git.ts
  # Proof: test/vcs.test.ts "git: start, changed, base, cut, tag, tags on a real repo"
  Scenario: The vcs port runs one change line from start to drop
    Given a trunk with one commit
    When the factory starts a change line, commits, pushes, cuts, tags and drops it
    Then the change line is a worktree under .agents/work
    And "vcs changed" lists the files the line changed from the trunk
    And the push, the cut ref and the tags reach the remote
    And "vcs checkout-tests" puts the base tree back and keeps only the named test paths
    And "vcs drop" removes the worktree and the branch

  # Source: src/vcs/git.ts, "snapshot"
  # Proof: test/vcs.test.ts "git: snapshot is a detached tree outside the root; changed sees edits, adds and deletes; drop removes it"
  Scenario: A snapshot is a detached tree that holds no later commit
    Given a repo with a commit after the revision to snapshot
    When the factory takes a snapshot of the revision
    Then the tree is outside the repo root and holds no later commit
    And "changed" lists edits, adds and deletes in the tree
    And "drop" removes the tree

  # Source: src/exec.ts, "http"
  # Proof: test/exec.test.ts "http retries 429 and 5xx up to 3 tries honouring Retry-After (seconds or date, capped at 30s), and does not retry 4xx, nor 5xx on POST"
  Scenario: A call that can be retried is retried, and one that cannot is not
    Given a board or forge API that answers 429 or 5xx
    When the adapter makes the call
    Then it tries up to 3 times and waits the Retry-After time, at most 30 seconds
    And it does not retry a 4xx, nor a 5xx on POST

  # Source: src/exec.ts, "ghRetry"
  # Proof: test/forge.test.ts "gh reads retry up to 3 tries on 429, a rate-limit 403 and 5xx, honouring a retry-after hint; writes retry only on a rate limit"
  # Proof: test/board-adapters.test.ts "the GitHub boards retry a milestone write on a rate limit but not on a 5xx; a read retries on both"
  Scenario: A gh call that hit a rate limit or a server error is retried when it is safe
    Given gh reports HTTP 429, a 403 that names a rate limit, or HTTP 5xx
    When an adapter makes a read call
    Then it tries up to 3 times and waits the retry-after time gh prints, else 1 and 2 seconds
    When an adapter makes a write call
    Then it retries only a 429 or a rate limit, never a 5xx
    And it does not retry any other 403

  # Source: src/exec.ts, "http"
  # Proof: test/exec.test.ts "http aborts a request that never gets a response"
  Scenario: A call that gets no answer is aborted
    Given an API that never answers
    When the adapter makes the call
    Then the call fails after the time limit

  # Source: src/exec.ts, "http"
  # Proof: test/exec.test.ts "http returns the raw text of a 2xx that is not JSON, and keeps the URL path out of an error"
  Scenario: A success answer that is not JSON still counts, and an error shows no URL path
    Given a webhook that answers 200 with plain text, and one that answers 403
    When the adapter makes each call
    Then the first call succeeds and returns the text
    And the second error names the method, the host and the status, never the path, which may hold a secret

  # Source: src/exec.ts, "http"
  # Proof: test/exec.test.ts "http keeps the URL out of a failed call and tries once when asked"
  Scenario: A failed call never prints its URL
    Given a call whose URL holds a secret and that fails before any answer
    When the adapter makes the call
    Then the error names the method and the cause, never the URL
    And a caller can ask for a single attempt and its own time limit

  # Source: src/mcp.ts
  # Proof: test/mcp.test.ts "tools/list has board_move with a schema; unknown method is -32601"
  # Proof: test/mcp.test.ts "board tools create, move with only_from (a refusal is isError), set and assign"
  Scenario: An agent without a shell works the board through MCP tools
    Given the MCP server runs for the project
    When the agent lists the tools and calls board_create, board_move, board_set and board_assign
    Then the tools match the board verbs and carry the same arguments
    And a refused move returns an error result
    And an unknown method returns the JSON-RPC error -32601

  # Source: src/mcp.ts
  # Proof: test/mcp.test.ts "initialize answers the requested protocol version when supported, else the latest"
  # Proof: test/mcp.test.ts "every tool carries annotations from one table: reads are read-only, close and drop destructive, vcs reads closed-world"
  # Proof: test/mcp.test.ts "tools/call checks arguments against the inputSchema: -32602 naming the argument; unknown tool is -32602; a failing tool is isError"
  # Proof: test/mcp.test.ts "a request with a non-string method answers -32600 with the request id"
  # Proof: test/mcp.test.ts "a verb whose output is a JSON object also returns structuredContent; arrays and text stay text only"
  Scenario: The MCP server tells a client what each tool does and refuses a bad call
    Given a client that asks for a protocol version the server supports
    When it initializes, lists the tools and calls one
    Then the server answers with the client's version
    And each tool says whether it only reads, whether it destroys, and whether it reaches an outside system
    And a call with a missing, unknown or wrongly typed argument, or to an unknown tool, returns the JSON-RPC error -32602 naming it
    And a result that is a JSON object is also returned as structured content

  # Source: src/mcp.ts
  # Proof: test/mcp.test.ts "conformance 2025-11-25: initialize, then tools/list and tools/call answer without resultType, ttlMs or _meta; ping answers {}"
  Scenario: A client on protocol 2025-11-25 or earlier keeps the initialize handshake
    Given a client that sends initialize
    When it lists the tools, calls one and pings
    Then the replies have the shape of those revisions, with no resultType

  # Source: src/mcp.ts
  # Proof: test/mcp.test.ts "conformance 2026-07-28: server/discover and stateless tools/list carry resultType, ttlMs, cacheScope and serverInfo"
  # Proof: test/mcp.test.ts "conformance 2026-07-28: tools/call results are complete; a failing tool is isError, an unknown tool or bad argument is -32602"
  # Proof: test/mcp.test.ts "conformance 2026-07-28: a missing _meta field is -32602, an unsupported version is -32022 listing the supported ones, ping and initialize-era methods are -32601"
  Scenario: A client on protocol 2026-07-28 is served without a handshake
    Given a client that sends its protocol version and capabilities in the _meta of each request
    When it calls server/discover, tools/list and tools/call
    Then each result has resultType complete, and the list results have ttlMs and cacheScope
    And a missing _meta field is -32602 and an unsupported version is -32022 naming the supported versions
    And ping is -32601

  # Source: src/mcp.ts, "--allow"
  # Proof: test/mcp.test.ts "conformance: --allow filters the tools in both shapes, and a modern request needs no earlier initialize"
  # Proof: test/mcp.test.ts "--allow approve,status serves the review-identity tools, they are refused otherwise, and --help prints usage"
  Scenario: The MCP server serves the review-identity tools only when allowed
    Given the MCP server starts without --allow
    Then forge_approve and forge_status are not listed and a call to them fails
    When the server starts with --allow approve,status
    Then those tools are listed
    And any other --allow value is a usage error

  # Source: dist/bin.js; src/init.ts
  # Proof: test/dist-smoke.test.ts "bundled CLI: init, validate, and an MCP tool call"
  Scenario: The built CLI installs a project, validates it and serves an MCP call
    Given the built dist/bin.js and an empty project
    When the CLI runs "init", "validate" and one MCP tool call
    Then each step succeeds

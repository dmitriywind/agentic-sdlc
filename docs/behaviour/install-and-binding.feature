# Owner: src/binding.ts (validateBinding, bindingWarnings), src/install.ts (init, validate, doctor). The source holds the rule; this file states the behaviour a user can observe.
# Change both in the same commit.
@cli:init @cli:validate @cli:doctor
Feature: Install and validate the binding
  As an adopter
  I want to install the factory in my project and check my binding
  So that the gates and skills run with my project values

  # Source: src/install.ts, "init"
  # Proof: test/install.test.ts "init writes skills, binding, gates, pointer; second run is idempotent and keeps edits"
  Scenario: Init writes the skills, the binding, the gates and the pointer
    Given a project with no .agents folder
    When the adopter runs "agentic-sdlc init"
    Then .agents/skills holds the skill pack
    And .agents/binding.yml exists
    And the forge gate files and .agents/hooks/pre-push exist
    And AGENTS.md holds one pointer block to the sdlc skill

  # Source: src/install.ts, "init" (kept files)
  # Proof: test/install.test.ts "init writes skills, binding, gates, pointer; second run is idempotent and keeps edits"
  Scenario: A second init keeps the adopter's edits
    Given the adopter edited .agents/binding.yml
    When the adopter runs "agentic-sdlc init" again
    Then the binding keeps the edit
    And AGENTS.md still holds one pointer block

  # Source: src/install.ts, "syncSkills"
  # Proof: test/install.test.ts "init keeps an edited skill file unless --force, and updates an unedited one"
  Scenario: Init updates an unedited skill and keeps an edited one
    Given the adopter edited one skill file
    And the package holds a new version of another skill
    When the adopter runs "agentic-sdlc init"
    Then the edited skill file is kept
    And the unedited skill file is updated
    And "--force" overwrites the edited file

  # Source: src/install.ts, "Installer"
  # Proof: test/install.test.ts "init --upgrade updates an unedited workflow, keeps an edited one, and --force overwrites it but never the binding"
  Scenario: Init --upgrade follows the package for unedited files and never rewrites the binding
    Given init recorded the hash of every file it installed in .agents/install.lock.json
    And the package holds a new workflow
    When the adopter runs "agentic-sdlc init --upgrade"
    Then a workflow still at its recorded hash is updated
    And a workflow the adopter edited is kept and the line names the package file with the new version
    And "--force" overwrites the edited workflow
    And no flag rewrites .agents/binding.yml: to regenerate it the adopter deletes the file
    And the last lines say how many files are new, updated, kept and stale, and what to run next

  # Source: src/install.ts, "init" (binding)
  # Proof: test/install.test.ts "init --force on a local board creates no second heartbeat ticket"
  Scenario: Init --force creates no second heartbeat ticket
    Given the binding exists on a local board
    When the adopter runs "agentic-sdlc init --board local --force"
    Then the board still holds one heartbeat ticket

  # Source: src/install.ts, "Installer"
  # Proof: test/install.test.ts "init on an install from before the lock adopts an identical file and keeps a differing one"
  Scenario: A file with no lock entry counts as edited unless it equals the package's
    Given an install whose lock has no entry for two files
    And one file equals the package's file and the other differs
    When the adopter runs "agentic-sdlc init"
    Then the identical file is recorded in the lock
    And the differing file is kept and not recorded

  # Source: src/install.ts, "Installer"
  # Proof: test/install.test.ts "init honours the skills lock of an install from before the single lock"
  Scenario: Init reads the old skills lock once
    Given the project has .agents/skills.lock.json and no .agents/install.lock.json
    When the adopter runs "agentic-sdlc init"
    Then a skill file still at its old recorded hash is updated
    And .agents/install.lock.json holds the lock from then on

  # Source: src/install.ts, "Installer"
  # Proof: test/install.test.ts "init reports a file the package no longer ships and deletes nothing"
  Scenario: Init reports a file the package no longer ships
    Given the lock names a file the package no longer ships
    When the adopter runs "agentic-sdlc init"
    Then init prints "stale <path>: no longer part of the package"
    And the file stays

  # Source: src/install.ts, "missingBindingKeys"
  # Proof: test/install.test.ts "init and validate list template binding keys that the binding does not set"
  Scenario: Init and validate list the template's binding keys that the binding lacks
    Given the template sets a top-level or second-level key the binding does not
    When the adopter runs "agentic-sdlc init" or "agentic-sdlc validate"
    Then an info line lists those keys
    And the binding is not changed

  # Source: src/install.ts, "init" (vcs and forge checks)
  # Proof: test/install.test.ts "init writes skills, binding, gates, pointer; second run is idempotent and keeps edits"
  Scenario: Init refuses a VCS or a forge it does not support
    When the adopter runs "agentic-sdlc init --vcs hg" or "agentic-sdlc init --forge swarm"
    Then the command exits with code 1

  # Source: src/install.ts, "init" (profile)
  # Proof: test/install.test.ts "init --profile organization writes two identities, traces and a container sandbox; the ruleset asks for an approving review"
  Scenario: The organization profile sets two identities, traces and a container sandbox
    When the adopter runs "agentic-sdlc init --profile organization"
    Then the binding has "profile: organization" and a container sandbox
    And the binding has a traces.uri, a review_identity, a token_env and a review_token_env
    And the trunk ruleset asks for one approving review
    And an unknown profile makes the command exit with code 1

  # Source: src/install.ts, "init" (profile, ruleset)
  # Proof: test/install.test.ts "init --profile individual and individual-api: one identity; the ruleset asks for no approving review and pins every check to Actions"
  Scenario: The individual profiles start with one identity
    When the adopter runs "agentic-sdlc init --profile individual" or "--profile individual-api"
    Then the binding has no review_identity and no review_token_env
    And the trunk ruleset asks for no approving review, since GitHub refuses one from the CR's author

  # Source: src/binding.ts, "validateBinding" (identities) and "bindingWarnings" (profile)
  # Proof: test/binding.test.ts "identities: organization needs a review identity; review_identity and review_token_env come together and differ from token_env"
  # Proof: test/binding.test.ts "bindingWarnings flags profile mismatches without failing validation"
  Scenario: Validate checks the identities each profile needs
    Then validate fails an organization binding with no forge.review_identity
    And validate fails a review_identity without a review_token_env, a review_token_env without a review_identity, and a review_token_env equal to token_env
    And an individual binding with a managed, webhook or assign executor gets a warning to use individual-api
    And an individual-api binding gets no such warning
    And an organization binding with no managed executor gets a warning

  # Source: src/board/index.ts, "createBoard" (scope); src/binding.ts, "validateBinding" (board.scope)
  # Proof: test/board-local.test.ts "board.scope: many repos on one board; a repo lists its own label, the home repo also the unlabelled, create adds the label"
  # Proof: test/binding.test.ts "board.scope: a prefixed label; the home repo lists every repo label, its own included"
  Scenario: Many repos share one board through board.scope
    Given two repos whose bindings name the same board, one with board.scope.label "repo:a", one with "repo:b" and home true
    When each repo runs "board list"
    Then repo a sees only tickets labelled "repo:a"
    And the home repo sees tickets labelled "repo:b" and tickets with no "repo:" label
    And "board create" in each repo adds that repo's label
    And validate fails a home binding whose board.scope.repos does not list every repo label

  # Source: src/binding.ts, "validateBinding"
  # Proof: test/binding.test.ts "validateBinding reports each broken rule"
  Scenario: Validate lists each broken rule
    Given a binding with a wrong version, an unknown adapter, a missing status and a change_pattern without <ticket>
    When the adopter runs "agentic-sdlc validate"
    Then each problem prints as a "problem:" line
    And the command exits with code 1

  # Source: src/binding.ts, "validateBinding" (adapter options)
  # Proof: test/binding.test.ts "validateBinding rejects unknown option keys and missing required ones per adapter"
  Scenario: Adapter options are checked per adapter
    Given the board adapter is "jira" and its options lack "project_key" and hold an unknown key
    When the binding is validated
    Then the problems name the missing option
    And the problems name the unknown option

  # Source: src/binding.ts, "validateBinding" (vcs keys)
  # Proof: test/binding.test.ts "validateBinding requires the vcs keys the gates and hook dereference"
  Scenario: The vcs keys that the gates need are required
    Given a binding with no vcs.trunk, vcs.release_prefix or vcs.factory_change_pattern
    When the binding is validated
    Then each missing key is a problem
    And an empty vcs.tag_prefix is valid

  # Source: src/binding.ts, "bindingWarnings"
  # Proof: test/binding.test.ts "bindingWarnings flags profile mismatches without failing validation"
  Scenario: Profile mismatches warn and do not fail
    Given an individual profile with a managed executor
    When the adopter runs "agentic-sdlc validate"
    Then a "warn:" line names the executor
    And the command exits with code 0

  # Source: src/binding.ts, "bindingWarnings" (review_runtime)
  # Proof: test/binding.test.ts "validateBinding requires each executor kind its keys; review_runtime only warns as unused"
  Scenario: forge.review_runtime is an unused key
    Given the binding sets forge.review_runtime
    When the binding is validated
    Then a warning says review-pr always runs in its own runtime

  # Source: src/install.ts, "doctor" and "trunkProtection"
  # Proof: test/install.test.ts "doctor: unpinned required checks warn; no repo gets a reminder"
  Scenario: Doctor warns about required checks that are not pinned
    Given the trunk rules hold a required check with no integration_id
    When the adopter runs "agentic-sdlc doctor"
    Then a warning names that check
    And on a forge other than GitHub doctor prints a reminder to pin each check

  # Source: src/install.ts, "trunkProtection"
  # Proof: test/install.test.ts "doctor: a trunk with no enforced ruleset or branch protection warns that no gate blocks a merge"
  Scenario: Doctor warns when nothing enforces the gates on the trunk
    Given the trunk rules are empty and the trunk has no branch protection, or reading them returns 403 "Upgrade to GitHub Pro"
    When the adopter runs "agentic-sdlc doctor"
    Then a warning says no gate blocks a merge into the trunk

  # Source: src/install.ts, "init" (--no-plugin)
  # Proof: test/install.test.ts "init --harness claude writes no .mcp.json (the plugin serves MCP); --no-plugin merges it and pins npx -y to the Git tag"
  Scenario: Init for Claude Code without the plugin writes the skills a cloud session loads
    When the adopter runs "agentic-sdlc init --harness claude --no-plugin"
    Then .claude/skills holds the skill pack
    And .mcp.json holds the agentic-sdlc server
    And without --no-plugin init writes no .claude/skills

  # Source: src/install.ts, "init" and "originRepo"
  # Proof: test/install.test.ts "init reads the repo from a GitHub origin, and --no-plugin prints no plugin install hint"
  Scenario: Init reads the repo from the GitHub origin remote
    Given the project's git remote origin is a GitHub repo
    When the adopter runs "agentic-sdlc init --harness claude --no-plugin --board github-issues"
    Then the binding's forge.options.repo and board.options.repo name that repo
    And the init log does not ask to install the plugin

  # Source: src/install.ts, "doctor" and "deliveryWorkflow"
  # Proof: test/install.test.ts "doctor: the delivery workflow must name the trunk and release line"
  Scenario: Doctor fails when the delivery workflow does not name the trunk
    Given the delivery workflow push branches do not name vcs.trunk
    When the adopter runs "agentic-sdlc doctor"
    Then doctor prints a "fail delivery workflow" line
    And the command exits with code 1

  # Source: src/install.ts, "unpinnedActions"
  # Proof: test/install.test.ts "doctor: an installed workflow action not pinned to a commit SHA is a warning"
  Scenario: Doctor warns about an action that is not pinned to a commit SHA
    Given an installed .github/workflows/agentic-sdlc-*.yml has a uses: that is not a 40-hex commit SHA
    When the adopter runs "agentic-sdlc doctor"
    Then doctor prints a "warn workflow actions" line naming the file and the action
    And the exit code is not changed

  # Source: src/binding.ts, "validateBinding" (product.slo)
  # Proof: test/binding.test.ts "product.slo: a rate from 0 to 1 and a positive whole window, or unset"
  Scenario: The error budget needs a rate and a window
    Given product.slo is set
    When change_failure_rate_max is outside 0 to 1 or window_days is not a positive whole number
    Then validation fails naming the key
    And an unset product.slo means no error budget

  # Source: src/binding.ts, "validateBinding" (product.delivery)
  # Proof: test/binding.test.ts "product.delivery: continuous needs no release prefix; release-line needs two environments"
  Scenario: The delivery mode decides which release keys are required
    Given product.delivery is continuous
    Then vcs.release_prefix is not required
    When product.delivery is release-line with one environment
    Then validation fails with "release-line needs two or more environments"

  # Source: src/install.ts, "deliveryWorkflow"
  # Proof: test/install.test.ts "doctor: env.DELIVERY must match product.delivery; continuous needs no release prefix"
  Scenario: doctor checks the delivery workflow's mode
    Given the delivery workflow sets env.DELIVERY
    When doctor runs
    Then it fails when env.DELIVERY differs from product.delivery

  # Source: src/board/github.ts, "items"
  # Proof: test/board-adapters.test.ts "github: a Project shared by two repos yields only the issues of this repo"
  Scenario: Repos can share one GitHub Project
    Given a GitHub Project holds issue 12 of this repo and issue 12 of another repo
    When the board adapter lists the board
    Then it returns only the issue of board.options.repo

  # Source: src/board/github-issues.ts, "createGithubIssuesBoard"
  # Proof: test/board-adapters.test.ts "github-issues list reads status and fields from labels, pages by 100, skips PRs and unlabelled issues"
  Scenario: The github-issues board reads Status and fields from labels over repo REST only
    Given board.adapter is "github-issues" and an issue has the labels "status:Ready" and "size:S"
    When the board adapter lists the board
    Then the item has status Ready and field size S
    And issues without a status label and pull requests are left out
    And every call is "gh api" under "repos/<owner>/<repo>/", never GraphQL, "gh issue" or "gh project"

  # Source: src/board/github-issues.ts, "move"
  # Proof: test/board-adapters.test.ts "github-issues move swaps the status label, and refuses with --only-from when the status differs"
  Scenario: A github-issues move swaps the status label
    Given an issue with the label "status:Backlog"
    When the factory runs "board move <id> "In progress" --only-from Ready"
    Then the move is refused and the labels do not change
    When the factory runs "board move <id> "In progress" --only-from Backlog"
    Then the issue has "status:In progress" and no other status label

  # Source: src/board/github-issues.ts, "create" and "close"
  # Proof: test/board-adapters.test.ts "github-issues create ensures every label exists, then sets the milestone and the parent"
  # Proof: test/board-adapters.test.ts "github-issues set and label edit labels; close sets the state reason and Cancelled"
  Scenario: github-issues create makes missing labels, and close closes the issue
    When the factory creates a ticket with a status and labels the repo lacks
    Then the repo gets those labels before the issue is opened
    When the factory closes a ticket with reason not_planned
    Then the issue is closed as not planned and has "status:Cancelled"

  # Source: src/binding.ts, "validateBinding" and "bindingWarnings" (product.evidence)
  # Proof: test/binding.test.ts "product.evidence: known kinds only; evidence without commands.evidence_check warns"
  Scenario: Release evidence needs a command that proves it
    Given product.evidence lists sbom and provenance
    And commands.evidence_check is unset
    When the binding is validated
    Then a warning says no release can show its evidence

  # Source: src/binding.ts, "bindingWarnings" and "validateBinding"
  # Proof: test/binding.test.ts "bindingWarnings: a GitHub heartbeat ticket must be a number; env labels must name an environment; an empty release prefix fails"
  Scenario: Setups that fail at run time are named before the first cycle
    Given a GitHub board with heartbeat.ticket "HEARTBEAT-1"
    And board.env_labels lists "env:qa" while product.environments has no "qa"
    When the binding is validated
    Then a warning names each of them
    And an empty vcs.release_prefix fails validation

  # Source: src/binding.ts, "validateBinding" (owners); src/ports.ts, "ownersFor"
  # Proof: test/binding.test.ts "owners: roles take lists, ownersFor normalises them, --trusted includes every role"
  Scenario: An owner role can be a list, and optional roles exist
    Given owners.product is a list of a name and { board, forge }
    And owners.operator, owners.security and owners.compliance are set
    When the binding is validated
    Then it is valid and every role reads as a list
    And "--trusted" keeps the comments of every entry of every role
    And an empty list, or an entry that is empty or has only one of board and forge, is a problem

  # Source: src/binding.ts, "validateBinding" and "bindingWarnings" (owners)
  # Proof: test/binding.test.ts "owners: an unknown owners key warns and the review identity must not be an owner"
  Scenario: An unknown owners key warns and the review identity is never an owner
    Given owners has a key that is not a role
    Then validation warns about it
    And forge.review_identity equal to any owner entry is a problem

  # Source: src/binding.ts, "validateBinding" (owners); src/ports.ts, "ownersFor"
  # Proof: test/binding.test.ts "validateBinding: an owner is a name or { board, forge }"
  Scenario: An owner can have one name on the board and another on the forge
    Given owners.product is { board: "acc-1", forge: "ann" }
    And an owners.bots entry is { board: "acc-3", forge: "bot[bot]" }
    When the binding is validated
    Then it has no problems
    And an owner with only one of board and forge is a problem

  # Source: src/binding.ts, "validateBinding" (heartbeat)
  # Proof: test/binding.test.ts "validateBinding: an empty heartbeat.ticket is a problem"
  Scenario: A binding with no heartbeat ticket fails validation
    Given heartbeat.ticket is empty, as the template writes it
    When the binding is validated
    Then a problem says to create the heartbeat ticket and put its id in heartbeat.ticket

  # Source: src/install.ts, "init" (heartbeat ticket)
  # Proof: test/install.test.ts "init --board local creates the heartbeat ticket off every route and sets heartbeat.ticket"
  Scenario: init on a local board creates the heartbeat ticket
    Given an empty project
    When the adopter runs "agentic-sdlc init --board local"
    Then the local board holds one ticket "Heartbeat" with status Cancelled
    And heartbeat.ticket names that ticket

  # Source: src/install.ts, "implementerToken"
  # Proof: test/install.test.ts "doctor: a classic implementer token with repo scope warns; a fine-grained one is quiet"
  Scenario: doctor warns when the implementer token can post commit statuses
    Given forge.options.token_env names a classic token with scope "repo"
    When the adopter runs "agentic-sdlc doctor"
    Then a warning says to use a fine-grained token with Commit statuses: no access
    And a fine-grained token prints no warning

  # Source: src/install.ts, "selfHostedRunner"
  # Proof: test/install.test.ts "doctor: a self-hosted runner fails on a public repo and warns when CR code and secrets share it"
  Scenario: doctor checks the self-hosted runner setup
    Given the repo variable AGENTIC_RUNS_ON names a self-hosted runner
    When the adopter runs "agentic-sdlc doctor"
    Then on a public repo the runner check fails
    And on a private repo with no separate AGENTIC_RUNS_ON_TRUSTED runner a warning says CR code and the secret jobs share one runner
    And with two separate runners the runner check is ok

  # Source: src/install.ts, "cloudBoard"
  # Proof: test/install.test.ts "doctor: a Claude cloud session fails a GitHub Projects board and names the boards it can reach"
  Scenario: doctor in a Claude cloud session fails a GitHub Projects board
    Given a binding with board adapter "github"
    When doctor runs in a Claude cloud session (CLAUDE_CODE_REMOTE=true)
    Then doctor fails, saying a cloud session cannot reach GitHub Projects
    And it names the github-issues, jira and linear boards, and GitHub Actions as the runner for a github board

  # Source: src/install.ts, "init" (continuous)
  # Proof: test/install.test.ts "init writes no release workflow or release ruleset when the binding delivers continuously"
  Scenario: Init writes no release line files for continuous delivery
    Given the binding sets product.delivery to continuous
    When the adopter runs "agentic-sdlc init --forge github"
    Then init writes the gate workflows
    And init writes no release workflow and no release ruleset

  # Source: src/install.ts, "init" (package templates)
  # Proof: test/install.test.ts "init without package templates fails clearly"
  Scenario: Init fails when the package has no templates
    Given the installed package has no templates folder
    When the adopter runs "agentic-sdlc init"
    Then the command exits with code 1

  # Source: src/install.ts, "validate" (skills)
  # Proof: test/install.test.ts "validate warns on a top-level skill tier, fails when no tier exists or frontmatter is missing"
  Scenario: Validate checks each installed skill
    Given an installed skill with a top-level tier, one with no tier, and one with no frontmatter
    When the adopter runs "agentic-sdlc validate"
    Then the top-level tier gives a warning
    And the skill with no tier and the skill with no frontmatter give a problem
    And the command exits with code 1

  # Source: src/install.ts, "validate"
  # Proof: test/install.test.ts "validate prints warn: lines and exits 0 when only warnings exist"
  Scenario: Validate with only warnings exits with code 0
    Given a binding with a warning and no problem
    When the adopter runs "agentic-sdlc validate"
    Then validate prints a "warn:" line
    And the command exits with code 0

  # Source: src/install.ts, "init" (claude harness)
  # Proof: test/install.test.ts "init --harness claude: tier subagents from binding.models, @AGENTS.md import once, no skills copy"
  Scenario: Init for Claude Code writes tier subagents and one AGENTS.md import
    Given the binding sets models for the fast and deep tiers
    When the adopter runs "agentic-sdlc init --harness claude" twice
    Then init writes one subagent per tier with the model from the binding
    And CLAUDE.md imports "@AGENTS.md" once
    And init copies no skills

  # Source: src/install.ts, "init" (package.json)
  # Proof: test/install.test.ts "init pins the CLI as a devDependency when package.json exists, and the MCP entry follows"
  Scenario: Init pins the CLI when the project has a package.json
    Given the project has a package.json
    When the adopter runs "agentic-sdlc init --harness cursor"
    Then package.json lists the CLI as a devDependency at the release tag
    And the MCP entry runs the installed CLI

  # Source: src/install.ts, "init" (MCP entry)
  # Proof: test/install.test.ts "init keeps an existing agentic-sdlc MCP entry unless --force"
  Scenario: Init keeps an MCP entry that the adopter wrote
    Given .mcp.json has its own "agentic-sdlc" entry
    When the adopter runs "agentic-sdlc init --no-plugin"
    Then the entry stays
    And "--force" replaces it

  # Source: src/install.ts, "init" (codex harness)
  # Proof: test/install.test.ts "init --harness codex appends the TOML table once and keeps one the adopter wrote"
  Scenario: Init for Codex writes the TOML table once
    Given .codex/config.toml exists
    When the adopter runs "agentic-sdlc init --harness codex" twice
    Then the file holds one "mcp_servers.agentic-sdlc" table
    And a table the adopter wrote stays unchanged

  # Source: src/install.ts, "init" (harness)
  # Proof: test/install.test.ts "init --harness cursor writes .cursor/mcp.json; unknown harness fails"
  Scenario: Init for Cursor writes the MCP file, and an unknown harness fails
    When the adopter runs "agentic-sdlc init --harness cursor"
    Then init writes .cursor/mcp.json with the "agentic-sdlc" entry
    And "--harness nope" exits with code 1

  # Source: src/install.ts, "init" (release ruleset)
  # Proof: test/install.test.ts "init on github installs the release-lines ruleset"
  Scenario: Init on GitHub installs the release-lines ruleset
    When the adopter runs "agentic-sdlc init --forge github"
    Then init writes .github/rulesets/release.json

  # Source: src/binding.ts, "loadBinding"
  # Proof: test/binding.test.ts "loadBinding reads yaml and a good binding has no problems"
  Scenario: A good binding has no problems
    Given .agents/binding.yml holds a complete binding
    When validate loads it
    Then validate lists no problem

  # Source: src/binding.ts, "validateBinding" (factory)
  # Proof: test/binding.test.ts "validateBinding requires the factory owner and factory path globs"
  Scenario: The factory owner and the factory paths are required
    Given paths.factory is empty, or owners.factory is missing
    When the adopter runs "agentic-sdlc validate"
    Then validate names the missing key

  # Source: src/binding.ts, "shippedOptions"
  # Proof: test/binding.test.ts "shippedOptions derives from environments"
  Scenario: The Shipped options come from the environments
    Given product.environments is staging and production
    Then the Shipped options are Not shipped, On staging, In release and On production

  # Source: src/binding.ts, "validateBinding" (executors, traces, mcps)
  # Proof: test/binding.test.ts "validateBinding checks executor stage fields, traces and computer-use"
  Scenario: Validate checks executor stages, traces and MCP names
    Given an executor stage names an unknown MCP, a bad secret name, a bad sandbox or a bad model
    And traces.uri has no run id
    When the adopter runs "agentic-sdlc validate"
    Then validate names each bad field

  # Source: src/binding.ts, "bindingWarnings" (bench_size)
  # Proof: test/binding.test.ts "bindingWarnings: bench_size below bench_min_cases can never pass bench compare"
  Scenario: A bench size below the minimum cases warns
    Given learning.bench_size is below learning.bench_min_cases
    When the adopter runs "agentic-sdlc validate"
    Then validate prints a warning that bench compare can never pass

  # Source: src/binding.ts, "bindingWarnings" (traces)
  # Proof: test/binding.test.ts "bindingWarnings accepts Windows trace paths with either slash"
  Scenario: A Windows trace path with either slash is accepted
    Given traces.uri is a Windows path with a backslash or a slash
    When the adopter runs "agentic-sdlc validate"
    Then validate prints no warning

  # Source: src/binding.ts, "validateBinding" (profile)
  # Proof: test/binding.test.ts "profile is required and must be known"
  Scenario: A binding needs a known profile
    Given the binding has no profile, or the profile "team"
    When the adopter runs "agentic-sdlc validate"
    Then validate fails and names the profile

  # Source: src/binding.ts, "validateBinding" (human_approval, learning, commands)
  # Proof: test/binding.test.ts "new keys validate (approval, learning, proofs); product.kind and board.milestone only warn as unused"
  Scenario: Validate checks the approval, learning and proof keys
    Given forge.human_approval is unknown, or a learning number is out of range, or learning.enabled is not a boolean
    When the adopter runs "agentic-sdlc validate"
    Then validate names each bad key
    And product.kind and board.milestone only warn as unused

  # Source: src/binding.ts, "validateBinding" (adapters)
  # Proof: test/binding.test.ts "v2 is Git only: hg, p4 and swarm adapters are rejected"
  Scenario: Only the Git VCS and the GitHub forge are supported
    Given vcs.adapter is "hg" and forge.adapter is "swarm"
    When the adopter runs "agentic-sdlc validate"
    Then validate fails and names both adapters

  # Source: src/binding.ts, "validateBinding" (keys the gates read)
  # Proof: test/binding.test.ts "validate checks the keys the gates read unguarded, the judge tier, auto-merge classes, mcps and managed api fields"
  Scenario: Validate fails a binding that a gate or a stage would read wrong
    When a binding has a non-list done_statuses, a missing bug, feature or human label, an unknown version_scheme or judge_tier, an auto-merge class other than tuning, an MCP server with both url and command, or a managed executor without its api's fields
    Then validate names each problem and exits with code 1

  # Source: src/cli.ts, "main"
  # Proof: test/cli.test.ts "help: every group answers --help with its usage and exit 0; a group with no verb is a usage error"
  Scenario: The CLI explains itself
    When the adopter runs "agentic-sdlc" with no arguments
    Then it lists every group and exits with code 2
    When the adopter runs "agentic-sdlc <group> --help"
    Then it prints that group's usage and exits with code 0

  # Source: src/cli.ts, "main"
  # Proof: test/cli.test.ts "cli: --version and help print and exit 0; --root needs a directory; --help is read only at the verb position; groups are own properties"
  Scenario: The CLI reads its own options strictly
    When the adopter runs "agentic-sdlc --version" or "agentic-sdlc help"
    Then it prints the version or the group list and exits with code 0
    When "--root" has no directory, or is followed by a group name
    Then it is a usage error with exit code 2
    And "--help" counts as help only as the first argument after the group or its verb

  # Source: src/board/index.ts, "createBoard"
  # Proof: test/board-adapters.test.ts "a board verb with a missing required option fails naming the binding key and validate, not a raw gh call"
  Scenario: A board verb fails clearly when the adapter's required option is missing
    Given "board.options.project_number" is unset for the github board adapter
    When a skill runs any "agentic-sdlc board" verb
    Then the command fails naming "board.options.project_number" and "agentic-sdlc validate"
    And no vendor CLI runs

  # Source: src/board/index.ts, "checked"
  # Proof: test/board-local.test.ts "create and move refuse a status the binding does not list"
  Scenario: A board refuses a status that board.statuses does not list
    When a skill runs "board create" or "board move" with a status outside "board.statuses"
    Then the command fails and the ticket does not change

  # Source: src/board/index.ts, "checked"
  # Proof: test/board-adapters.test.ts "the GitHub boards refuse an id that is not an issue number before calling gh"
  Scenario: The GitHub boards take only issue numbers as ids
    When a skill runs a "board" verb with an id that is not a number on the github or github-issues adapter
    Then the command fails before any request is sent

  # Source: src/board/github.ts and src/board/github-issues.ts, "assign"
  # Proof: test/board-adapters.test.ts "assign sets or clears the one assignee on github and github-issues: it replaces, never adds"
  Scenario: Assign replaces the assignee
    Given a ticket assigned to "old"
    When a skill runs "board assign <id> new"
    Then "new" is the only assignee
    When a skill runs "board assign <id> --none"
    Then the ticket has no assignee

  # Source: src/forge/github.ts, "view" and "viewBySha"
  # Proof: test/forge.test.ts "github view reads every page of check runs and commit statuses"
  Scenario: A CR view reads every page of checks and statuses
    Given a head commit with more than 100 check runs or 30 statuses
    When a skill runs "forge view <n>"
    Then every check run and status is in the checks, so a failing one cannot fall off

  # Source: src/forge/github.ts, "viewBySha"
  # Proof: test/forge.test.ts "github viewBySha prefers the merge commit, then the head, then the first pull"
  Scenario: A commit with several pulls resolves to the pull it merged, or else the one it heads
    Given a commit is listed under several pulls
    When a skill runs "forge view --sha <sha>"
    Then the pull whose merge commit is the sha wins, then the pull whose head is the sha, then the first

  # Source: src/forge/github.ts
  # Proof: test/forge.test.ts "github refuses a change request number or sha that is not an id before calling gh"
  Scenario: The github forge takes only numbers and hex shas as ids
    When a skill runs a "forge" verb with a CR number that is not a number or a sha that is not hex
    Then the command fails before gh runs

  # Source: src/board/jira.ts, "quote"
  # Proof: test/board-adapters.test.ts "jira escapes a backslash before a quote in JQL"
  Scenario: A Jira search text with a backslash or quote cannot break out of its JQL string
    When a skill lists with a search text holding a backslash and a quote
    Then both are escaped in the JQL

  # Source: src/board/linear.ts, "withLabels"
  # Proof: test/board-adapters.test.ts "linear reads up to 250 labels, states and children, and keeps the ids of the issue's own labels"
  Scenario: Linear reads up to 250 labels, states and children and keeps an issue's own label ids
    When a skill adds a label the issue already carries, such as a workspace label
    Then the issue keeps that label's id and no label is created

  # Source: src/install.ts, "init"
  # Proof: test/install.test.ts "init refuses an unknown board, an unknown flag and a package.json that is not JSON, before it writes anything"
  Scenario: Init refuses a bad command line or a broken package.json and writes nothing
    When the adopter runs "agentic-sdlc init" with a board that is no adapter, a flag init does not know, or a package.json that is not JSON
    Then init fails and names the problem
    And no file is written

  # Source: src/install.ts, "pinCli"
  # Proof: test/install.test.ts "init moves its own older CLI pin to the package version and keeps a pin the project chose"
  Scenario: Init after an upgrade moves the CLI pin it wrote
    Given package.json pins the CLI at an older release tag
    When the adopter runs "agentic-sdlc init" from a newer package
    Then the pin names the new release tag
    And a pin to a commit, a fork or a path stays as the project wrote it

  # Source: src/install.ts, "probeFailure"
  # Proof: test/install.test.ts "doctor: a failed probe shows the command's first stderr line and hides the value of every env var the binding names"
  Scenario: Doctor says why a probe failed and shows no secret
    Given a board or forge probe fails
    When the adopter runs "agentic-sdlc doctor"
    Then the fail line holds the command and the first line of its error output
    And the value of every env var the binding names under a "_env" key is masked

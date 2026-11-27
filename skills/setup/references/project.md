# Reading the project for the binding

Each binding key below names where its value comes from. Read files with your file tools; ask the
CLI for anything on the forge. A key whose source says nothing stays `unresolved` with a reason.

| Key | Source | When the source says nothing |
|---|---|---|
| `owners.product`, `owners.factory` | the `login` of `agentic-sdlc forge whoami` (one person: both) | unresolved |
| `owners.bots` | the account the scheduled cycle acts as; when the cycle runs as the person, that same `login` | unresolved |
| `board.options.repo`, `forge.options.repo` | `repo` of `forge whoami` (init reads the origin remote) | unresolved |
| `vcs.trunk` | `defaultBranch` of `forge whoami` | unresolved |
| `commands.install` | the lockfile's install command (a frozen or clean install), else the manifest's install | unresolved |
| `commands.fast_check` | the manifest script for typecheck, else lint, else a build that type-checks | the `verify` command |
| `commands.verify` | the manifest's test script, or what the trunk CI workflow runs as its test step | unresolved |
| `commands.proofs_on_base` | the test runner of `verify` with `{files}` where its file arguments go | unresolved |
| `forge.ci_workflow` | the `name:` of the CI workflow file that runs on a push to the trunk | unresolved |
| `forge.deploy_workflows` | the `name:` of the workflow that deploys or publishes the first environment, then the last | `[]` when nothing deploys |
| `product.environments` | the environment names those deploy workflows use, in order; a library: where it publishes | keep the template's |
| `product.delivery` | `continuous` unless the project releases from a release line the owner approves | `continuous` |
| `paths.*` file keys | the file at that path, or the project's file that does that job (contributing guide as review checklist, testing guide as test standard) | delete the key |
| `paths.lane_areas` | folders for authentication, payments, secrets or data migration, when the project has them | `[]` |

Manifests to look in: `package.json` scripts, `pyproject.toml`, `Makefile`, `Cargo.toml`, `go.mod`,
`*.csproj`, `Gemfile`, `pom.xml`, `build.gradle`; the language is the one whose manifest is at the root.
Prefer a command the CI workflow already runs: it is known to pass there.

A command is the exact line a person would type at the repository root; it must exit non-zero on
failure. Never put a secret or a token in a command: name its env var.

## One person, one account

With one account as owner and as the account the cycle acts as, `validate` warns that nobody
outside `owners.bots` can approve a Full-lane change, so such a change never merges. That is the
person's decision, not yours: leave the warning, and the `person` list of `status` names the
choices (a second account in `owners.product`, or `forge.human_approval: never`).

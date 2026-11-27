# GitHub and Claude: the details

What the [guide](guide/1-what-it-is.md) leaves out and the [contract](../references/architecture.md)
does not state as a rule: one-time settings, limits, and the trade-offs behind them. Cloud routine
facts (limits, setup script, triggers) are in
[`templates/runner/claude-routine.md`](../templates/runner/claude-routine.md).

The GitHub adapter is tested by executable features against a fake process runner. Its behaviour
behind the Claude cloud proxy on real GitHub is not proven yet (see the [roadmap](roadmap.md)).

## GitHub

**Private repo on GitHub Free.** No draft pull requests and no enforced ruleset. A draft is a pull
request with the `draft` label, and `forge land` merges once the pull request is ready and every
required check is green. No rule can block that merge, so the review is the last check. `doctor`
warns.

**Admin bypass.** The shipped trunk ruleset lets repo admins bypass in a pull request. The routine
pushes and merges as you, the admin, so the ruleset limits what reaches the main branch only as far as
the agent stays inside its tools. That is also how you merge a factory change by hand when no other
account can approve it.

**Pinned actions.** Every installed workflow pins its actions by commit SHA with the version in a
comment. Keep them fresh with Dependabot's `github-actions` ecosystem; `doctor` warns on a `uses:`
that is not a SHA. The pinned actions run on Node 24, so a self-hosted runner needs Actions runner
v2.327.1 or later.

**Self-hosted runners.** Set the repo variables `AGENTIC_RUNS_ON` and `AGENTIC_RUNS_ON_TRUSTED` to a
JSON label list (for example `["self-hosted","code"]`). Unset, jobs run on `ubuntu-latest`. Limits:

- Only on a private repo: on a public repo a fork's pull request runs its code on your machine.
  `doctor` fails this case.
- `AGENTIC_RUNS_ON` jobs run pull request and agent code as the runner's OS user. Give that runner its
  own user, or a container or VM, with no access to your files, credentials or other repos.
- `AGENTIC_RUNS_ON_TRUSTED` jobs hold the tokens. Give them a second runner with a second OS user;
  `doctor` warns when one runner takes both.
- Register runners with `--ephemeral` where you can, so no job sees the previous one's workspace.

**Release lines** (`product.delivery: release-line` only). Create the Environment `agentic-release`
with yourself as required reviewer and deployment branches limited to the main branch, and store
`AGENTIC_RELEASE_TOKEN` there: the release bot, a bypass actor of `.github/rulesets/release.json`. A
required reviewer on a private repo needs GitHub Enterprise, so below it the go-ahead is not enforced.

**A separate review account** (`profile: organization`). Create the Environment `agentic-review`
(deployment branches: the main branch, `gh-readonly-queue/<trunk>/*` and the release line glob) and
store `AGENTIC_REVIEW_TOKEN` there only. Give the implementer a fine-grained `AGENTIC_FORGE_TOKEN` with
"Commit statuses: no access" and no admin or bypass right; `doctor` warns on a classic token with
`repo` or `repo:status`. Pin `review` and `human-approval` in the ruleset to the review app when it is
an App. On a private repo below the Pro plan there are no Environment secrets, so the tokens become repo
secrets any same-repo workflow can read. Running the review job as a second cloud routine is not
proven yet.

## Claude Code

**Plugin or copy.** On your computer the plugin gives the skills as `agentic-sdlc:<skill>`. A cloud
session loads no repo plugin, only `.claude/skills/`, so `init --no-plugin` copies them there as
`sdlc-<skill>`, with the reviewer agent and the hooks. `CLAUDE.md` gets an `@AGENTS.md` import, since
Claude Code reads a plain `AGENTS.md` only when there is no `CLAUDE.md`.

**Headless runs.** `claude -p` starts in a mode that denies tool calls nothing has allowed, so a run can
exit 0 having done nothing: pass the permission mode and the allowed tools. The full command is in
[`templates/runner/local.md`](../templates/runner/local.md) (your own machine) and
[`templates/runner/github-actions-claude.yml`](../templates/runner/github-actions-claude.yml) (CI with
a `claude setup-token` OAuth token in `CLAUDE_CODE_OAUTH_TOKEN`).

**Subscription only.** No path bills a metered API key; `runner-setup.sh` refuses to start when
`ANTHROPIC_API_KEY` is set, since it outranks the subscription login. Anthropic does not allow
third-party products to offer claude.ai login or rate limits; your own repo on your own subscription is
not that case, but the Pro and Max limits assume ordinary, individual use
([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)). Zero Data Retention,
HIPAA and CMEK organizations cannot use cloud sessions
([Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)).

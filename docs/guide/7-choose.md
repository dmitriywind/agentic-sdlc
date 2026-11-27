# 7. Choose your setup
<!-- group: Adopt -->

Answer the questions below. The chooser writes your `init` command, the settings for
`.agents/binding.yml` and the scheduler template, and warns you about combinations that do not work.
You can change every answer later.

<!-- viz: setup -->

<details>
<summary>Compare the profiles</summary>

| `profile` | Pick it when | Agents run on | Identities |
|---|---|---|---|
| `individual` | One person on a Claude subscription. | Claude Code on the subscription. No API key. | One (default) |
| `organization` | You want a separate review account that no implementer holds. | Claude Code on the subscription. No API key. | Two (required) |

</details>

<details>
<summary>Compare one identity and two</summary>

| | One identity (default for individual) | Two identities (required for organization) |
|---|---|---|
| Accounts | Yours. On a Claude cloud routine, the routine's GitHub login. | An implementer account and a separate review app. |
| Who reviews | `review/review` in the cycle, as a fresh agent context. | `review/review` in a separate review run that holds the review token. |
| Review status | CI posts it from the report `forge verdict` publishes. | `forge verdict` posts it as the review app, and approves. |
| Runs to schedule | One: the cycle. | Two: the cycle, then the review run (`review-prompt.md`). |
| Full-lane approval | You add the approval label after the latest push, or a collaborator approves it. | A human approves the latest commit. |
| What it proves | The review is a separate agent context, not a separate account: the branch rules cannot prove an agent did not post its own review status. | No implementer can post the review status or approve its own change. |

</details>

<details>
<summary>Compare where the cycle runs</summary>

| Runtime | Pick it when | Limits |
|---|---|---|
| Claude cloud routine | No machine of your own; subscription usage. | Board: GitHub issues (a GitHub Project can show them through org issue fields). Docker available; `commands.verify` still runs in CI as the gate. At most hourly. |
| GitHub Actions | You want the cycle in your repo's CI. | A subscription token (`CLAUDE_CODE_OAUTH_TOKEN`) in a secret. Hosted runners: $12 of compute a month on Free (about 2,000 minutes); a self-hosted runner is free. A `setup-token` lasts one year. |
| Your own machine | Code, tools or a network only your machine reaches. | No sandbox: opt in with `sandbox: local` and `AGENTIC_SDLC_LOCAL=1`. The machine must be on. |

</details>

<details>
<summary>Compare one repo and many</summary>

| Setup | Board | Settings |
|---|---|---|
| One repo | The repo's issues. | Nothing extra. |
| Many repos, one hub repo | The hub repo's issues. | Each repo sets `board.scope.label: repo:<name>`; one repo sets `home: true` and lists every label in `repos`. |

</details>

Next: [8. Install](8-install.md).

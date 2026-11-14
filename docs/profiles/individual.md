# Profiles: individual and individual-api

## Who they are for
One person or a small team.

- `individual`: agent subscriptions only. No API keys. Nothing stored outside the repo and the board.
- `individual-api`: the same subscription for the cycle, plus API keys for some stages: managed
  agents, webhook bots or hosted coding agents.

Both run as **one identity** by default: the factory acts as your own forge account.

## Set it up
```bash
npx --no agentic-sdlc init --profile individual --harness <name> --board github-issues --forge github --vcs git
```
Use `--profile individual-api` for the API variant. A Claude cloud routine reaches a `github-issues`,
`jira` or `linear` board, not `github` (Projects v2), and needs `--harness claude --no-plugin`.

## One identity: what it means
GitHub refuses an approving review from a CR's author. With one identity the factory is the author,
so it never approves. The path is:

1. The cycle implements a ticket and opens a draft CR as you.
2. In the same cycle, it dispatches `review-pr` as a subagent with a fresh context. `review-pr` reads
   CI, posts its report and gives no approving review.
3. The report starts CI's `review-gate` job, which posts the `review` status from the report with the
   GitHub Actions token. A cloud session cannot write statuses itself.
4. `init` writes a trunk ruleset that needs no approving review and pins every check to Actions.
5. A Fast-lane CR merges when every required check is green: `review-pr` waits for the `review`
   status, then runs `forge automerge`.
6. A Full-lane CR waits on `human-approval`. A collaborator approves its head, or you merge it as admin.

There is one scheduled job: the cycle. There is no review routine, no review token and no second account.

The trade-off: the review is a separate agent context, not a separate account. CI posts the status,
but the report it reads is written under your account, so the ruleset cannot prove that a
separate agent wrote it. When you need that proof, add a second
identity: set `forge.review_identity` and `forge.options.review_token_env`, and run the review
runtime (`templates/runner/review-prompt.md`). The `organization` profile requires it.

## Binding excerpt
```yaml
profile: individual                              # or individual-api
owners: { product: me, factory: me, bots: [me] } # one identity: the factory runs as you
executors:
  default: { kind: harness, sandbox: cloud }
  # individual-api only, a stage on a managed agent; give its key a name other than ANTHROPIC_API_KEY:
  # implement-spec: { kind: managed, api: claude, agent_env: IMPL_AGENT_ID, environment_env: IMPL_ENVIRONMENT_ID, token_env: MANAGED_API_KEY, sandbox: cloud }
forge:
  adapter: github
  options: { repo: me/app }                      # no token_env: gh's login, or the cloud proxy
  review_identity: ""                            # one identity
  human_approval: full-lane                      # full-lane | always | never
learning:
  enabled: false                                 # learning runs draw plan usage
```
The runner setup fails when `ANTHROPIC_API_KEY` is set, under both profiles: that key outranks the
subscription login and bills the cycle to the API. `validate` warns when an `individual` binding
names an executor kind that needs an API key.

## Recommended runtime per ecosystem
| Ecosystem | Runtime | Guide |
|---|---|---|
| Claude | Cloud routine (`templates/runner/claude-routine.md`) | [claude.md](../ecosystems/claude-code.md) |
| Codex | ChatGPT scheduled task or cloud task | [codex.md](../ecosystems/codex.md) |
| Cursor | Automation (cloud agent on a schedule) | [cursor.md](../ecosystems/cursor.md) |
| Other | CI cron with a headless CLI, or the shell route | [generic.md](../ecosystems/generic.md) |

`individual-api` adds a Claude Managed Agents deployment (`templates/runner/claude-managed-deployment.json`)
for the stages you move to the API.

Read each guide's terms caveat before you put a consumer login in CI. Some vendors say third-party
wrapping is not supported on consumer plans.

## Security checklist
- [ ] The trunk ruleset is imported; on a private repo this needs a paid GitHub plan, else nothing enforces it.
- [ ] The `approval` gate holds `guardrail` factory CRs for the factory owner and Full-lane CRs per `forge.human_approval` (see [forges.md](../forges.md)).
- [ ] Secrets only as env var names in the binding. No values in the repo, board or CR comments.
- [ ] Sandbox: `cloud` or `container`. With `AGENTIC_SDLC_UNATTENDED=1`, `dispatch` refuses `local`.
- [ ] A cloud routine acts as your account. Give its repo access the least scope the vendor allows.

## Versus organization
| | individual, individual-api | organization |
|---|---|---|
| Cost | Plan price (plus metered API stages for individual-api) | Metered API spend, budgeted |
| Identities | One by default | Two, required |
| Executors | individual: `harness`, `command`; individual-api: all | All, on managed agents |
| Traces | None or local files | `traces.uri` on org storage |
| Setup | Minutes | An agent platform, a review app and secrets management |

See [organization.md](organization.md).

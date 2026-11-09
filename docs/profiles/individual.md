# Profile: individual (subscriptions only)

## Who it is for
One person or a small team that pays for agent subscriptions and has no API budget or org platform.
No API keys. Nothing stored outside the repo and the board.

## Set it up
```bash
npx agentic-sdlc init --profile individual --harness <name> --board github --forge github --vcs git
```
Init writes the defaults below and `validate` warns when the binding names an executor kind that needs an API key.

## Binding excerpt
```yaml
profile: individual
owners: { product: me, factory: me, bots: [my-factory-bot] }
executors:
  default: { kind: harness, sandbox: cloud }     # or a local subscription CLI:
  # implement-spec: { kind: command, run: "claude -p \"$(cat {prompt_file})\"", secrets: [AGENTIC_BOARD_TOKEN, AGENTIC_FORGE_TOKEN, CLAUDE_CODE_OAUTH_TOKEN], sandbox: container }
  #   secrets: the only env vars the child gets; never AGENTIC_REVIEW_TOKEN
forge:
  adapter: github
  review_runtime: separate                       # review-pr runs in its own scheduled job, the only one with the review token
  options: { repo: me/app, token_env: AGENTIC_FORGE_TOKEN, review_token_env: AGENTIC_REVIEW_TOKEN }
  review_identity: my-reviewer-account           # a second account or fine-grained token
# traces: omitted (none), or files in the runner's scratch dir
learning:
  every_cycles: 20
  bench_size: 5                                  # small suites
  budget_usd_per_week: 10                        # keep inside the plan's weekly allowance
# agent_command: "<subscription CLI headless command with {model} {prompt_file} {workdir}>"   # bench only
```
Executors: `harness` only, plus `command` for a headless CLI logged in with the subscription.

## Recommended runtime per ecosystem
| Ecosystem | Runtime | Guide |
|---|---|---|
| Claude | Scheduled task in the cloud | [claude.md](../ecosystems/claude-code.md) |
| Codex | ChatGPT scheduled task or cloud task | [codex.md](../ecosystems/codex.md) |
| Cursor | Automation (cloud agent on a schedule) | [cursor.md](../ecosystems/cursor.md) |
| Antigravity | Remote Agent (Pro or Ultra personal account) | [antigravity.md](../ecosystems/antigravity.md) |
| Grok | Grok Bot routine; the CLI scheduler story is thin | [grok.md](../ecosystems/grok.md) |
| Other | CI cron with a headless CLI, or the shell route | [generic.md](../ecosystems/generic.md) |

Read each guide's terms caveat before you put a consumer login in CI. Some vendors say third-party wrapping is not supported on consumer plans.

## Security checklist
- [ ] A separate review token: `review_token_env` belongs to a second account or a fine-grained token, and only the review runtime holds it (`forge.review_runtime: separate`: the runner templates' review job or task runs `review-prompt.md`; the cycle never sees the token).
- [ ] `CODEOWNERS` maps `.agents/**`, `.github/**`, `.claude/**` to the factory owner (see [forges.md](../forges.md)).
- [ ] Secrets only as env var names in the binding. No values in the repo, board or CR comments.
- [ ] Sandbox: `cloud` or `container`. `--unattended` refuses `local`.
- [ ] The bot account has no admin or bypass right on the trunk.
- [ ] A cloud scheduled task acts as your account. Give its repo access the least scope the vendor allows.
- [ ] Trunk protection is on: change request only, green required checks, one approving review.

## What you lose and gain versus enterprise
| | Individual | Enterprise |
|---|---|---|
| Cost | Plan price; usage limits per vendor | Metered API spend, budgeted |
| Executors | `harness`, local `command` | All kinds |
| Review identity | Second account or token | Forge app or bot account |
| Traces | None or scratch files | `traces.uri` on org storage |
| Bench | Small suites | Full suites across models and executors |
| Limits | Vendor rate and run caps; tied to one person | Caps you set and pay for |
| Setup | Minutes | An agent platform and secrets management |

See [enterprise.md](enterprise.md).

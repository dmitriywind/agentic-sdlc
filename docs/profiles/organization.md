# Profile: organization (API keys and managed agents)

## Who it is for
A team or organization that pays per use, wants runs to belong to service identities and not a person,
and wants traces and full benchmarks on its own storage. It always runs on API keys and managed agents,
and always has **two identities**.

## Set it up
```bash
npx --no agentic-sdlc init --profile organization --harness <name> --board jira --forge github --vcs git
```
Init writes the template defaults plus `sandbox: container` for the default executor, a placeholder
`traces.uri`, `forge.options.token_env` and `review_token_env`, and a placeholder `review_identity`.
Replace the placeholder with your review app's login.

## Two identities
- The implementer: a bot account or app whose token (`token_env`) has Commit statuses: no access.
- The reviewer: a GitHub App (`review_identity`, its token in `review_token_env`). Only the review
  runtime (`templates/runner/review-prompt.md`) holds that token. It posts the `review` status and the
  approving review.
- The trunk ruleset needs one approving review and pins every required check to the app that posts it.

So an implementer can never green or approve its own CR. `validate` fails an organization binding
with no `review_identity`.

## Binding excerpt
```yaml
profile: organization
owners: { product: product-lead, factory: factory-lead, bots: [factory-bot] }
executors:
  default: { kind: harness, sandbox: container }
  implement-spec: { kind: managed, api: claude, agent_env: IMPL_AGENT_ID, environment_env: IMPL_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY, sandbox: cloud, secrets: [NPM_TOKEN] }
  review-pr: { kind: managed, api: claude, agent_env: REVIEW_AGENT_ID, environment_env: REVIEW_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY }
mcps:
  docs: { url: "https://docs.example.com/mcp", token_env: DOCS_MCP_TOKEN }
forge:
  options: { token_env: AGENTIC_FORGE_TOKEN, review_token_env: AGENTIC_REVIEW_TOKEN }
  review_identity: factory-review-app[bot]       # the review GitHub App
  human_approval: full-lane                      # full-lane | always | never
traces:
  uri: ".agents/runtime/traces/{run_id}.jsonl"   # init's placeholder; point it at org storage, e.g. s3://my-bucket/agentic/{run_id}.jsonl
learning:
  enabled: true                                  # the template default is false (learning off)
  auto_merge_classes: []                         # add tuning once a bench baseline exists
```
All executor kinds are allowed: `managed`, `webhook`, `assign`, `command`, `harness`. `validate` warns
when no executor is `managed`. See [executors.md](../../skills/sdlc/references/executors.md).

## Recommended runtime per ecosystem
| Ecosystem | Runtime | Guide |
|---|---|---|
| Claude | Managed Agents deployments (cron) or the GitHub Action with an API key | [claude.md](../ecosystems/claude-code.md) |
| Codex | `openai/codex-action` with an API key, or `codex exec` with `CODEX_API_KEY` | [codex.md](../ecosystems/codex.md) |
| Cursor | Cloud Agents API and Automations run as a service account | [cursor.md](../ecosystems/cursor.md) |
| Other | Org job runner with the shell route or the stdio MCP server | [generic.md](../ecosystems/generic.md) |

Mix vendors per stage: the executor entries are per skill, and the bench compares executors like models.

## Security checklist
- [ ] The review app's token is in `review_token_env`, held only by the review runtime, never by the cycle or an implementer.
- [ ] The trunk ruleset requires one approving review and `human-approval`; `review` and `human-approval` are pinned to the review app.
- [ ] Secrets only as env var names. Each stage lists `secrets:`; nothing else is passed.
- [ ] Stage `mcps:` lists only the servers that stage needs.
- [ ] Sandbox `cloud` or `container`; unattended cycles refuse `local` (opt-in only: `AGENTIC_SDLC_LOCAL=1`).
- [ ] The reviewer executor is never the implementer executor of the same CR.
- [ ] CI loads the binding from the target branch and never runs CR code with secrets.
- [ ] Check vendor data terms: some managed agents are not ZDR or HIPAA eligible (see each guide).
- [ ] Moving a skill to another executor is a guardrail change and needs the factory owner.

See [individual.md](individual.md) for the subscription profiles.

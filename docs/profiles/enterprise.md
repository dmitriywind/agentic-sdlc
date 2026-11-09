# Profile: enterprise (APIs and managed agents)

## Who it is for
A team or organization that pays per use, wants runs to belong to a service identity and not a person,
and wants traces and full benchmarks on its own storage.

## Set it up
```bash
npx agentic-sdlc init --profile enterprise --harness <name> --board jira --forge gitlab --vcs git
```
Init writes the defaults below (`sandbox: container` for the default executor).

## Binding excerpt
```yaml
profile: enterprise
owners: { product: product-lead, factory: factory-lead, bots: [factory-bot] }
executors:
  default: { kind: harness, sandbox: container }
  implement-spec: { kind: managed, api: claude, agent_env: IMPL_AGENT_ID, environment_env: IMPL_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY, sandbox: cloud, secrets: [NPM_TOKEN] }
  review-pr: { kind: webhook, url_env: REVIEW_BOT_URL, token_env: REVIEW_BOT_TOKEN }
mcps:
  docs: { url: "https://docs.example.com/mcp", token_env: DOCS_MCP_TOKEN }
forge:
  options: { token_env: AGENTIC_FORGE_TOKEN, review_token_env: AGENTIC_REVIEW_TOKEN }
  review_identity: factory-review-app            # a forge app or bot account with its own token
  review_runtime: separate                       # review-pr runs in its own runtime, the only one with the review token
traces:
  uri: "s3://my-bucket/agentic/{run_id}.jsonl"   # must contain {run_id}
learning:
  every_cycles: 20
  bench_size: 10
  judge_tier: deep
  budget_usd_per_week: 200                       # learning, scoring and bench spend cap
```
All executor kinds are allowed: `managed`, `webhook`, `assign`, `command`, `harness`. See [architecture.md section 7](../../references/architecture.md).

## Recommended runtime per ecosystem
| Ecosystem | Runtime | Guide |
|---|---|---|
| Claude | Managed Agents deployments (cron) or the GitHub Action / GitLab job with an API key | [claude.md](../ecosystems/claude-code.md) |
| Codex | `openai/codex-action` with an API key, or `codex exec` with `CODEX_API_KEY` | [codex.md](../ecosystems/codex.md) |
| Cursor | Cloud Agents API and Automations run as a service account | [cursor.md](../ecosystems/cursor.md) |
| Antigravity | Gemini API Antigravity agent (preview) | [antigravity.md](../ecosystems/antigravity.md) |
| Grok | xAI API with a hosted `agentic-sdlc mcp --http` endpoint; the hosted-agent story is thin | [grok.md](../ecosystems/grok.md) |
| Other | Org job runner plus `mcp --http` behind TLS | [generic.md](../ecosystems/generic.md) |

Mix vendors per stage: the executor entries are per skill, and the bench compares executors like models.

## Security checklist
- [ ] A separate review identity: a forge app or bot with its own token in `review_token_env`, held only by the review runtime (`forge.review_runtime: separate`: a scheduled job or deployment running `review-prompt.md`), never by the cycle or an implementer.
- [ ] `CODEOWNERS` maps `.agents/**`, `.github/**`, `.claude/**` to the factory owner ([forges.md](../forges.md)).
- [ ] Secrets only as env var names. Each stage lists `secrets:`; nothing else is passed.
- [ ] Stage `mcps:` lists only the servers that stage needs.
- [ ] Sandbox `cloud` or `container`; unattended cycles refuse `local`.
- [ ] The hosted MCP endpoint is behind TLS, with `AGENTIC_SDLC_MCP_TOKEN` rotated and a private bind address.
- [ ] The reviewer executor is never the implementer executor of the same CR.
- [ ] CI loads the binding from the target branch and never runs CR code with secrets.
- [ ] Check vendor data terms: some managed agents are not ZDR or HIPAA eligible (see each guide).
- [ ] Moving a skill to another executor is a guardrail change and needs the factory owner.

## What you lose and gain versus individual
| | Enterprise | Individual |
|---|---|---|
| Identity | Service accounts, apps, API keys | A person's subscription |
| Executors | All kinds, per stage | `harness`, local `command` |
| Traces | On your storage, read by scorers | None or scratch files |
| Bench | Full suites across models and executors | Small suites |
| Cost | Metered, can grow; capped by `budget_usd_per_week` and per-run budgets | Flat plan, hard usage limits |
| Setup | Agent platform, secrets, storage, an on-call owner | Minutes |

See [individual.md](individual.md).

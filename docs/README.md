# agentic-sdlc documentation

| Read | For |
|---|---|
| [Components](architecture/components.md) | The parts and how they connect (diagrams). |
| [Flows](architecture/flows.md) | The cycle, review, release and learning flows (diagrams). |
| [Forges](forges.md) | Checks, approval and what each forge enforces natively, by gate, or approximately. |
| [The contract](../references/architecture.md) | Normative. Section 3 ports and gates, executors in `skills/sdlc/references/executors.md`, section 10 runtimes and profiles. |
| [Audit record 2026-11-09](audits/2026-11-09-v2-audit.md) | Why v2 changed after the first audit. Superseded by the contract. |
| [Binding template](../templates/binding.yml) | Every project value, documented. |

## Pick a profile

| Profile | Guide | Pays with |
|---|---|---|
| individual | [profiles/individual.md](profiles/individual.md) | Subscriptions only. No API keys. |
| enterprise | [profiles/enterprise.md](profiles/enterprise.md) | APIs and managed agents. |

## Pick an ecosystem (where the cycle runs)

The factory needs no developer machine. Any scheduler that starts an agent with the repo and
network access runs one cycle. Gates always run in the forge's CI.

| Ecosystem | Guide |
|---|---|
| Claude (Code, scheduled tasks, Managed Agents) | [ecosystems/claude-code.md](ecosystems/claude-code.md) |
| OpenAI Codex | [ecosystems/codex.md](ecosystems/codex.md) |
| Cursor | [ecosystems/cursor.md](ecosystems/cursor.md) |
| Google Antigravity | [ecosystems/antigravity.md](ecosystems/antigravity.md) |
| xAI Grok | [ecosystems/grok.md](ecosystems/grok.md) |
| Anything else (shell, MCP only, vendor MCP tools only) | [ecosystems/generic.md](ecosystems/generic.md) |

Vendor facts were checked against official docs on 2026-11-09 and each carries its source link.
Vendors change fast; re-check before you depend on a limit. "Not documented at the time of
writing" means the official pages read said nothing.

Runner templates live in [`templates/runner/`](../templates/runner/).

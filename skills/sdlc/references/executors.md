# Executors: who runs each stage

The cycle orchestrator routes a ticket to a skill. The binding's `executors` says **who** runs
that skill. The default is the harness's own subagent.

```yaml
executors:
  default: { kind: harness }
  implement-spec: { kind: assign, user: coding-bot }
  review-pr: { kind: webhook, url_env: REVIEW_BOT_URL, token_env: REVIEW_BOT_TOKEN }
  release: { kind: command, run: "my-release-bot --ticket {ticket} --skill {skill}" }
  triage-signal: { kind: managed, api: claude, agent_env: TRIAGE_AGENT_ID, environment_env: TRIAGE_ENVIRONMENT_ID, token_env: ANTHROPIC_API_KEY }
```

| Kind | Start | Result comes back by |
|---|---|---|
| `harness` | A subagent loads `.agents/skills/<skill>/SKILL.md` (or the plugin skill), model by its tier. | The subagent's own board and forge writes. |
| `command` | The CLI runs `run` with `{skill} {ticket} {cr} {workdir} {prompt_file} {mcps_file} {model}` filled in. | Exit code plus the bot's board and forge writes. |
| `webhook` | The CLI POSTs the task (`skill`, `ticket`, `cr`) as JSON to the URL. | The bot's board and forge writes; the next cycle reads them. |
| `managed` | The CLI starts a run on a managed-agent API, shaped by `api`: `claude` (Managed Agents `POST /v1/sessions`), `cursor` (Cloud Agents `POST /v1/agents`), `antigravity` (Gemini Interactions), or `generic` (`POST <endpoint>/sessions`). | Same. The run id goes in the ledger row. |
| `assign` | The CLI assigns the ticket (or CR) to the bot user and adds the skill name as a comment. | Same. |

Every executor entry may also declare `mcps` (names from the binding's `mcps` map; the stage gets
only these), `secrets` (env var names the stage may receive; nothing else is passed), `sandbox`
(`cloud`, `container` or `local`) and `model` (`{ tier }` or `{ id }`). Secrets reach an executor
only when listed, and never through a board or CR comment.

`agentic-sdlc dispatch <skill> [--ticket <id>] [--cr <n>] (at least one; none for improve-factory) [--run <id>] [--run-model <m>] [--workdir <d>] [--unattended]`
posts its marker, starts the executor and prints `{ kind, ref, startedAt }`; for `harness` it prints
the instruction for the orchestrator and starts nothing. The idempotency key is `<ticket, cr or
factory>-<skill>[-<run>][-<CR head sha>]`: a second dispatch with the same key inside
`cycle.dedupe_minutes` prints `{ skipped: true }`. The window catches a double fire. A run has finished when its own done line `<!-- agentic-sdlc:done <key> -->` appears after the
dispatch marker (posted by a bot, or by the `assign` executor's user); other runs' comments never count. `dispatch` hands that line to every executor in its task.
An unfinished run blocks a second dispatch until `stall_minutes`. With
`AGENTIC_SDLC_UNATTENDED=1`, `dispatch` refuses a stage whose sandbox is `local` or unset. The
ledger row records `executor` and `ref`, so the bench and `improve-factory` compare executors as
they compare models.

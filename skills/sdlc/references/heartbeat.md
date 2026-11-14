# Heartbeat

The report step of [Run one cycle](../SKILL.md#run-one-cycle) writes one heartbeat. The heartbeat
is also the run ledger: every run the cycle started is a row in it, and `agentic-sdlc ledger` reads
the rows back.

## Where it goes

- One comment on `heartbeat.ticket`: `agentic-sdlc board comment <heartbeat.ticket> --body-file <f>`.
  The body is the line `<!-- heartbeat -->`, then the JSON in a `json` code fence, then the
  cycle's done line from `dispatch sdlc`.
- Read back with `board comments <heartbeat.ticket> --last <n> --marker "<!-- heartbeat -->"
  --trusted`; `ledger runs` and `ledger summary` read only heartbeats by `owners.bots`.
  `ledger summary` also prints `learning: { due, judge, cyclesSince }`; no skill
  keeps a counter.
- Scores are not written here: `judge-run` posts them with `ledger record`, owners post
  `agentic-sdlc:grade` comments, and `ledger` joins both to the run rows.

## Shape

```json
{
  "at": "ISO-8601 UTC time the cycle ended",
  "factory": "vcs head sha of the trunk the skills were read from",
  "runs": [{ "id": "", "skill": "", "skillHash": "", "ticket": "", "cr": "", "tier": "", "model": "", "executor": "harness", "ref": "", "tokens": 0, "minutes": 0, "outcome": "done", "error": "" }],
  "errors": [{ "step": "", "id": "", "msg": "" }]
}
```

`at`, `factory`, `runs` and `errors` are required; an idle cycle writes `runs: []`. Optional:

| Field | Meaning |
|---|---|
| `kind` | `cycle` (the default), `review` (the review runtime) or `learn` (`improve-factory`). Only `cycle` heartbeats count cycles. |
| `did` | One short line per step result, with the ticket id. |
| `learning` | `lastProposal` and `benchBaseline` (see Learning). Only when `learning.enabled` is true: copied forward from the last heartbeat, changed only by `improve-factory`. |
| `measures` | Board measures over the last 7 days (lead and cycle days, first-pass rate, DORA). Not computed unless the runner prompt asks for them; `ledger summary` prints the ones the rows give. |

`errors` holds one entry per failed step: the step name, the ticket id when there is one, the
cause. The escalation rule counts these. A field the runner could not read is left out and named
in `errors`.

## Runs

One row per run the cycle started with `agentic-sdlc dispatch`, whatever its executor. A run
appears in exactly one heartbeat.

| Key | Value |
|---|---|
| `id` | Unique run id: `<heartbeat at>-<skill>-<ticket>`, or the executor's `ref` when it is unique. |
| `skill`, `skillHash` | The skill name and `agentic-sdlc ledger hash .agents/skills/<skill>` at the run's start. |
| `ticket`, `cr` | The ticket id and CR number the run worked on; empty when it had none. |
| `tier`, `model` | The skill's tier and the model the binding mapped it to; for a non-harness executor, what the executor reported, or empty. |
| `executor`, `ref` | The executor kind and the `ref` that `dispatch` printed (session id, bot run, assignment). |
| `tokens`, `minutes` | What the run reported. A value the executor does not report is left out, never guessed. |
| `outcome` | `done` (its Done-when conditions held), `sent_back`, `failed`, `escalated` or `timeout`. Anything but `done` counts as a failure. |
| `trace` | The run id to fill `traces.uri` with, when the executor stored a full transcript there; left out otherwise. |
| `error` | For a failure: the first line of the cause, as the run or the gate stated it. The ledger clusters on it. |

`score` and `scores` are left out; `ledger` fills them from the run's `<!-- scores -->` comment
([`judge-run`](../../judge-run/SKILL.md)) and grade comments, and a human grade wins.

## Learning

`ledger summary` computes `cyclesSince` (cycles since the last `improve-factory` run) and `due`
(`cyclesSince` has reached `learning.every_cycles` and `learning.enabled` is true).

| Key | Value |
|---|---|
| `lastProposal` | The last factory change proposed: when, its CR, its class, the failure cluster it targets, the run ids that were its evidence, and `open`, `merged`, `rejected` or `closed`. |
| `benchBaseline` | The last bench result of the trunk's factory: the results file, factory revision, model, executor, case count, pass rate and minutes. |

# Heartbeat

The report step of [Run one cycle](../SKILL.md#run-one-cycle) writes one heartbeat. The heartbeat
is also the run ledger: every run the cycle started is a row in it, and `agentic-sdlc ledger` reads
the rows back.

## Where it goes

- One comment on `heartbeat.ticket`: `agentic-sdlc board comment <heartbeat.ticket> --body-file <f>`.
  The body is the line `<!-- heartbeat -->`, then the JSON in a `json` code fence.
- The read-state step reads the last heartbeats with
  `agentic-sdlc board comments <heartbeat.ticket> --last <n> --marker "<!-- heartbeat -->" --trusted`.
  Only the factory's own accounts write heartbeats; one by anyone else is never state, budget or
  evidence.
- Runs and measures over many heartbeats: `agentic-sdlc ledger runs [--since <days>] [--skill <s>]`
  and `agentic-sdlc ledger summary [--since <days>]`. Both read only heartbeats by `owners.bots`.
  `ledger summary` also prints `learning: { due, cyclesSince, spentWeekUsd }`, computed from
  heartbeats and run rows; no skill keeps a counter.
- Scores are not written here. `judge-run` posts them with `ledger record`, as one
  `<!-- scores -->` comment on `heartbeat.ticket`; owners post `agentic-sdlc:grade` comments.
  `ledger` joins both to the run rows.

## Shape

```json
{
  "v": 6,
  "at": "ISO-8601 UTC time the cycle ended",
  "source": "the runner: routine, managed-agent or local",
  "factory": "the trunk revision of the factory this cycle ran",
  "did": ["one short line per step result, with the ticket id"],
  "statusCounts": { "<Status>": 0 },
  "oldestOpen": { "<Status>": { "id": "", "title": "", "days": 0 } },
  "held": [""],
  "items": [{ "id": "", "t": "", "s": "", "d": 0, "sz": "", "p": "", "ln": "", "sh": "", "m": "", "h": false, "k": "", "a": [""] }],
  "crs": [{ "n": "", "t": "", "draft": true, "b": "", "d": 0 }],
  "stalled": [{ "n": "", "checks": [""], "min": 0 }],
  "delivered": { "day": 0, "week": 0 },
  "measures": { "leadDays": 0, "cycleDays": 0, "triageDays": 0, "humanWaitDays": 0, "firstPassRate": 0, "specRework": 0, "escapeRate": 0, "lane": { "fast": 0, "promoted": 0 }, "automationRate": 0, "dora": { "deployFreq": 0, "leadDays": 0, "changeFailRate": 0, "restoreHours": 0 }, "costPerCR": 0, "costPerDelivered": 0, "learningSpendShare": 0, "judgeScoreMedian": 0 },
  "signals": { "open": 0, "<env>": 0 },
  "openCRs": 0,
  "milestones": { "<title>": { "open": 0, "closed": 0 } },
  "runs": [{ "id": "", "skill": "", "skillHash": "", "ticket": "", "cr": "", "tier": "", "model": "", "executor": "harness", "ref": "", "tokens": 0, "cost_usd": 0, "minutes": 0, "outcome": "done", "trace": "", "error": "" }],
  "learning": {
    "lastProposal": { "at": "", "cr": "", "class": "tuning", "skill": "", "error": "", "evidence": [""], "state": "open" },
    "benchBaseline": { "file": "", "factory": "", "model": "", "executor": "", "cases": 0, "passRate": 0, "cost_usd": 0, "minutes": 0 }
  },
  "errors": [{ "step": "", "id": "", "msg": "" }]
}
```

| Field | Meaning |
|---|---|
| `kind` | `cycle` (the default), `review` (the review runtime, one per run) or `learn` (written by `improve-factory`). Only `cycle` heartbeats count cycles. A `review` or `learn` heartbeat holds only `kind`, `factory`, `runs` and, for `learn`, `learning`. |
| `factory` | `vcs head` sha of the trunk the skills were read from. Ties every row to one factory version. |
| `statusCounts` | Board items per Status. |
| `oldestOpen` | Per Status outside `board.done_statuses`: the item longest in it; `days` since its Status last changed. |
| `held` | Open ticket ids labelled `board.labels.human`. |
| `items` | Every board item outside `board.done_statuses`: id, title, Status, days in Status, Size, Priority, Lane, Shipped, milestone, held, kind (`bug` or `feature`), assignees. |
| `crs` | Open change requests: number, title, draft, source change line, days open. |
| `delivered` | Items moved into Done in the last day and the last 7 days. |
| `measures` | The measures below, each over the last 7 days; one the runner cannot read is left out and named in `errors`. |
| `signals` | Open tickets at Signals; of those, the ones with each of `board.env_labels`. |
| `stalled` | Ready CRs not merged after `stall_minutes`: number, the red or missing required check names, minutes waiting. |
| `openCRs` | Count of `crs`. |
| `milestones` | Open and closed tickets per milestone. |
| `runs` | One row per run that ended in this cycle; see Runs. A run appears in exactly one heartbeat. |
| `learning` | `lastProposal` and `benchBaseline`; see Learning. Copied forward from the last heartbeat and changed only by `improve-factory`. |
| `errors` | One per failed step: the step name, the ticket id when there is one, the cause. The escalation rule counts these. |

## Runs

One row per run the cycle started with `agentic-sdlc dispatch`, whatever its executor.

| Key | Value |
|---|---|
| `id` | Unique run id: `<heartbeat at>-<skill>-<ticket>`, or the executor's `ref` when it is unique. |
| `skill`, `skillHash` | The skill name and `agentic-sdlc ledger hash .agents/skills/<skill>` at the run's start. |
| `ticket`, `cr` | The ticket id and CR number the run worked on; empty when it had none. |
| `tier`, `model` | The skill's tier and the model the binding mapped it to; for a non-harness executor, what the executor reported, or empty. |
| `executor`, `ref` | The executor kind and the `ref` that `dispatch` printed (session id, bot run, assignment). |
| `tokens`, `cost_usd`, `minutes` | What the run reported. A value the executor does not report is left out, never guessed. |
| `outcome` | `done` (its Done-when conditions held), `sent_back`, `failed`, `escalated` or `timeout`. Anything but `done` counts as a failure. |
| `score`, `scores` | Left out by the cycle. `ledger` fills them from the run's `<!-- scores -->` comment ([`judge-run`](../../judge-run/SKILL.md)) and grade comments: `score` is `done-conditions` with hard-fact caps applied, `scores` one value per applicable scorer; a human grade wins. |
| `trace` | The run id to fill `traces.uri` with, when the executor stored a full transcript there; left out otherwise. |
| `error` | For a failure: the first line of the cause, as the run or the gate stated it. The ledger clusters on it. |

## Learning

`ledger summary` computes the rest: `cyclesSince` (cycles since the last `improve-factory` run),
`spentWeekUsd` (judge, improve and bench spend in the last 7 days) and `due` (`cyclesSince` has
reached `learning.every_cycles` and the spend is under `learning.budget_usd_per_week`).

| Key | Value |
|---|---|
| `lastProposal` | The last factory change proposed: when, its CR, its class, the failure cluster it targets, the run ids that were its evidence, and `open`, `merged`, `rejected` or `closed`. |
| `benchBaseline` | The last bench result of the trunk's factory: the results file, factory revision, model, executor, case count, pass rate, cost and minutes. |

## Measures

Each has a start and a stop on the board or in the ledger. Days are medians unless the measure is
a rate.

| Measure (`measures` key) | Start | Stop |
|---|---|---|
| Lead time (`leadDays`) | Ticket created. | Shipped = On the last of `product.environments`. |
| Cycle time (`cycleDays`) | Status In progress. | Status Done. |
| Triage time (`triageDays`) | Entered Signals. | A decision: Backlog, Cancelled or Ideas. |
| Human wait (`humanWaitDays`) | `needs-human` added, or entered Ideas. | Label removed, or left Ideas. |
| First-pass rate (`firstPassRate`) | CRs merged. | Share of them with no send-back from review. |
| Spec rework (`specRework`) | Ready, Full lane only. | Count of spec edits after it. |
| Escape rate (`escapeRate`) | A release cut. | Release-failure Signals per release. |
| Lane calibration (`lane`) | Tickets shaped. | Share Fast, and share promoted to Full. |
| Automation rate (`automationRate`) | Tickets moved into Done. | Share of them never labelled `board.labels.human` and with no commit by a human. |
| Deployment frequency (`dora.deployFreq`) | Changes shipped. | Count that reached the last of `product.environments`, per day. |
| Lead time for changes (`dora.leadDays`) | First commit of a CR. | Its change on the last environment. |
| Change failure rate (`dora.changeFailRate`) | Deploys to the last environment. | Share followed by a release-failure Signal or a rollback. |
| Time to restore (`dora.restoreHours`) | A release-failure Signal opened. | Its fix or rollback on the last environment. |
| Cost per merged CR (`costPerCR`) | Sum of `cost_usd` over runs with a `cr`. | Divided by the distinct merged CRs among them. |
| Cost per delivered ticket (`costPerDelivered`) | Sum of `cost_usd` over every run in the last 7 days. | Divided by `delivered.week`. Left out when nothing was delivered. |
| Learning spend share (`learningSpendShare`) | Sum of `cost_usd` over `judge-run`, `improve-factory` and `bench` runs. | Divided by the cost of every run. |
| Judge score (`judgeScoreMedian`) | Runs in the last 7 days with a `score`. | Their median, rescores applied. |

A field the runner could not read is left out and named in `errors`. A change to the shape bumps
`v`; `ledger` reads rows from v5 on (v5 rows have no `scores`, `trace` or rescore `scorer`/`by`).

# 5. The cycle

A scheduler starts one cycle at a time, for example every hour. The cycle is one agent session
that loads the `sdlc` skill. It decides the order of work; subagents do the work.

```mermaid
flowchart TD
  s(["Scheduler starts the cycle"]):::you --> c1["1. Claim the cycle<br/>(another runs? stop)"]:::agent
  c1 --> c2["2. Read the board, open changes,<br/>last heartbeats"]:::agent
  c2 -->|"nothing to do"| idle["Write a short heartbeat, stop"]:::board
  c2 --> c3["3. Triage each Signal"]:::agent
  c3 --> c4["4. Route each ticket<br/>to its next skill"]:::agent
  c4 --> c5["5. A step finished?<br/>Start the next one"]:::agent
  c5 -->|"time left"| c4
  c5 --> c6["6. Write the heartbeat"]:::board
  classDef you fill:#fde68a,stroke:#b45309,color:#111
  classDef agent fill:#c7d2fe,stroke:#4f46e5,color:#111
  classDef board fill:#e2e8f0,stroke:#64748b,color:#111
```

## Route: the order

1. Release requests, and P0 fixes that are ready to release.
2. Change requests a person opened (hand-offs).
3. Tickets In progress (rework, or work that stopped).
4. Ready tickets, from the top, at most `cycle.max_implementations` new ones.
5. Backlog: grooming for tickets with no Priority, then shaping while fewer than `cycle.min_ready` are Ready.
6. Change requests that need a review (with one identity; with two, a separate review run does it).

The full routing table is in [`skills/sdlc/SKILL.md`](../../skills/sdlc/SKILL.md). With learning on,
the cycle also grades the last runs and, every `learning.every_cycles` cycles, proposes one factory
change ([chapter 9](9-learning.md)).

## Rules that keep it safe

| Rule | Why |
|---|---|
| One cycle at a time; a second start stops at step 1. | Two cycles never claim the same ticket. |
| A second dispatch of the same step inside `cycle.dedupe_minutes` is skipped. | A scheduler that fires twice does no harm. |
| Nothing new starts after `cycle.time_budget_minutes`. | The heartbeat is always written before the job times out. |
| A failed step goes into the heartbeat's `errors`; the cycle goes on. | One failure does not stop other work. |
| A step that failed in the last `cycle.failure_limit` heartbeats on the same trunk commit is held for a person. | No endless retries; a factory fix gives the step a fresh start. |

## The heartbeat

Each cycle writes one comment on the heartbeat ticket: when it ran, the trunk commit it read its
skills from, one row per run (skill, ticket, model, outcome) and its errors. The heartbeats are the
run ledger: `agentic-sdlc ledger summary` reads them, and the dead-man check
(`ledger stale --max-hours <h>`) fails when none arrived in time.

Next: [6. Review and merge](6-review-and-merge.md).

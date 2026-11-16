---
name: sdlc
description: The navigator of the agentic SDLC - which step acts next on a ticket or a change request, and one unattended cycle. Load first to run a cycle, to find the next step for a ticket, or before editing a skill.
metadata:
  tier: fast
---

# SDLC

Seven skills, one per phase. A skill's steps are the units that run: `dispatch <skill>/<step>`, or
`dispatch <skill>` for a one-step skill. Every step follows the [contract](references/contract.md).
Statuses and Shipped: [statuses.md](references/statuses.md). Fields, lanes, sub-issues:
[board.md](references/board.md).

| Skill | Phase | Steps |
|---|---|---|
| `plan` | Signals, Ideas, Backlog to Ready | `triage`, `groom`, `shape` |
| `build` | Ready to In review | one |
| `review` | In review to merged, or sent back | `review`, `verify` |
| `ship` | the release line (`product.delivery: release-line` only) | one |
| `learn` | the learning loop (`learning.enabled` only) | `judge`, `improve` |
| `escalate` | any status: classify, ask, hold | one, run inside the calling step |

## Routing

**Tickets.** The first row that matches; a held ticket matches none.

| Ticket | Dispatch |
|---|---|
| Ideas | none: humans only |
| Signals | `plan/triage` |
| Backlog, label `board.labels.release` | `ship` |
| Backlog with children, every child closed | `plan/groom` (it closes the initiative) |
| Backlog with children | none: an initiative is never shaped or built |
| Backlog, no Priority | `plan/groom` |
| Backlog with a Priority, no open blocker, milestone not `board.later_milestone` | `plan/shape` |
| Backlog otherwise | none |
| Ready or In progress, closed by an open CR a person opened | `build` (it hands the ticket to review) |
| Ready | `build` |
| In progress | `build` |
| In review, no open CR closes it | `build` |
| In review, an open CR closes it | that CR's queue row |
| Done, P0, Shipped On <env before last>, no open release request names it | `ship` |
| Done or Cancelled otherwise | none: gates write Shipped |

**CRs.** `forge queue` gives each open CR one `action`. Act on a row whose ticket is at In review
and not held (or released in step 2), and on every row with no ticket (a factory or dependency CR).

| Action | Do |
|---|---|
| `review` | `dispatch review/review --cr <n> [--ticket <ticket>]` |
| `rework` | with a ticket, `dispatch build --ticket <ticket>`; with none, nothing: the verdict is the answer |
| `land` | `forge land <n>`, then as the contract's Land says |
| `sync` | `forge sync <n>`; for a CR a person opened, instead one `note` on the CR asking its author to update it, once per head |
| `escalate` | `escalate` on the ticket (with none, on the CR), with the row's `reason` and `reworks` as evidence |
| `wait` | nothing |

**Learning.** When `ledger summary` shows `learning.judge`: `learn/judge` per unscored run. When it
shows `learning.due`: `learn/improve`.

## Run one cycle

One unattended run by a scheduler. On a fresh runner run `commands.setup` first. Each dispatch
prints how its run goes: run the task it hands you in a fresh context with its own scratch folder,
at most `parallel_agents` at once, or leave a run it started elsewhere. `{ skipped: true }` means
the run is a double fire or still going: leave it.

1. **Lock and read.** `dispatch sdlc --ticket <heartbeat.ticket>`; on `{ skipped: true }` stop and
   write nothing. Then, once each: `board list`, `board holds`, `forge queue`, `ledger summary`, the
   last `cycle.failure_limit` heartbeats (`board comments <heartbeat.ticket> --kind heartbeat --last
   <n> --trusted`) and, when `product.slo` is set, `ledger measures`. Done when you know whether
   `errorBudget.exhausted` is true.
2. **Release holds.** `board release <id>` for every `board holds` row with `replied: true` and for
   the ticket of every `forge queue` row with `release: true`; the ticket routes in step 7 at its
   Status. Done when no such row remains and the ids released are in the heartbeat's `did`.
3. **Idle exit.** When no unheld ticket matches a row that dispatches, no queue row asks for more
   than `wait`, and `ledger summary` shows neither `learning.due` nor `learning.judge`: write the
   idle heartbeat (step 9 with `runs: []`) and stop. Done when it and the done line are posted.
4. **Judge.** For each run in the heartbeats since the last judge that has no `score`, except
   `learn/judge` runs: `dispatch learn/judge --ticket <id> [--cr <n>] --run <run id> --run-model
   <the row's model>` (the heartbeat ticket for a run with neither). `{ skip: true }` goes in
   `errors`. Done when every unscored run is dispatched or named.
5. **Learn.** When `learning.due`: `dispatch learn/improve`. It runs beside the next steps and writes
   its own `learn` heartbeat. Done when dispatched.
6. **Triage.** Every ticket at Signals, in the order `plan/triage` names. Done when each is
   dispatched.
7. **Route.** Dispatch by the Routing tables, in this order: release requests and Done P0 tickets;
   hand-offs of CRs a person opened (no cap); In review tickets and CRs with no ticket, by their
   queue row except `review`; In progress; Ready from the top, at most `cycle.max_implementations`
   claims (no `feature` ticket while `errorBudget.exhausted`); Backlog, groom first, then shape
   while Ready plus the shapes under way hold fewer than `cycle.min_ready`. When a run finishes,
   `board get` its ticket; when it matches a further row, dispatch that in this cycle under the same
   caps. Done when no finished ticket matches a further row, or the time budget is spent.
8. **Review.** `forge queue` again, since this cycle may have opened CRs; act on every `review` row
   not dispatched in this cycle. Done when each is dispatched.
9. **Report.** One `board comment <heartbeat.ticket> --kind heartbeat --body-file <f>`, the body a
   JSON object: `kind: cycle`, `at` (UTC end time), `factory` (`vcs head` sha of the trunk read),
   `runs`, `errors` (`step`, `id`, `msg` per failed step), `did` (one line per result, with its id),
   `learning` copied forward when `learning.enabled`, and `budget: exhausted` when step 1 found it.
   One row in `runs` per run this cycle dispatched, except a run that writes its own heartbeat
   (`learn/improve`, and a review that `dispatch` started elsewhere) (`id`, `skill` as
   `<skill>/<step>`, `skillHash`, `ticket`, `cr`, `tier`, `model`, `executor`, `ref`, `tokens`,
   `minutes`, `outcome`, `error`, `trace`); a value the run did not report is left out. `outcome`
   is `done`, `sent_back`, `failed`, `escalated`, `timeout` or `capped`. Then the cycle's done line: `board comment <heartbeat.ticket> --kind done --ref <key>`, the `key` the
   claim printed.
   Done when both are posted.

Rules for a cycle:

- Every exit after the lock ends the cycle with its done line (step 9): the idle exit, a cycle that only
  held tickets or sent them to a person, and a cycle that failed. Without it the lock holds until the
  time budget passes. Only `{ skipped: true }` writes nothing.
- Route only by the Routing tables. Only `cycle.max_implementations`, `cycle.min_ready`, an
  exhausted error budget and `cycle.max_tokens_per_ticket` hold a routed ticket back. A ticket
  `ledger summary` marks `overBudget: true` gets no further dispatch: run `escalate` (Money) with
  its tokens and runs.
- After `cycle.time_budget_minutes` start nothing new, judge and learn included; wait for the
  running steps, then report.
- A failed step goes in `errors` and the cycle goes on. A run that ended on a cap of its executor is
  `capped`, with the cap in `error`, and counts as failed.
- A step that failed in each of the last `cycle.failure_limit` heartbeats with this `factory` sha is
  not retried: run `escalate` (Repeat) on its ticket. A step with no ticket gets one `board comment
  <heartbeat.ticket> --kind ask` to `owners.factory` instead: no hold. A factory change gives it a
  fresh start.

## Editing skills

- Plain short sentences. A rule has one home; elsewhere a pointer, never a copy. Words come from the
  contract.
- A skill holds process only: project values are binding keys, mechanism is the CLI's, domain rules
  live in the docs the agent card routes to.
- A step file points to the contract, lists numbered steps each ending on a checkable **Done when**,
  then Rules. State the behaviour wanted, not the one banned.
- New rules come only from `learn/improve`. Any change to skill text needs the Factory owner.

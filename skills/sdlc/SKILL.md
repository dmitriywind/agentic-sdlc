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

The routes are data: [routes.yml](routes.yml). Which step a ticket or a CR takes, the order of the
work, the caps and the guards live there and nowhere else. `agentic-sdlc next` reads the board,
`board holds`, `forge queue` and `ledger summary` once and applies them; `next --ticket <id>` gives
one ticket's next step.

## Run one cycle

One unattended run by a scheduler. On a fresh runner run `commands.setup` first.

1. **Lock.** `dispatch sdlc --ticket <heartbeat.ticket>`. On `{ skipped: true }` stop and write
   nothing. Done when the claim is printed.
2. **Next.** `agentic-sdlc next --idle-exit`, its output saved to `next.json`. When it prints
   `idle: true` it has posted the heartbeat and the done line: stop. Done when you hold its output.
3. **Release.** `board release <id>` for every id in `holds`. Done when each is released or in
   your errors.
4. **Work.** Act on each `work` entry in order; when a dispatched run finishes, start the next
   `later` entry. An entry whose step the navigator runs itself:
   - `land`: `forge land <cr>`, then as the contract's Land says.
   - `sync`: `forge sync <cr>`.
   - `note`: one `forge comment <cr> --kind note --ref <head>` asking its author to update the CR.
   - `escalate`, `ask`: follow the `escalate` skill with the entry's `trigger` and `reason`; `ask`
     is one `board comment <heartbeat.ticket> --kind ask` to `owners.factory`, no hold.

   Any other step: `dispatch <step>` with the entry's `--ticket`, `--cr`, and for `learn/judge`
   `--run` and `--run-model`. Run the task it prints in a fresh context with its own scratch
   folder, or leave a run it started elsewhere; `{ skipped: true }` or `{ skip: true }` goes in
   your errors. When a run finishes, `next --ticket <its ticket>` and act on what it gives, under
   the caps the first `next` applied (`cycle.max_implementations` claims in all). Done when every
   entry is acted on, or the time budget is spent.
5. **Review.** `next` again, since this cycle may have opened CRs; dispatch each `review/review`
   entry not dispatched in this cycle. Done when each is dispatched.
6. **Report.** Write `report.json`: `runs`, one row per run this cycle dispatched (`id`, `skill` as
   `<skill>/<step>`, `ticket`, `cr`, `ref`, `tokens`, `minutes`, `outcome`, `error`, `trace`, as
   the run reported them; `outcome` is `done`, `sent_back`, `failed`, `escalated`, `timeout` or
   `capped`), except `learn/improve` and a review `dispatch` started elsewhere; `errors` (`step`,
   `id`, `msg` per failed step); `did` (one line per result, with its id, released holds
   included). Then `ledger heartbeat --file report.json --next next.json`. Done when
   it prints the heartbeat and the done line.

Rules for a cycle:

- Every exit after the lock ends with `ledger heartbeat` (step 6): a cycle that only held tickets,
  sent them to a person, or failed. Without it the lock holds until the time budget passes. Only
  `{ skipped: true }` writes nothing; `next --idle-exit` writes it for the idle exit.
- Route only by `next`. Never dispatch a ticket it did not give, and never skip one it gave.
- After `cycle.time_budget_minutes` start nothing new; wait for the running steps, then report.
- A failed step goes in `errors` and the cycle goes on. A run that ended on a cap of its executor is
  `capped`, with the cap in `error`, and counts as failed.

## Editing skills

- Plain short sentences. A rule has one home; elsewhere a pointer, never a copy. Words come from the
  contract.
- A skill holds process only: project values are binding keys, mechanism is the CLI's, domain rules
  live in the docs the agent card routes to. A route is a row of `routes.yml`.
- A step file points to the contract, lists numbered steps each ending on a checkable **Done when**,
  then Rules. State the behaviour wanted, not the one banned.
- New rules come only from `learn/improve`. Any change to skill text needs the Factory owner.

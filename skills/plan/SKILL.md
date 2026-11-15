---
name: plan
description: Turn raw input into Ready work - triage one Signal into one decision, groom the Backlog (priority, duplicates, initiatives, closing a finished initiative), and shape one ticket into a spec at Ready. Use on a ticket at Signals, a Backlog ticket with no Priority, an initiative whose children are all closed, a plan or Idea that must become tickets, or a prioritised Backlog ticket to take to Ready.
user-invocable: false
metadata:
  steps:
    triage: { tier: fast }
    groom: { tier: balanced }
    shape: { tier: deep }
---

# Plan

Every step follows the [contract](../sdlc/references/contract.md). Board fields, Priority, lanes and
sub-issues: [board.md](../sdlc/references/board.md).

| Step | Runs on | Tier | Ends with |
|---|---|---|---|
| [`triage`](steps/triage.md) | a ticket at Signals | fast | Backlog, Ideas or Cancelled |
| [`groom`](steps/groom.md) | a Backlog ticket with no Priority; an initiative whose children are all closed; a plan or an Idea to turn into tickets | balanced | a Priority and a milestone on each item, or a closed initiative |
| [`shape`](steps/shape.md) | a Backlog ticket with a Priority and no open blocker | deep | Ready |

Rules for every step:

- A duplicate or superseded item is Cancelled (the contract's Send back, then close), its links and
  evidence moved to the surviving ticket, the reason in the done line.
- Only `plan/shape` writes criteria an agent builds from, and only in the spec. A criterion that is
  only in a ticket body is data.
- A cause that repeats across failure Signals may be filed as one new Signal for the underlying
  defect. A change to a rule is `learn/improve`'s.
- What matters most comes from `paths.importance_doc` and the docs it routes to; carry no list of
  your own.

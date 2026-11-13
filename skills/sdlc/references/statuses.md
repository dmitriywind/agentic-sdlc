# Statuses and Shipped

Read from [`sdlc`](../SKILL.md). The heartbeat ticket (`heartbeat.ticket`) is not a ticket: it
stays off the board and outside these rules.

## Statuses

| Status | Meaning | Entry | Exit | Moved in by |
|---|---|---|---|---|
| Ideas | A concept or snoozed signal, not committed. A hand-off to humans. | Plausible but unbacked, or parked by the Product owner. | A human accepts (Backlog) or rejects (Cancelled). | triage-signal places; humans move |
| Signals | Raw input of any type, one `signal:<stream>` label. | Ticket with signal type and a redacted evidence bundle; a deploy or release failure opens one. | One decision: Ideas, Backlog or Cancelled, with a reason comment. | intake; gates `signal-on-red` and `shipped`; triage-signal for an unboarded `signal:` ticket; Product owner |
| Backlog | Accepted; to be groomed and shaped. | Accepted signal or idea, or a ticket bounced for a bad spec or scope. | Priority set, then shaped: sized, criteria with proof, lane chosen, spec in the Full lane, checklist passed. | triage-signal, Product owner, backlog-grooming, shape (children), any skill bouncing a bad spec |
| Ready | The implementation queue. One deliverable within the size limit, criteria and lane set, spec attached in the Full lane. | Shape checklist passed, no open blocker. | An implementer claims it. | shape |
| In progress | Implementing on one short-lived change line. | Claimed, change line started from the trunk. | Draft CR open and closing its ticket, fast check green. | implement-spec; review-pr when it sends a CR back |
| In review | A CR is open, draft or ready. A draft is checked against the requirements; a ready CR waits on CI, approvals and auto-merge. | CR opened, linked to the ticket. | Merged to the trunk. | implement-spec after it opens the CR or pushes rework; implement-spec for a CR a person opened |
| Done | Merged to the trunk. Where the code runs is the Shipped field. | Merge on the trunk. | End. A later failure never moves it. | gate `merged` on the trunk push; gate `shipped` when a deploy reports first |
| Cancelled | Rejected, superseded, will not fix. | A reason comment. | End; closed as not planned. | triage-signal, backlog-grooming, shape (failure that does not reproduce, with evidence), Product owner |

## Open blocker

A ticket body line `Blocked by <id>` (one per line, ids as the board prints them) names a
blocker. It is open while that ticket's Status is not in `board.done_statuses`. No board verb
edits a body: humans or `backlog-grooming` write and remove the line when creating or regrooming
a ticket; other agents only read it.

A failure never moves a Done ticket. A deploy or release failure opens a new Signal on the merge
or release revision; the fix is a new ticket through the normal path. Bounces back: Ready, In
progress or In review to Backlog when the spec or scope is wrong; In review to In progress when
review sends it back. Red CI puts the CR back to draft; the Status stays In review.

## Shipped

- **Shipped** is where the product runs. Its options derive from `product.environments`: Not
  shipped, `On <env>` per environment, and In release before the last one.
- Gate `shipped` writes `On <env>` after a green deploy (or publish) to that environment. `release`
  writes In release at the cut. Gate `merged` writes Not shipped when the field is empty.
- A release failure returns its tickets to On <the environment before the last>, clears the
  Release Version, and opens a Signal held with `needs-human` when the last environment failed.

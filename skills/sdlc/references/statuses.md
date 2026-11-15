# Statuses and Shipped

Follow the [contract](contract.md). The statuses are `board.statuses`.

## Statuses

| Status | Meaning | Exit | Moved in by |
|---|---|---|---|
| Ideas | A concept or a snoozed signal, not committed. | A human accepts (Backlog) or rejects (Cancelled). | `plan/triage` places; humans move |
| Signals | Raw input with one `signal:<stream>` label and a redacted evidence bundle. | One decision: Ideas, Backlog or Cancelled. | intake; the gate that files a Signal for a red trunk or release run, and gate `shipped`; `plan/triage` for an unboarded `signal:` ticket |
| Backlog | Accepted; to be groomed and shaped. | Ready, once shaped. | `plan/triage`, `plan/groom`, `plan/shape` (children), any step that sends a ticket back, the Product owner |
| Ready | The build queue: one deliverable within the size limit, criteria, lane and spec set. | `build` claims it. | `plan/shape` |
| In progress | Built on one change line. | A draft CR closing it, fast check green. | `build` |
| In review | An open CR closes it. | Merged to the trunk. | `build` |
| Done | Merged to the trunk; where it runs is Shipped. | End. A later failure never moves it. | gate `merged`; gate `shipped` when a deploy reports first; `plan/groom` for an initiative |
| Cancelled | Rejected, superseded, will not fix; closed as not planned. | End. | `plan/triage`, `plan/groom`, `plan/shape`, the Product owner |

A failure never moves a Done ticket: a deploy or release failure opens a new Signal, and the fix is
a new ticket. Going back is the contract's Send back: to Backlog when the spec or scope is wrong, to
In progress for rework.

## Open blocker

A ticket body line `Blocked by <id>` (one per line) names a blocker. It is open while that ticket's
Status is not in `board.done_statuses`. Humans or `plan/groom` write and remove the line; other
steps only read it.

## Shipped

- **Shipped** is where the product runs. Its options derive from `product.environments`: Not
  shipped, `On <env>` per environment, and In release before the last one.
- Gate `merged` writes Not shipped when the field is empty; gate `shipped` writes `On <env>` after a
  green deploy (or publish); `ship` writes In release at the cut. `product.delivery: continuous` has
  no In release.
- A rollback reported to gate `shipped` steps the tickets not in the running revision back one
  environment. A release failure returns its tickets to On <the environment before the last> (Not
  shipped with one environment), clears the Release Version, and opens a held Signal when the last
  environment failed. The Status never changes.

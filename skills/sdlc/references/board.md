# Board, lanes and sub-issues

Follow the [contract](contract.md).

## Fields and labels

- **Views**: Board (Signals to Done; Done shows 14 days, grouped by Shipped), Signals (by
  `signal:<stream>`), Human (Ideas and every held ticket), Release (Done not yet On <the last
  environment>), Roadmap (open work by milestone). A view never changes a Status.
- **Size** is one CR's review burden, not effort, on `sizes`. From the smallest: one behaviour in
  one place; one small behaviour in one area; one complete user path in one domain; a path across
  several areas or a new seam; a capability over many deliverables. Up to `ready_size_limit` may be
  Ready. Only `plan/shape` splits; any step that finds a ticket above the limit sends it back to
  Backlog.
- **Priority** in the order of `priorities`. `plan/triage` sets it on accept, `plan/groom` sets a
  missing one and reorders, the Product owner overrides. The first priority (P0) means the last
  environment is impacted, data, money or security is at risk, or a release is blocked; only
  `p0_setters` set it, with evidence. Ready order: priority, then a ticket that unblocks others,
  then oldest.
- **Labels** are the binding's and no others: `bug` or `feature` on every open ticket, the hold
  label, `board.labels.release` on a release request, one `signal:<stream>` per signal, and one of
  `board.env_labels` on a signal from a deployed environment.
- **Moves** are explicit; the tracker's own automations are off. Read one ticket at a time (`board
  get`); only the navigator lists the board, once per cycle.
- **Milestone**: every open ticket carries one, the phase it ships in; children take the parent's.
  A due date, if any, is the only date. `board.later_milestone` holds accepted nice-to-have work:
  nothing shapes or builds it until `plan/groom` moves it to a dated milestone.
- **Release Version**: set by `ship` before the cut, or by gate `shipped --version` under
  continuous delivery; cleared when a release fails.

## Lanes

- **Fast**: Size at or below `fast_lane_max_size`, no `escalate` trigger fires, and no path in
  `paths.lane_areas` is touched. It merges on the agent review.
- **Full**: everything else, with the full design in the spec; `forge land` reports when a person
  must approve.
- `plan/shape` writes the Lane. `build` or `review/review` promotes Fast to Full with `board set <id>
  lane Full` when a deviation, a trigger, a second failed fix or an unlisted risk shows up, and says
  why in its done line. Nothing demotes.
- Review and CI run in both lanes: the lane changes the amount of design, not the proof.

## Sub-issues

- An initiative stays at Backlog until every child is closed; then `plan/groom` closes it.
- A deliverable is a child or a standalone ticket within the size limit. Depth is at most
  `max_subissue_depth`; a child that grows too large splits into siblings.
- Items that change the same behaviour merge into one deliverable; deliverables toward one outcome
  become children of an initiative; an item above the limit is split into children of itself.
- A parent's progress is the board's sub-issue progress; no move rolls a Status up.

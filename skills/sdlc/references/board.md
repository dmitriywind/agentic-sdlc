# Board, lanes and sub-issues

Read from [`sdlc`](../SKILL.md).

## Board

- **Statuses** are `board.statuses` (see [statuses.md](statuses.md)). **Views**: Board (open work
  from Signals to Done; Done shows the last 14 days, grouped by Shipped), Signals (Status Signals,
  sliced by `signal:<stream>`), Human (Ideas plus every `needs-human` ticket, by Status), Release
  (Done where Shipped is not On <the last environment>, grouped by Shipped, then Release Version),
  Roadmap (open work except Signals and Ideas, grouped by milestone). A view never changes a
  Status. `paths.roadmap_doc` says what each milestone contains.
- **Size** is one CR's review burden, not effort. Up to `ready_size_limit` may be Ready; the
  largest is an initiative. From the smallest: one behaviour in one place; one small behaviour in
  one area; one complete user path in one domain; a path across several areas or a new seam; a
  capability over many deliverables. An item above the limit goes back to
  [`shape`](../../shape/SKILL.md), which splits it; no other skill splits.
- **Priority** in the order of `priorities`. `triage-signal` sets it on accept; `backlog-grooming`
  sets a missing one and reorders; the Product owner overrides. The first means the last
  environment is impacted, data, money or security is at risk, or a release is blocked; only
  `p0_setters` set it, with proof: `triage-signal` on accept, or the Product owner by hand.
  triage also escalates. Ready queue: priority order, then a
  ticket that unblocks others, then oldest.
- **Labels** are the binding's and no others: `bug` or `feature` on every open ticket, the hold
  label, `release` on a release request, one `signal:<stream>` per signal, and one of `board.env_labels` on a signal from a
  deployed environment.
- **Moves** are explicit: the tracker's built-in automations are off. Read one ticket at a time
  (`board get`); never list the whole board, except once per cycle to read state.
- **Milestone:** every open ticket carries exactly one, the phase it ships in. Children inherit the
  parent's. A milestone's due date, if any, is the only date. Release versions stay independent of
  milestones. `board.later_milestone` holds accepted work that is nice to have and has no delivery
  date; nothing shapes or builds a ticket there until `backlog-grooming` moves it into a dated
  milestone.
- **Release Version:** set by `release` before the release line is cut, or by `gate shipped --version`
  under continuous delivery; cleared when a release fails.

## Lanes

- **Fast:** Size at or below `fast_lane_max_size`, no escalation trigger fires, and no path in
  `paths.lane_areas` is touched. The ticket's criteria and a proof list are the spec; there is no
  spec comment. Merges on the agent review.
- **Full:** everything else. It carries a spec comment. It also needs a human approval when
  `forge.human_approval` is `full-lane` or `always`.
- [`shape`](../../shape/SKILL.md) writes the Lane field. `implement-spec` or `review-pr` promotes
  Fast to Full when a deviation, a trigger, a second failed fix or an unlisted risk shows up.
  Nothing demotes.
- Review and CI run in both lanes: the lane changes the amount of design, not the proof.

## Sub-issues

- An initiative is a parent: children inside one milestone; never a spec, change line or CR. It
  stays at Backlog until it closes, and no skill routes it to `shape`'s spec step,
  `implement-spec` or `review-pr`.
- A deliverable is a child or a standalone ticket within the size limit. Depth is at most
  `max_subissue_depth`.
- Items that change the same behaviour merge into one deliverable; separate deliverables toward
  one outcome become children of an initiative; an item above the limit is split into children of
  itself.
- A parent's progress is the board's sub-issue progress; no move rolls a Status up.
  [`backlog-grooming`](../../backlog-grooming/SKILL.md) closes a parent once every child is
  closed: as Cancelled when every child was, else as Done with Shipped the lowest value among its
  Done children.

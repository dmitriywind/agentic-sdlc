---
name: shape
description: Take one Backlog ticket to Ready in one pass - diagnose a failure-born ticket, size and split it, write criteria with a named proof each, choose the lane, write the spec in the Full lane, pass the checklist. Use on a Backlog ticket with a Priority that is not Ready, and no open blocker.
user-invocable: false
metadata:
  tier: deep
---

# Shape a ticket

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). Read the domain docs the agent card
routes to for the touched area before shaping. One pass moves the ticket from Backlog to Ready;
a step already done on the ticket is checked, not redone. A ticket with children is an
initiative (see [Sub-issues](../sdlc/references/board.md#sub-issues)): stop with no comment.

## Steps

1. **Diagnose (failure-born tickets only).** For a ticket made from a failure Signal: reproduce
   the failure, minimise it, list hypotheses, and confirm the root cause with a run. Done when the
   cause is shown by a command and its output, not inferred. If the failure does not reproduce at
   the trunk tip, or no run confirms a cause, stop. Comment the attempts on the ticket and either
   close it as not planned with that evidence (already fixed, or noise), or call
   [`escalate-to-human`](../escalate-to-human/SKILL.md) (Access) when a device or environment is
   missing. Never write a spec from an inferred cause.
2. **Orient.** Open every file and line the ticket cites at the trunk tip and read the code and
   docs it touches. External facts come from primary sources only, cited where used. Done when each
   citation is marked resolved, moved or gone, the files read are listed in the ticket, and the
   item is shown to leave delivered behaviour intact; one that would undo it is an escalation.
3. **Independent read.** Before judging scope (how many parts, what to cut, one defect or three),
   form your own read from the raw facts, then compare it with the first impression. When a second
   agent does this read, give it measured facts in the order they occurred, no causal claim, and
   allow "these are unrelated" and "do nothing" as answers. Done when both reads are written down
   and every disagreement is settled.
4. **Size, milestone and split.** Classify on `sizes`; set the milestone the item ships in (see
   `paths.roadmap_doc`). Above `ready_size_limit`, split vertically: each child is a complete
   user-visible path, shippable and verifiable alone, created as a sub-issue of the original
   (`board create … --parent <id>`), which becomes the initiative and stays at Backlog (see
   [Sub-issues](../sdlc/references/board.md#sub-issues)); children take its milestone and go on the board at
   Backlog. Done when every child is within the limit and has a Status.
5. **Criteria.** Write acceptance criteria in the ticket as plain bullets, never checkboxes: the
   `linkage` gate fails on an unticked box. Each is an observable statement naming its proof kind
   (one of `product.proofs`: test, eval, visual, data-check, computer-use, manual; `computer-use` names a user path an agent drives in a preview of the CR head, so it needs `commands.preview` (without it pick `manual`), and prefer an automated proof when one exists) and the check that will prove it; add what is out of scope. Use the words of `paths.glossary`. A `manual` proof escalates for a human check. Done
   when every criterion is checkable and has a named proof.
6. **Lane.** Write the Lane field (`board set <id> lane <Fast|Full>`). Fast when Size is at or below
   `fast_lane_max_size`, no escalation trigger of
   [`escalate-to-human`](../escalate-to-human/SKILL.md) fires, and no path in `paths.lane_areas` is
   touched; otherwise Full. Call [`escalate-to-human`](../escalate-to-human/SKILL.md) for the
   ticket and record its result as it says (a proceed line, or the hold, which stops this run).
   In the Fast lane the criteria and a proof list in the ticket are the
   spec; each listed proof names its tier, file and rule as `paths.test_standard` defines them. Done
   when Lane is set and the escalate-to-human result is on the ticket.
7. **Spec (Full lane only).** Design from the project's existing seams and patterns first. Prefer
   deep modules: a small interface with much behaviour behind it. Put a seam only where behaviour
   must vary or be tested. A new abstraction needs a stated reason. Add or sharpen a glossary term
   when the design needs one. Write `spec.md` in this shape:
   - Goal and non-goals
   - Affected areas
   - Design
   - Test plan: seams and scenarios in the order they will be written, through public interfaces,
     integration over mocks; each acceptance criterion mapped to a test, with its tier, file
     and rule as `paths.test_standard` defines them
   - Implementation plan: numbered steps, each starting with its first failing test
   - Fix loop (failure-born only): the confirmed cause and how the fix removes it
   - Risks and rollback: how the change is exposed (all at once, behind a flag, or staged by audience) and how it is undone
   - The riskiest step
   - Options not chosen, with the reason
   - Flagged concerns
   - Open questions

   Attach it as one ticket comment (`board comment`) whose first line is `spec_marker`, edited in
   place on later passes. One spec per ticket. Find the existing one with `board comments <id>
   --last 1 --marker <spec_marker> --trusted` (see [`sdlc`](../sdlc/SKILL.md) Trusted comments).
   Done when the comment exists, written by this run's account.
8. **Pass the checklist.** Every acceptance criterion has a named proof (and, in the Full lane, is
   covered by the test plan); open questions is empty; no open blocker; Size within
   `ready_size_limit`; Lane set; `escalate-to-human` returned `proceed`, recorded on the ticket.
   Done when Status is Ready (`board move <id> Ready --only-from Backlog`), or, for a failing item:
   - Open questions not empty: call [`escalate-to-human`](../escalate-to-human/SKILL.md) (Ruling)
     with the questions as the Ask.
   - [Open blocker](../sdlc/references/statuses.md#open-blocker): name it in the ticket comment and
     stop; the routing skips the ticket until the blocker is done.
   - Any other failing item: fix it in this run (split over the size limit, write the missing
     proof or lane).

## Rules

- The spec fits one CR and one comment. A ticket that does not fit is split, never squeezed.
- A sub-issue is never itself a parent; a child that grows too large splits into siblings.
- Look for deepening opportunities in the touched area. A larger finding becomes a new Signal,
  never scope creep in this ticket.
- A hard-to-reverse choice is stated in the spec with its reason; a settled rule goes as one plain
  sentence into its owning doc.
- Escalate when it cannot split without changing scope or a criterion needs a product ruling, plus
  the triggers of [`escalate-to-human`](../escalate-to-human/SKILL.md).

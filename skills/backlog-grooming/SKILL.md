---
name: backlog-grooming
description: Keep the Backlog ordered and coherent - set Priority, merge duplicates, group items under initiatives, cancel superseded work, declutter old Done items. Use on Status Backlog with no Priority, when a plan or conversation must become tickets, or when Done items closed more than 14 days ago are still on the board.
metadata:
  tier: balanced
---

# Groom the backlog

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). What matters most comes from
`paths.importance_doc` and the docs it routes to.

## Steps

1. **Dedupe.** `board list --search "<keywords>"` per item. Done when each item is marked
   new, merge into <id> or duplicate of <id>.
2. **Group.** Items that change the same behaviour or cannot ship apart merge into one surviving
   deliverable; the others are Cancelled with a pointer to it. Separate deliverables toward one
   outcome become sub-issues of an initiative (`board child <parent> <child>`), created or picked,
   inside one milestone. An open parent whose children are all closed is closed: as not planned when
   every child was Cancelled, else as completed (see [Sub-issues](../sdlc/references/board.md#sub-issues)). Done
   when every grouping is settled, before any shape.
3. **Prioritise.** Order by user impact, risk reduction and dependency, blockers first. Set the
   Priority field from `priorities` and the milestone, per `paths.roadmap_doc`. Nice-to-have work
   goes to `board.later_milestone` (see [Board](../sdlc/references/board.md#board)). Done when every unheld
   Backlog item has both.
4. **New work from a plan.** Turn a plan or conversation into tickets: one each
   (`board create … --status Backlog`), shaped by the project's ticket template, label `bug` or
   `feature`. Done when each is on the board.
5. **Declutter Done.** Archive from the board every Done or Cancelled item closed more than 14 days
   ago, except a held one. Small tickets of one theme with no parent first become sub-issues of one
   closed rollup at Done, whose Shipped is the lowest of its children. Archive only; never delete or
   rewrite a ticket. Done when no unheld item closed more than 14 days ago is visible.

## Rules

- Never set the first priority (P0).
- A cause that repeats across failure Signals may be filed as one new Signal for the underlying
  defect. A change to a rule is `improve-factory`'s, never this skill's.
- A decided duplicate or superseded item is Cancelled with a reason comment and closed as not
  planned.
- Escalate when a priority cannot be derived from the docs or two items conflict, plus the triggers
  of [`escalate-to-human`](../escalate-to-human/SKILL.md).

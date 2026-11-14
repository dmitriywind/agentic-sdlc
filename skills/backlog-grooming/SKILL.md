---
name: backlog-grooming
description: Keep the Backlog ordered and coherent - set Priority, merge duplicates, group items under initiatives, cancel superseded work. Use on Status Backlog with no Priority, or when a plan or conversation must become tickets, or when the Product owner moves an Idea to Backlog.
metadata:
  tier: balanced
---

# Groom the backlog

Follow the [common contract](../sdlc/references/contract.md). What matters most comes from
`paths.importance_doc` and the docs it routes to.

## Steps

1. **Dedupe.** `board list --search "<keywords>"` per item. Done when each item is marked
   new, merge into <id> or duplicate of <id>.
2. **Group.** Items that change the same behaviour or cannot ship apart merge into one surviving
   deliverable; the others are Cancelled with a pointer to it. Separate deliverables toward one
   outcome become sub-issues of an initiative (`board child <parent> <child>`), created or picked,
   inside one milestone. An open parent whose children are all closed is closed as
   [Sub-issues](../sdlc/references/board.md#sub-issues) says: every child Cancelled, `board move <id> Cancelled`
   and `board close <id> --reason not_planned`; else `board move <id> Done`, `board set <id> shipped
   <the lowest Shipped among its Done children>` and `board close <id> --reason completed`. Done
   when every grouping is settled, before any shape.
3. **Prioritise.** Order by user impact, risk reduction and dependency, blockers first. Set the
   Priority field from `priorities` and the milestone, per `paths.roadmap_doc`. Nice-to-have work
   goes to `board.later_milestone` (see [Board](../sdlc/references/board.md#board)). Done when every unheld
   Backlog item has both.
4. **New work from a plan or an Idea.** Turn a plan or conversation into tickets: one each
   (`board create … --status Backlog`), shaped by the project's ticket template, label `bug` or
   `feature`. For an item a human moved out of Ideas, rewrite the body (keep the owner's words
   quoted) with outcome, who it is for, success metric, constraints and open questions. When the
   outcome or metric cannot be derived from the item and `paths.importance_doc`, post one comment
   asking the Product owner in plain words, with no jargon, and stop on that item. Done when each
   item has outcome and metric, or one pending question.

## Rules

- Never set the first priority (P0).
- A cause that repeats across failure Signals may be filed as one new Signal for the underlying
  defect. A change to a rule is `improve-factory`'s, never this skill's.
- Tech debt is ticketed only with a stated cost (time lost, incidents, or a blocked outcome) and the
  evidence; without one it stays a comment.
- A change shipped behind a flag or toggle gets a child removal ticket naming the flag and a due
  milestone.
- A decided duplicate or superseded item is Cancelled with a reason comment.
- Escalate when a priority cannot be derived from the docs or two items conflict.

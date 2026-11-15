# Groom the backlog

Follow the [contract](../../sdlc/references/contract.md).

1. **Close a finished initiative.** For an open initiative whose children are all closed: when every
   child was Cancelled, `board move <id> Cancelled --only-from Backlog` and `board close <id>
   --reason not_planned`; else `board move <id> Done --only-from Backlog`, `board set <id> shipped
   <the lowest Shipped among its Done children>` and `board close <id> --reason completed`. Done
   when the initiative is closed, or it has an open child.
2. **Dedupe.** `board list --search "<keywords>"` per item. Done when each item is marked new,
   merge into <id>, or duplicate of <id>.
3. **Group.** Items that change the same behaviour or cannot ship apart merge into one surviving
   deliverable; the others are Cancelled. Deliverables toward one outcome become children of an
   initiative (`board child <parent> <child>`), created or picked, inside one milestone. Done when
   every grouping is settled.
4. **Prioritise.** Order by user impact, risk reduction and dependency, blockers first. Set the
   Priority from `priorities` and the milestone (`board milestone <id> <name>`, `--clear` to drop
   it) per `paths.roadmap_doc`; nice-to-have work goes to `board.later_milestone`. When no doc
   ranks the item, judge it by its own stated impact and set a priority below the first; when the
   board has no milestones, set none. Write or remove `Blocked by` lines when you create or regroom
   a ticket. Done when every unheld Backlog item has a Priority, and a milestone where the board has
   milestones.
5. **New work.** Turn a plan or a conversation into tickets, one each (`board create … --status
   Backlog`), shaped by the project's ticket template, label `bug` or `feature`. For an item a human
   moved out of Ideas, rewrite the body (the owner's words kept as a quote) with outcome, who it is
   for, success metric, constraints and open questions. When the outcome or metric cannot be
   derived from the item and `paths.importance_doc`, post one plain-words question to the Product
   owner on the item and stop on it. Done when each item has outcome and metric, or one pending
   question.

## Rules

- Never set the first priority.
- Tech debt is ticketed only with a stated cost (time lost, incidents, a blocked outcome) and its
  evidence; without one it stays a comment.
- A change shipped behind a flag gets a child removal ticket naming the flag and a due milestone.
- Escalate when two items conflict or an item claims the first priority. Missing docs alone are no
  reason to escalate.

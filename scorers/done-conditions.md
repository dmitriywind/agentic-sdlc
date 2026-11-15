---
name: done-conditions
applies_to: "*"
scale: 0-4
---

# Done conditions

**Question.** Did the run meet every Done-when condition of its skill, as written at the row's
`skillHash`?

**Evidence.** The skill's `SKILL.md` at `skillHash`; the ticket and its trusted comments; the CR,
its diff and checks; the trace when the row has one; for a bench case, its result row.

**Grade.** Each condition met, weak or not met, with a `path:line`, a comment link or a check name
as proof. Anchors: 4 every condition met on the first pass, no finding; 3 every condition met, with
Nits only or after one rework; 2 every condition met in form but one has no proof you can open
(weak); 1 one or more conditions not met, no rule broken; 0 a rule broken, harm done, or the run
worked the wrong ticket or CR. The hard-fact caps in
[`judge-run`](../skills/judge-run/SKILL.md) apply to this scorer: the value is the lower of the
grade and the lowest cap.

Unscorable when the skill file at `skillHash`, the ticket or its spec, or the CR or its checks cannot be opened.

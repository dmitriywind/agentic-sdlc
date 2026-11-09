---
name: done-conditions
applies_to: "*"
tier: fast
scale: 0-4
---

# Done conditions

**Question.** Did the run meet every Done-when condition of its skill, as written at the row's
`skillHash`?

**Evidence.** The skill's `SKILL.md` at `skillHash`; the ticket and its trusted comments; the CR,
its diff and checks; the trace when the row has one; for a bench case, its result row.

**Grade.** Each condition met, weak or not met, with a `path:line`, a comment link or a check name
as proof. 4 every condition met with no finding; 3 met with Nits only; 2 one condition weak or met
only after rework; 1 a condition not met; 0 wrong, harmful or a rule broken. The hard-fact caps in
[`judge-run`](../skills/judge-run/SKILL.md) apply to this scorer: the value is the lower of the
grade and the lowest cap.

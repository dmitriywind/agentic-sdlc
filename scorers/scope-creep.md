---
name: scope-creep
applies_to: [implement-spec, review-pr]
tier: fast
scale: pass-fail
---

# Scope creep

**Question.** Did the run change anything its ticket and spec did not ask for?

**Evidence.** The ticket, its spec comment and acceptance criteria; the CR diff; for `review-pr`,
the findings it raised.

**Fail** when the diff touches a file or behaviour no criterion needs (a refactor, a rename, a
dependency bump, a feature on the side), or a review asks for such a change. A change the spec
names, or one a criterion cannot pass without, passes.

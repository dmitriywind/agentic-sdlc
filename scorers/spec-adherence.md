---
name: spec-adherence
applies_to: [implement-spec, shape]
scale: pass-fail
---

# Spec adherence

**Question.** Does each acceptance criterion have a change and a proof of the kind it names?

**Evidence.** The spec comment (by a trusted author) and its criteria; the CR diff and its new
proofs; the `Required` check on the CR head (the install and verify job); for `shape`,
the ticket body and the criteria it wrote.

**Fail** when a criterion has no change, has a proof of another kind than it names, or the change
does something other than the criterion says. For `shape`: when a criterion cannot be proved, or
names no proof kind.

Unscorable when the spec comment, or the CR diff for `implement-spec`, cannot be read.

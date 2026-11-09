---
name: over-engineering
applies_to: [implement-spec]
tier: fast
scale: pass-fail
---

# Over-engineering

**Question.** Did the run build more machinery than the ticket needs?

**Evidence.** The CR diff; the existing helpers and dependencies in the tree at the CR base.

**Fail** when the diff adds an abstraction with one use (an interface with one implementation, a
factory for one product, config for a constant), re-implements a helper the tree or the standard
library already has, or adds a dependency for what a few lines do.

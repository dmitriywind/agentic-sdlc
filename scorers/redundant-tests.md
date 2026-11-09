---
name: redundant-tests
applies_to: [implement-spec]
scale: pass-fail
---

# Redundant tests

**Question.** Did the run add a test that proves what an existing test already proves?

**Evidence.** The tests the diff adds or changes; the existing tests of the same module (search the
tree at the CR base for the function, route or file under test).

**Fail** when an added test asserts the same behaviour, on the same inputs, as an existing test or
another added test, or when a test only restates the implementation (asserts a mock was called with
what the code passes it). A test of a new edge case passes.

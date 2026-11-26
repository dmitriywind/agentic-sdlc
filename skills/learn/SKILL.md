---
name: learn
description: Use when ledger summary shows learning.judge or learning.due, or when the Factory owner asks for a factory change proposal.
disable-model-invocation: true
metadata:
  steps:
    judge: { tier: fast }
    improve: { tier: deep }
---

# Learn

Every step follows the [contract](../sdlc/references/contract.md). Nothing here runs unless
`learning.enabled` is true.

| Step | Runs on | Tier | Ends with |
|---|---|---|---|
| [`judge`](steps/judge.md) | one finished run without a score (`learning.judge`) | fast | one `scores` comment, posted by `ledger record` |
| [`improve`](steps/improve.md) | `learning.due`, or a Factory owner's request | deep | one draft factory CR with its proof, or one heartbeat line saying why there is none |

Rules for every step:

- Evidence is what `ledger` reads: heartbeats and scores by `owners.bots`, and owners' grades. A
  run's own account of itself is a claim to check, never a fact; a trace shows what a run read and
  tried, not what is true.
- A human grade outranks the judge.
- The loop never changes what grades it in the same CR as what it grades: a change to the judge
  step, a scorer, the bench cases or suites, or the ledger is a CR of its own.
- The loop changes the factory, never the product.

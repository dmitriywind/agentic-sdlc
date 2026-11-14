---
name: judge-run
description: Grade one finished run with the scorers the ledger plans for it, on a model independent of the run, and record the scores. Use when the cycle dispatches it for a run in the last heartbeat or for a bench case result.
user-invocable: false
metadata:
  tier: fast
---

# Judge a run

Follow the [common contract](../sdlc/references/contract.md). `dispatch judge-run --run-model <m>`
already picked a model other than the run's; picking scorers, hard-fact caps, human grades and
recording are `ledger` code. Your part is the grading.

## Steps

1. **Plan.** `agentic-sdlc ledger plan --run <id>`. Done when you hold the applicable scorers, the
   evidence refs (trace, CR, diff, ticket) and the hard-fact cap it prints.
2. **Grade.** For each planned scorer, read its `.agents/scorers/<name>.md` and the evidence it
   names, then answer its question: `0`-`4` or `pass`/`fail` per its `scale`, with one line of
   reason citing a `path:line`, a comment link, a check name or a trace line. Grade the run
   against its skill as written at the row's `skillHash`. Done when `scores.json` holds a value
   and a reason for every planned scorer, in the shape `ledger plan` prints.
3. **Record.** `agentic-sdlc ledger record --run <id> --file scores.json`. It validates names and
   scales, applies the cap and posts the `<!-- scores -->` comment. Done when it exits 0; on exit
   1 fix what it names and record again.

## Rules

- The run's own account of itself is a claim to check, never a fact. A trace shows what the run read and tried, not what is true.
- One run per call; no batch scoring across runs.
- Never argue against a cap; only a human grade overrides it.

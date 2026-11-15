# Judge a run

Follow the [contract](../../sdlc/references/contract.md). `dispatch learn/judge --run-model <m>`
already picked a model other than the run's; choosing scorers, the hard-fact cap and recording are
`ledger`'s. Your part is the grading.

1. **Plan.** `ledger plan --run <id>`. Done when you hold the scorers, the evidence refs (trace, CR,
   diff, ticket) and the cap it prints.
2. **Grade.** For each scorer, read `.agents/scorers/<name>.md` and the evidence it names, then
   answer its question on its `scale` (`0`-`4` or `pass`/`fail`), with one line of reason citing a
   `path:line`, a comment link, a check name or a trace line. Grade the run against its step as
   written at the row's `skillHash`. A scorer whose evidence refs are missing or unreadable is
   `unscorable`, with the reason. Done when `scores.json` holds a value and a reason for every
   scorer, in the shape `ledger plan` prints.
3. **Record.** `ledger record --run <id> --file scores.json`. Done when it exits 0; on exit 1 fix
   what it names and record again.

## Rules

- `unscorable` is for missing evidence only, never a way to avoid a low grade. While a hard fact
  caps the run, `done-conditions` is graded, never `unscorable`.
- One run per call.
- Never argue against a cap; only a human grade overrides it.

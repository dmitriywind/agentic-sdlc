# Shape a ticket

Follow the [contract](../../sdlc/references/contract.md). Read the domain docs the agent card routes
to for the touched area first. One pass takes the ticket from Backlog to Ready; a step already done
on the ticket is checked, not redone.

1. **Diagnose** (a ticket made from a failure only). Reproduce the failure, minimise it, list
   hypotheses, and confirm the root cause with a run. When it does not reproduce at the trunk tip,
   or no run confirms a cause, comment the attempts and either Cancel the ticket with that evidence
   (already fixed, or noise) or escalate (Access) when a device or environment is missing. Done
   when the cause is shown by a command and its output, or the ticket is closed or held.
2. **Orient.** Open every file and line the ticket cites at the trunk tip and read the code and
   docs it touches. External facts come from primary sources, cited where used. Done when each
   citation is marked resolved, moved or gone, the files read are listed on the ticket, and the
   item is shown to leave delivered behaviour intact (one that would undo it is escalated).
3. **Independent read.** Before judging scope (how many parts, what to cut, one defect or three),
   form your own read from the raw facts, then compare it with the first impression. A second agent
   doing this read gets measured facts in the order they occurred, no causal claim, and may answer
   "these are unrelated" or "do nothing". Done when both reads are on the ticket, with one line per
   disagreement saying which read was taken and why, or "no disagreement".
4. **Size and split.** Set the Size on `sizes` and the milestone per `paths.roadmap_doc`. Above
   `ready_size_limit`, split vertically: each child a complete user-visible path, shippable and
   verifiable alone, created with `board create … --status Backlog --parent <id>`; the original
   becomes the initiative and keeps its Priority. Done when every child is within the limit and has
   a Status, and the initiative's run ends here.
5. **Criteria.** Plain bullets, never checkboxes. Each is an observable statement naming its proof
   kind from `product.proofs` and the check that proves it; prefer an automated proof. A
   `computer-use` criterion names a user path driven on a preview of the head, so it needs
   `commands.preview` (else pick `manual`). A `manual` criterion names who checks it
   (`owners.product` unless it names another owner role). Use the words of `paths.glossary`; add
   what is out of scope. Done when every criterion is checkable and names its proof.
6. **Lane.** `board set <id> lane <Fast|Full>` as [Lanes](../../sdlc/references/board.md#lanes)
   says, then run `escalate` for the ticket. Done when the Lane is set and `escalate` returned
   proceed, or it held the ticket and this run stopped.
7. **Spec.** Fast lane: the criteria and a proof list, each proof with its tier, file and rule as
   `paths.test_standard` defines them. Full lane: design from the project's existing seams first;
   prefer deep modules (a small interface, much behaviour behind it); add a seam only where
   behaviour must vary or be tested; give each new abstraction a reason; add a glossary term when
   the design needs one. The Full spec has, in order: goal and non-goals; affected areas; design;
   test plan (seams and scenarios in writing order, through public interfaces, each criterion
   mapped to a test with tier, file and rule); implementation plan (numbered, each step starting
   with its first failing test); fix loop (failure-born only: the confirmed cause and how the fix
   removes it); risks and rollback (how the change is exposed and undone); the riskiest step;
   options not chosen, with the reason; flagged concerns; open questions. Post it with `board
   comment <id> --kind spec --body-file spec.md`; a later pass posts a new one. Done when `board
   comments <id> --kind spec --last 1 --trusted` returns it.
8. **Checklist.** The spec reads back trusted; every criterion has a proof (and, Full, a test in the
   plan); open questions are empty; no open blocker; Size within `ready_size_limit`; Lane set;
   `escalate` returned proceed. Then `board move <id> Ready --only-from Backlog`. A failing item:
   - spec not read back: this run's account is not trusted; escalate (Access) naming `owners.bots`;
   - open questions: escalate (Ruling) with the questions as the ask;
   - an open blocker: name it in the done line and stop;
   - anything else: fix it in this run.
   Done when the ticket is Ready, held, or stopped on a named blocker.

## Rules

- The spec fits one CR and one comment. A ticket that does not fit is split, never squeezed.
- A larger finding in the touched area becomes a new Signal, never scope creep in this ticket.
- A hard-to-reverse choice is stated in the spec with its reason; a settled rule goes as one plain
  sentence into its owning doc.
- Escalate when it cannot split without changing scope, or a criterion needs a product ruling.

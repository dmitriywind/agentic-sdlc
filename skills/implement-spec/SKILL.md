---
name: implement-spec
description: Implement a ticket's spec test first on one short-lived change line and open the draft change request. Use on the top unheld ticket at Status Ready that no one else is assigned to, on a ticket at In progress with no open CR, or when sent back to In progress with findings.
metadata:
  tier: balanced
---

# Implement a spec

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). The spec is the ticket comment whose
first line is `spec_marker` in the Full lane; in the Fast lane, the ticket's criteria and proof list.
Read it with `board comments <id> --last 1 --marker <spec_marker> --trusted` (see
[`sdlc`](../sdlc/SKILL.md) Trusted comments); with no trusted spec, a Full-lane ticket goes back
to `shape`.

## Steps

1. **Claim.** Take the dispatched ticket; with none, the top Ready ticket in queue order that is neither held nor assigned to anyone but this run's executor. Move it
   to In progress (`board move <id> "In progress" --only-from Ready`); the move guard keeps two
   runs off one ticket. A ticket already at In progress with no open CR is worked the same way. A ticket
   at In progress whose open CR closes it is rework: read the newest review-pr report on that CR
   (`forge view <n>`) and fix each Important finding first.
   Done when the board shows In progress.
2. **Branch.** `agentic-sdlc vcs start <name>`, named by `vcs.change_pattern`: it reopens the existing change
   line when one exists (rework uses the CR's source branch name) and otherwise starts from the
   trunk tip. Work in the `workdir` it returns, one per ticket, at most `parallel_agents` at once. Done when
   `vcs head` shows the change line.
3. **Test first.** For each step of the spec's plan (in the Fast lane, the ticket's proof list), in
   order: write one failing proof (test, eval case or check) through the public interface, see it red and keep the red output
   for the CR body, make it green, then refactor. Never test private internals. A fix CR commits its
   failing test first and weakens no assertion. Done when every test in the test plan passes.
4. **Smallest solution.** Ask whether the code needs to exist at all. Reuse the codebase, then the
   standard library, then the platform, then an installed dependency, before writing anything. Fix
   a root cause once, where every caller routes through. Done when no line of the diff can go.
5. **Fast check.** Apply the review-pr default checklist (`../review-pr/references/checklist.md`), then
   `paths.review_checklist` when that file exists, and `paths.test_standard` to your own diff, then
   run `commands.fast_check`. Done when no line of the checklist is breached, the command exits 0
   and `vcs push` has published the change line. The full verify is CI's `Required`
   check.
6. **Draft CR.** `agentic-sdlc forge open --source <change line> --title <t> --body-file <file> --draft`,
   filling `paths.pr_template`: plain words and ticket ids only, the one `Closes <id>` (see
   [`sdlc`](../sdlc/SKILL.md) Branches and releases), what changed, why, how to see it work, and every deviation
   from the spec with its reason. Then `forge view <n>` and read `closes` back. Done when it lists
   exactly this ticket and the ticket shows In review. A CR already open: after the fast check, move
   the ticket to In review.

## Rules

- One ticket, one change line, one CR into the trunk. Never mark the CR ready; review does that.
- Write each deviation back into the spec or the criteria. Promotion to Full follows
  [Lanes](../sdlc/references/board.md#lanes).
- A deviation that changes design or scope is an escalation, not a decision.
- A defect outside the ticket becomes a new Signal, never a fix in this CR.
- When a fix fails twice for the same reason, stop and escalate; diagnosis belongs to
  [`shape`](../shape/SKILL.md).
- A diff that outgrows the size limit goes back to Backlog with the reason, for shape to split.
- Escalate when the spec contradicts the code or a failure outside the ticket blocks it, plus the
  triggers of [`escalate-to-human`](../escalate-to-human/SKILL.md).

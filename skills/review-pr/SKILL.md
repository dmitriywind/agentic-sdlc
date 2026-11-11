---
name: review-pr
description: Validate a draft change request (CR) against its ticket and spec in a fresh context, read CI's `Required` and `proofs-on-base` results, post the review status and approval as the review identity, request a human approval when the class needs one, then mark it ready with auto-merge or send it back. Use on Status In review with a draft CR, including after red CI sends a CR back to draft, on an In review ready CR behind the trunk, on a ready CR whose required check is red or missing past `stall_minutes`, and on a draft factory CR.
metadata:
  tier: balanced
---

# Review a change request

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). The orchestrator starts a separate
reviewer agent; the implementer never reviews its own CR. Read the diff, the ticket and its spec,
not the implementer's notes. You never run the CR's code: no install, test or build command. CI
runs it without secrets and posts `Required` and `proofs-on-base`; you read those.

A factory CR (dispatched with `--cr`, only `paths.factory` changed) has no ticket: step 1 skips
the ticket, step 2 grades the CR's stated target, cause and proof, and findings stay on the CR
(see step 8).

## Steps

1. **Read.** `agentic-sdlc forge view <n>` and `forge diff <n>`; the ticket and its spec comment
   (`board comments <id> --marker <spec_marker> --trusted`). Done when you hold the head and every
   acceptance criterion, and `closes` lists exactly the change line's ticket.
2. **Spec pass.** Grade each acceptance criterion against evidence: DONE, PARTIAL, NOT DONE or
   DEVIATED, with `path:line` or a named proof (test, eval case, visual or data check). A
   criterion without proof is a finding. For a criterion with proof `computer-use`, run
   `agentic-sdlc dispatch verify-ux --ticket <id> --cr <n>` once per head, then grade its
   `<!-- verify-ux -->` comment for this head (`--trusted`). Until that comment appears it is
   pending, not a finding; still missing after `stall_minutes`, it is a finding. A criterion with
   proof `manual` is DONE only when a trusted comment by an owner (`board comments <id>
   --trusted`) confirms it for this head. Otherwise post one ask on the ticket naming the
   criterion and the head sha, only when `board comments <id> --marker "<!-- manual-check
   <criterion> -->"` finds none, and grade it PENDING. PENDING is not a finding and keeps the CR
   draft; after `stall_minutes` with no reply call
   [`escalate-to-human`](../escalate-to-human/SKILL.md) (Sign-off). A pending criterion
   stops the review as step 4 does: no status, no approval; review this head again on the next
   run. A departure from the spec in design is an escalation. Done when every criterion has a row.
3. **Standards pass.** Apply [references/checklist.md](references/checklist.md), then
   `paths.review_checklist` when that file exists (the project's rule wins on a conflict), and
   `paths.test_standard`, and the rules matching the changed paths. Before calling a finding one defect or three, form an independent
   read from the raw facts first. Done when every rule was applied to the diff.
4. **CI results.** From `forge view <n>` checks on the head: `Required` (install and verify) and
   `proofs-on-base` (each new proof fails on the merge base) must be green, and every other
   `forge.required_checks` entry except `review` and `human-approval` must not be red. A check
   still pending: stop and review again on the next run; it is not a finding. One still pending,
   or never reported, longer than `stall_minutes` after the head was pushed: call
   [`escalate-to-human`](../escalate-to-human/SKILL.md) (Access) once, naming the check, and stop.
   For each `forge.planned_checks` entry the repo does not yet supply, the report names it as
   absent; this is no escalation. Done when each is green, pending (stopped), escalated, or named
   absent.
5. **Over-engineering hunt.** One line per finding: `path:line`, tag, what to cut, what replaces
   it. Tags: `delete:` dead code or a speculative feature; `stdlib:` reinvented standard library;
   `native:` what the platform already does; `yagni:` an abstraction with one user; `dep:` an
   unneeded dependency; `shrink:` the same logic in fewer lines. Done when each finding is listed
   or "Lean already." is written.
6. **Report.** One CR comment (`forge comment <n> --body-file <f>`), its first line
   `<!-- review-pr <head sha> -->`: the criterion table, findings
   smallest fix first, each tagged with a pass (bugs, security or compliance) and a severity
   (Important or Nit), with at most 5 Nits, the hunt, the CI results read and the head, and
   the verdict PASS or REMEDIATION REQUIRED. Important is any criterion graded NOT DONE or
   PARTIAL; DEVIATED unless the CR also updates the spec comment to match; any bug, security,
   privacy or compliance finding; and any risk the spec's "Risks and rollback" does not list. Nit
   is everything else, and every hunt line (step 5) is a Nit unless it is also a bug. Nits are
   posted in the report; they never block PASS or cause a send-back. Done when posted.
7. **Decide.**
   - PASS (every criterion proven, no Important finding open, `Required` and `proofs-on-base` green on this
     head), from the review runtime only, as `forge.review_identity`: `forge status <head>
     --context <forge.review_check_name> --state success --description <verdict> --url <report
     link>`, then `forge approve <n>`. Both use `forge.options.review_token_env`, never the
     implementer's token; when it is unset they fail: call
     [`escalate-to-human`](../escalate-to-human/SKILL.md) (Access) and post nothing else.
   - Human approval. When the CR needs one (a Full-lane product CR and `forge.human_approval` is
     `full-lane` or `always`; any product CR when `always`; a `guardrail` factory CR), one CR
     comment asking `owners.product` (for a factory CR, `owners.factory`) to approve the head. The
     `approval` gate enforces it; you never approve for a human.
   - Then `forge ready <n>` and `forge automerge <n>`. Done when the CR is approved by the review
     identity, ready, any human approval is requested, and the ticket still shows In review.
8. **Send back.**
   - Findings (any Important) on a product CR: move the ticket to In progress for
     [`implement-spec`](../implement-spec/SKILL.md).
   - Spec or scope wrong: move it to Backlog with the reason.
   - Findings on a factory CR: the CR stays draft with the report; `improve-factory` reads it as
     `rejected`. Done when the ticket or the CR shows the outcome.
9. **Behind the trunk.** A ready In review CR whose change line is behind the trunk: `forge sync
   <n>`, then on the new head repeat steps 4 and 7 once CI has reported. Done when the review
   status is green on the new head.
10. **Red or stalled gate.** A ready In review CR with a `required_checks` entry red, or missing
    for longer than `stall_minutes`: read the failing check (`forge runs --failed`) and `forge draft
    <n>` (Status stays In review). Cause in the diff or the ticket's scope: move the ticket to In
    progress with the cause. Cause elsewhere (a flake, a broken neighbour): file a new Signal and
    state it on the CR. A gate that never ran at all: call
    [`escalate-to-human`](../escalate-to-human/SKILL.md) (Access). Done when the CR is draft and
    the ticket is at In progress, the Signal is filed, or the ask is filed.

## Rules

- An unlisted risk promotes the Lane to Full ([Lanes](../sdlc/references/board.md#lanes)).
- Two questions only: is the diff correct, and does it meet the ticket.
- A new push clears the review status and the approval; review again on the new head.
- Never rerun a check to green. Rerun failed jobs only for a cause outside the code.
- Mark a CR ready once per review. The one exception: a corrected CR body reaches the checks only
  through draft then ready again, since a rerun keeps the old body.
- Auto-merge on green required checks is the only merge path; never merge by hand.
- Escalate when a risk stays open, plus the triggers of
  [`escalate-to-human`](../escalate-to-human/SKILL.md).

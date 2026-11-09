---
name: review-pr
description: Validate a draft change request (CR) against its ticket and spec in a fresh context, run the bound verify on the head, post the required review status as the review identity, then mark it ready with auto-merge or send it back. Use on Status In review with a draft CR, including after red CI sends a CR back to draft, on an In review ready CR behind the trunk, on a ready CR whose required check is red or missing past `stall_minutes`, and on a factory CR.
tier: balanced
---

# Review a change request

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). The orchestrator starts a separate
reviewer agent; the implementer never reviews its own CR. Read the diff, the ticket and its spec,
not the implementer's notes. A factory CR (only `paths.factory` changed) has no ticket: step 1 skips
the ticket, step 2 grades the CR's stated purpose, and the `skill-regression` gate is a required
check.

## Steps

1. **Read.** `agentic-sdlc forge view <n>` and `forge diff <n>`; the ticket and its spec comment.
   Done when you hold the head and every acceptance criterion, and `closes` lists exactly the
   change line's ticket (see [`sdlc`](../sdlc/SKILL.md) Branches).
2. **Spec pass.** Grade each acceptance criterion against evidence: DONE, PARTIAL, NOT DONE or
   DEVIATED, with `path:line` or a named proof (test, eval case, visual or data check). A criterion without proof is a finding.
   For a criterion with proof `computer-use`, run `agentic-sdlc dispatch verify-ux --ticket <id> --cr <n>`, then grade its `<!-- verify-ux -->` comment and evidence; read only comments whose author is in `owners.bots`. Missing evidence is a finding. A
   departure from the spec in design is an escalation. Done when every criterion has a row.
3. **Standards pass.** Apply `paths.review_checklist` and `paths.test_standard`, and the rules
   matching the changed paths. Before calling a finding one defect or three, form an independent read from the raw
   facts first. Done when every rule was applied to the diff.
4. **Required checks.** Every entry of `forge.required_checks` must be green on the head. For each
   `forge.planned_checks` entry the repo does not yet supply, the report names it as absent; this is
   no escalation. When the repo supplies one, it moves into `required_checks`. Done when each is
   green or named absent.
5. **Over-engineering hunt.** One line per finding: `path:line`, tag, what to cut, what replaces
   it. Tags: `delete:` dead code or a speculative feature; `stdlib:` reinvented standard library;
   `native:` what the platform already does; `yagni:` an abstraction with one user; `dep:` an
   unneeded dependency; `shrink:` the same logic in fewer lines. Done when each finding is listed
   or "Lean already." is written.
6. **Verify.** In a fresh checkout, run `commands.install` first. Then, on the head, alone, with no
   other test run beside it: `commands.light_verify` when every file changed since the last verified
   head (on a first review, `vcs base`) matches `paths.light_verify`, otherwise `commands.verify`.
   Then, in the same checkout and after verify exits, `vcs checkout-tests <base> <changed test
   paths…>` (product code at the merge base, head tests kept) and run only the changed proofs
   that need no browser. Done when verify exits 0 on that exact head and each new proof of new or
   changed behaviour fails on the merge base.
7. **Report.** One CR comment (`forge comment <n> --body-file <f>`): the criterion table, findings
   smallest fix first, each tagged with a pass (bugs, security or compliance) and a severity
   (Important or Nit), with at most a few Nits, the hunt, the verify command and head, and the
   verdict PASS or REMEDIATION REQUIRED.
8. **Decide.**
   - PASS (every criterion proven, no finding open, verify green on this head): as
     `forge.review_identity`, `forge status <head> --context <review_check_name> --state success
     --description <verdict> --url <report link>`. Post verify's result the same way with context
     `verify_check_name`. Then `forge approve <n>`: the approving review the trunk protection
     requires. `forge status` and `forge approve` act with the review identity's credential
     (`forge.options.review_token_env`), never the implementer's; when that variable is unset they
     fail, so call [`escalate-to-human`](../escalate-to-human/SKILL.md) (Access) and post nothing
     else. Then `forge ready <n>` and `forge automerge <n>`. Done when the CR is approved and
     ready and the ticket still shows In review.
   - Findings (any Important): move the ticket to In progress for
     [`implement-spec`](../implement-spec/SKILL.md).
   - Spec or scope wrong: move it to Backlog with the reason.
9. **Behind the trunk.** A ready In review CR whose change line is behind the trunk: `forge sync
   <n>`, verify the new head as in step 6, then post the review status on it and `forge approve <n>`. Done when
   `review_check_name` is green on the new head.
10. **Red or stalled gate.** A ready In review CR with a `required_checks` entry red, or missing
    for longer than `stall_minutes`: read the failing check (`forge runs --failed`) and `forge draft
    <n>` (Status stays In review). Cause in the diff or the ticket's scope: fix it, verify, review
    again. Cause elsewhere: move the ticket to In progress with the cause. A gate that never ran at
    all: call [`escalate-to-human`](../escalate-to-human/SKILL.md) (Access). Done when the CR is
    draft with the fix under way, the ticket is at In progress, or the ask is filed.

## Rules

- An unlisted risk promotes the Lane to Full ([`sdlc`](../sdlc/SKILL.md) Lanes).
- A mistake that appears twice becomes a proposed rule in the report ([`sdlc`](../sdlc/SKILL.md)
  Editing skills).
- Two questions only: is the diff correct, and does it meet the ticket.
- A new push clears the review status and the approval; review again on the new head.
- Red CI: the CR is back in draft (Status stays In review) before any fix is pushed. Find every
  cause, fix once, verify again, push once.
- A failure outside the ticket that blocks verify (a flake, a broken neighbour) becomes a new
  Signal, stated on the CR with its link; CI is then the gate. Never rerun to green. Rerun failed
  jobs only for a cause outside the code.
- Mark a CR ready once per review. The one exception: a corrected CR body reaches the checks only
  through draft then ready again, since a rerun keeps the old body.
- Auto-merge on green CI is the only merge path; never merge by hand.
- Escalate when a risk stays open, plus the triggers of
  [`escalate-to-human`](../escalate-to-human/SKILL.md).

# Review a change request

Follow the [contract](../../sdlc/references/contract.md). A factory or dependency CR has no ticket:
step 1 skips the ticket, and step 2 grades the CR's stated target, cause and proof.

1. **Read.** `forge view <n>` and `forge diff <n>`; the ticket and its spec (`board comments <id>
   --kind spec --last 1 --trusted`). Done when you hold the head and every criterion, and `closes`
   lists exactly the change line's ticket.
2. **Criteria.** Grade each criterion DONE, PARTIAL, NOT DONE or DEVIATED, with `path:line` or a
   named proof. A criterion without proof is a finding.
   - `computer-use`: `dispatch review/verify --ticket <id> --cr <n>` once per head, then grade the
     newest `verify` comment for this head by a bot (`forge comments <n> --kind verify --author
     <each owners.bots entry>`). Until it appears the criterion is PENDING.
   - `manual`: DONE only when the owner it names confirms it for this head on the ticket. Otherwise,
     unless `board comments <id> --kind manual-check --last 1 --trusted` already asks for this
     head, post one `board comment <id> --kind manual-check --ref <head sha>` naming each such
     criterion and its owner; the criterion is PENDING.
   - A PENDING criterion is not a finding: stop with no verdict, and say so in the done line. Past
     its wait in the contract, escalate as the Waits table says.
   Done when every criterion has a grade, or the run stopped on a pending one.
3. **Standards.** Apply `paths.review_checklist` (when the file exists), `paths.test_standard` and the
   rules for the changed paths. Before calling a finding one defect or three, form an independent
   read from the raw facts. Done when each rule has a line: clear, or breached with `path:line`.
4. **CI.** From the checks on the head (`forge view <n>`): the verify check
   (`forge.verify_check_name`) and the check that runs the new proofs on the merge base are green,
   and no other `forge.required_checks` entry but the review status (`forge.review_check_name`) and
   the human-approval status is red. A pending check: stop with no verdict; the queue tracks its
   stall. A red check: stop with no verdict; the queue sends it to rework. Each
   `forge.planned_checks` entry the repo does not supply is named absent in the report. Done when
   every check is green, or the run stopped.
5. **Hunt.** One line per over-engineering finding: `path:line`, a tag, what to cut, what replaces
   it. Tags: `delete:` dead code or a speculative feature; `stdlib:` reinvented standard library;
   `native:` what the platform already does; `yagni:` an abstraction with one user; `dep:` an
   unneeded dependency; `shrink:` the same logic in fewer lines. Done when each is listed or "Lean
   already." is written.
6. **Verdict.** Write the report: the criterion table; findings, smallest fix first, each tagged
   with a pass (bugs, security or compliance) and a severity; the step 3 lines; the hunt; the checks
   read and the head. Important: a criterion NOT DONE or PARTIAL; DEVIATED unless the spec was
   updated to match (then DONE); any bug, security, privacy or compliance finding; any risk the
   spec's risks and rollback do not list (it also promotes the Lane). Nit: everything else, at most
   5, and every hunt line that is not a bug; a Nit never blocks a pass. Then `forge verdict <n>
   --pass|--fail --body-file <f>`: pass when every criterion is DONE, no Important finding is open
   and step 4 was green. On exit 1 naming an Access problem, escalate (Access) and stop. Done when
   the output shows the verdict.
7. **Decide.**
   - Pass: `forge ready <n>`, then land it (the contract's Land).
   - Fail with the spec or scope wrong: send the ticket back to Backlog with the reason.
   - Fail otherwise: nothing more. The queue sends the ticket to rework, or escalates at the cap. A
     factory CR stays draft; its fail verdict is its rejection.
   Done when `forge land` printed its state, the ticket is at Backlog, or the fail verdict stands.

## Rules

- Mark a CR ready once per review. A corrected CR body reaches the checks only through `forge draft`
  then `forge ready` again.
- Never rerun a check to green.
- Escalate when a risk stays open.

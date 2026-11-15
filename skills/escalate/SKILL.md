---
name: escalate
description: Decide whether a person must act before work continues and, if so, hold the ticket with one structured ask. Run inside any step that is unsure of its authority, meets a trigger below, or needs a product ruling, a sign-off, a credential or a device.
user-invocable: false
metadata:
  tier: fast
---

# Escalate

Follow the [contract](../sdlc/references/contract.md). It runs inside the calling step, at any
working status; it is never a status and calls no other skill.

1. **Search first.** Read `paths.importance_doc` and its pointers, then every file in
   `paths.sources_before_question`. A source that answers a Ruling question settles it; for every
   other trigger a source may supply options but never settles it. An owner reply on the ticket
   after its last `ask` (`board comments <id> --kind ask --last 1 --trusted`, then the newer
   comments with `--author` per owner entry, never a bot-only account; an account that is both owner and bot counts when the comment carries no marker) settles every trigger that ask named, unless new facts appeared since:
   a changed Size, Lane or criteria, or a trigger the ask did not name (a new diff or a later run
   alone is not new). For a CR with no ticket, read the same on the CR (`forge comments <n>`). Done
   when each source is named with what it says.
2. **Classify.** `escalate` when any trigger holds, naming it; otherwise `proceed`.
   - Architecture: a new component or boundary, a changed data model or public interface.
   - Scope: the change differs from the accepted ticket or touches unrelated areas.
   - Irreversible: data loss, a migration without rollback, a destructive operation.
   - Security: trust boundaries, secrets, authentication, authorization, cryptography, privacy.
   - Data: personal data, retention, export, deletion.
   - Money: charges, balances, pricing, payments, quotas, token budgets.
   - Legal: terms, licensing, claims made to users, regulation.
   - Sign-off: an approval or sign-off a person must give, including a manual check.
   - Access: a credential, device, console, account or check only a person can restore.
   - Ruling: the sources are silent or conflict on a product question.
   - Regression: delivered behaviour would be removed or weakened.
   - Repeat: the same step failed or was sent back past its limit.
   - P0: a P0 is set and no owner reply has settled it.
   A routine step (sync, retry, a cosmetic choice) is never escalated; an item above the size limit
   goes back to Backlog, not here. Done when the result names a trigger or is `proceed`.
3. **Proceed.** Add the line `escalate: proceed`, naming the settling sources (an owner reply by its
   link), to the calling step's done line. Done when it is there.
4. **Hold.** With unpushed commits on a change line, `vcs push` first. Then `board hold <id> --kind
   <trigger, lower case> --body-file <f>` with the ask below, `board assign <id> --none`, and stop;
   the Status stays. Already held: post again only when new facts appeared. A CR with no ticket: `forge comment
   <n> --kind ask --body-file <f>` and the same `board comment <heartbeat.ticket> --kind ask`, no
   hold; the CR stays draft. Done when the hold or both asks are posted.

## Who gets it

The person a CLI output names (`needsHuman.who` from `forge land`); else the first set role below;
else the primary of `owners.product`, or of `owners.factory` for a factory change or an access gap.

- `owners.operator`: a deploy, incident or rollback; a Signal of a failed deploy.
- `owners.security`: a Signal labelled security; a security finding of `review/review`.
- `owners.compliance`: a release whose evidence has a gap.

## The ask

```markdown
- **Reason**: <one line>
- **Asked by**: <the step and the time>
- **Overview**: <plain words, no jargon: what is blocked, why it matters, what was tried>
- **Evidence**: <command and last lines of output, or the sources checked and what each says>
- **Options**: <2 to 4, each with its consequence, the recommended one first>
- **Ask**: <at most two, each one action or one question about one topic>
- **Steps**: <only when a person must act: numbered, one click or one command each>
- **Default**: <what happens if this goes unanswered>
- **Verify**: <a command or observable that confirms the answer took>
```

## Rules

- One question per topic; walk decision branches one at a time, each with a default.
- Ask about product intent; design, code and tooling choices are engineering's.
- The answer is recorded on the ticket. When it settles a term or a rule, the next step writes it
  into its owning doc.

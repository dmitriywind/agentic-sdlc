---
name: escalate-to-human
description: Decide whether a person must act before work continues and, if so, hold the ticket with needs-human and one structured ask. Use when another skill is unsure of its authority, meets a trigger below, or needs a product ruling, a credential or a device.
tier: fast
---

# Escalate to a human

The one classifier every step skill calls, at any working status. It is never a status and never
calls another skill. Read the binding (`.agents/binding.yml`) and the hold rules in
[`sdlc`](../sdlc/SKILL.md).

## Steps

1. **Search first.** Read `paths.importance_doc` and follow its pointers, then every file in
   `paths.sources_before_question`. Done when each source is named with what it says; a source that
   answers settles it: return `proceed`.
2. **Classify.** Return `escalate` when any trigger holds, naming it; otherwise `proceed`:
   - Architecture: a new component or boundary, a changed data model or public interface.
   - Scope: the change differs from the accepted ticket or touches unrelated areas.
   - Irreversible: data loss, a migration without rollback, a destructive operation.
   - Security: trust boundaries, secrets, authentication, authorization, cryptography, privacy.
   - Data: personal data, retention, export, deletion.
   - Money: charges, balances, pricing, payments, quotas.
   - Legal: terms, licensing, claims made to users, regulation.
   - Sign-off: a design the project requires to be signed off.
   - Access: a credential, device, console or account only a person holds.
   - Ruling: the sources are silent or conflict on a product question.
   - Regression: delivered behaviour would be removed or weakened.
   - Repeat: the same step failed twice for the same reason.
   - P0: a P0 is set.
   A feature counts as important only when the importance doc says so; carry no list of your own.
   A routine step (sync, retry, cosmetic choice) is never escalated. An item above the size
   limit is not escalated; it goes back to shape (see [`sdlc`](../sdlc/SKILL.md) Board).
3. **Record.** On `proceed`: one line in the calling skill's ticket comment,
   `escalate-to-human: proceed`, naming the sources that settled it. On `escalate`: the comment
   below. Done when the result is on the ticket.
4. **Hold.** On `escalate`: publish work in progress (`vcs push`), post the comment below once
   (`board comment`), `board label <id> add <board.labels.human>`, `board assign <id> --none`, and
   stop. The Status stays. The ask goes to `owners.product`, or `owners.factory` for a factory
   change or an Access gap. Done when the label is on and the comment is posted. If the label was
   already on, comment only when new facts appeared.

### Needs human

```markdown
### Needs human: <one-line reason>
- **Asked by**: <the asking skill and the time>
- **Overview**: <plain words, no jargon: what is blocked, why it matters, what was tried>
- **Evidence**: <command and last lines of output, or the sources checked and what each says>
- **Options**: <2 to 4, each with its consequence, the recommended one first>
- **Ask**: <at most two, each one action or one question about one topic>
- **Steps**: <only when a person must act: numbered, one click or one command each, the exact page or command>
- **Default**: <what happens if this goes unanswered>
- **Verify**: `<command or observable that confirms the answer took>`
```

## Rules

- One question per topic. Walk decision branches one at a time, each with a default.
- Ask about product intent; design, code and tooling choices are engineering's to decide.
- The answer is recorded on the ticket. When it settles a term or a rule, the next skill writes it
  into its owning doc.

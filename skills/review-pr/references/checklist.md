# Default review checklist

Yes/no questions about the diff. The project's own checklist wins on a conflict.

## Access

- Is authentication and authorization checked on the server for every new entry point, denying by default (ASVS 5.0 level 1)?

## Input and output

- Is untrusted input validated at the boundary and output encoded for its sink?
- Is every query or command built without string concatenation of input?

## Secrets and logs

- Are secrets and personal data kept out of code, config and logs, and are errors logged with context?

## Dependencies

- Is each new dependency needed, pinned and licence-compatible, with the lockfile changed?

## Data

- Does personal data have a stated purpose and retention, and does deletion still work?

## Model features

Only when the change calls a model (OWASP Top 10 for LLM Applications 2025).

- Is model input from users, documents or tools treated as untrusted (prompt injection)?
- Is model output validated before it reaches a sink?
- Do the model's tools hold least privilege, a human confirming irreversible actions, with no secret or personal data in prompts?

## User interface

Only when the change has UI (WCAG 2.2 AA).

- Is every control keyboard reachable, with visible focus that is not obscured?
- Is text contrast at least 4.5:1 and each target at least 24 by 24 CSS px?
- Is every control labelled, with no drag-only action?

## Reversibility

- Does a migration have a rollback, and a risky change sit behind a flag or staged exposure?

A 'no' is a finding tagged with its pass (security, compliance or bugs).

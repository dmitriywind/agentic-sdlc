# Operating baseline

These are recommendations. The factory enforces only what the binding and the gates enforce; each item
below says so when it is not enforced. All of it uses existing binding keys.

## Team shapes

| Shape | profile | owners | forge.human_approval | Review identity | Assurance |
|---|---|---|---|---|---|
| Solo | individual | product and factory are the same person; bots holds the factory account | `full-lane` | none separate | The factory authors CRs as `owners.bots`, so the owner can approve them. This separation of duties is a compensating control, not independent review. |
| Small team | individual or enterprise | product: the lead; factory: a second engineer | `full-lane` | optional | A second human approves Full-lane CRs; Fast-lane CRs rely on the gates and the agent review. |
| Enterprise | enterprise | product: a product role; factory: a platform team | `always` | a separate `review_identity` | Every product CR gets a human approval plus an independent reviewing identity. |
| Agent-heavy | enterprise | as enterprise, several bots | `always` | separate identity per reviewing agent | Humans approve every CR; use `lane_areas` to keep sensitive paths in the Full lane. |
| Non-developer product owner with a technical steward | individual or enterprise | product: the owner; factory: the steward | `full-lane` or `always` | steward-held | The owner acts only through board comments (trusted replies) and Idea moves. The steward holds `owners.factory`, approves CRs and changes the binding. |

## Repo baseline

- Protected trunk with a merge queue, approval of the last push and required thread resolution.
- Trunk and release rulesets as code (`.github/rulesets/*.json` on GitHub).
- Secret scanning with push protection.
- CODEOWNERS covering `paths.factory` and every `lane_areas` path.
- Actions and dependencies pinned by digest.
- Signed release tags.
- A `SECURITY.md` with a contact.
- OpenSSF Scorecard and dependency advisories feeding `signal:maintenance` and `signal:security`.

## Board baseline

- WIP limits on In progress and In review.
- An aging view, so stale items show.
- A Human view filtered on `needs-human`.
- An SLA on Signals: each is triaged within a stated time.
- A monthly review of Ideas by the Product owner; the factory never touches Ideas.

## Operate in Q4 2026 and 2027 (not enforced yet)

- SLOs per user journey, with an error-budget policy that pauses feature work when the budget is spent
  ([sre.google/workbook](https://sre.google/workbook/table-of-contents/)).
- OpenTelemetry for traces, metrics and logs ([opentelemetry.io](https://opentelemetry.io)).
- Progressive exposure behind flags; each flag has an owner and an expiry, and backlog-grooming files its removal ticket.
- An SBOM (CycloneDX or SPDX) ([cyclonedx.org](https://cyclonedx.org)), SLSA provenance
  ([slsa.dev](https://slsa.dev)) and signatures for every release artifact. Enforced when
  `product.evidence` lists them: the release ready check runs `commands.evidence_check`.
- EU Cyber Resilience Act readiness: reporting duties start on 11 Sep 2026, with an early warning in 24 hours and
  a notification in 72 hours. Name the duty in `SECURITY.md`: triage-signal then escalates each such report at once.
- EU AI Act and accessibility (WCAG 2.2 AA) duties checked through `paths.review_checklist`.
- Blameless postmortems whose actions re-enter the Backlog.
- Track delivery with the DORA measures ([dora.dev](https://dora.dev)).

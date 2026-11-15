---
name: review
description: Validate an open change request against its ticket and spec in a fresh context, publish one verdict for its head, and land it or leave it for rework; drive a preview of the head for criteria whose proof is computer-use. Use on a CR the queue lists with action review, including a factory or dependency CR, and when review dispatches its verify step.
user-invocable: false
metadata:
  steps:
    review: { tier: balanced }
    verify: { tier: balanced }
---

# Review

Every step follows the [contract](../sdlc/references/contract.md).

| Step | Runs on | Tier | Ends with |
|---|---|---|---|
| [`review`](steps/review.md) | a CR the queue lists with action `review` | balanced | a verdict for the head; on pass the CR ready and landed, armed or waiting |
| [`verify`](steps/verify.md) | dispatched by `review/review` for `computer-use` criteria | balanced | one `verify` comment for the head |

Rules for every step:

- The step that built a CR never reviews it; each step here starts from a fresh context.
- Read the diff, the ticket and the spec, not the builder's notes.
- `review/review` never runs the CR's code: no install, test or build command; CI runs it and posts
  checks. `review/verify` runs the head only through the product's own interface, on a preview.
- Two questions only: is the diff correct, and does it meet the ticket.
- A new push clears the verdict; the queue asks for a review of the new head.

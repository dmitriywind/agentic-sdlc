---
name: spec-quality
applies_to: [shape]
scale: 0-4
---

# Spec quality

**Question.** Is the spec comment `shape` wrote one an implementer can build and a reviewer can check: each criterion observable and naming its proof kind, no solution design smuggled in, scope that fits the Size, open questions resolved or escalated?

**Evidence.** The ticket (body, Size, Lane) and the spec comment by a trusted author with its acceptance criteria; the questions it asked and the answers after them; the ticket's later comments, for a criterion an implementer or reviewer had to reinterpret.

**Grade.** Anchors: 4 every criterion is observable and names its proof kind, no design is dictated, the scope fits the Size, every open question is resolved or escalated; 3 the spec is sound with one soft criterion or one stray design hint; 2 two or more criteria are vague, or the scope is a Size too big or too small; 1 a criterion cannot be proved, names no proof kind, or an open question is left to the implementer; 0 the spec dictates the solution, contradicts the ticket, or asks for something other than the ticket.

Unscorable when the spec comment or the ticket cannot be opened.

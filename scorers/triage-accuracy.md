---
name: triage-accuracy
applies_to: [plan/triage]
scale: pass-fail
---

# Triage accuracy

**Question.** Did the triage outcome hold up: the right kind, priority, lane and duplicate call, judged from what happened to the ticket afterwards?

**Evidence.** The triage comment and the labels, Priority and Lane it set; the ticket's later history (`board get`, `board comments`): a reopen, a re-prioritisation or a kind change by an owner, a close as duplicate or not planned, an escalation that found the claim false or the priority wrong. A ticket with no later history passes only when nothing in it contradicts the outcome.

**Fail** when the history shows an owner changed the kind, the priority or the lane the run set, the ticket was reopened, a ticket it called a duplicate was not one (or a duplicate it missed was closed later), or a claim it accepted was closed as not planned or not reproducible. A change that follows new information after the triage passes.

Unscorable when the ticket's history cannot be read.

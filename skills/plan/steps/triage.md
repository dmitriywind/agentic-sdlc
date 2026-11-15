# Triage a signal

Follow the [contract](../../sdlc/references/contract.md). Order: `signal:security` first, then
signals from the last environment of `board.env_labels`, then the oldest. A signal body has four
parts: what, why, constraints, open questions; a missing part is written as "none".

1. **Read.** First put every open ticket with a `signal:<stream>` label of `board.signal_streams`
   and no Status on the board (`board list --label signal:<stream>`, then `board move <id>
   Signals`). Then `board get <id>` and `board comments <id>`. Done when you can state the claim,
   its `signal:<stream>` label and its evidence.
2. **Security.** For a security report, or any signal that describes active exploitation, follow
   `paths.security_policy`: acknowledge once through the contact the report gives, and keep exploit
   detail and personal data out of every ticket. A reporting duty with a deadline in that policy is
   escalated (Legal) at once, naming the deadline. Done when acknowledged, or noted that no contact
   was given, and any deadline is escalated.
3. **Still real.** For a release-failure Signal, first read the failed run (`forge runs --failed`)
   and name the cause; change nothing. Then check the cause against the trunk tip and the changes
   since the reported build. Done when you name the file read or the change that already fixed it.
4. **Duplicate.** `board list --search "<keywords>"`. Done when you name the first ticket or write
   "none".
5. **Repo.** Only with `board.scope.home` true: add the one `board.scope.repos` label of the repo
   whose code the signal is about; when it is another repo's, stop: that repo triages it. Done when
   the ticket has one repo label, or `board.scope` is unset.
6. **Decide.** Exactly one, the reason in the done line:
   - Backlog (accept): `board move <id> Backlog --only-from Signals`, label `bug` or `feature`, the
     Priority, and the earliest open milestone unless the signal says otherwise.
   - Cancelled (duplicate, already fixed with the change named, or noise): the evidence stays.
   - Ideas (plausible but unbacked, or a snooze): place it and stop.
   A request asking "why can't I do X" means X is wanted. Done when the board shows the new Status.

## Rules

- Only the redacted evidence bundle enters a ticket: never raw logs, user rows, tokens or addresses.
- P0 only with evidence of impact in the last environment. Then escalate (P0), naming the
  mitigation that needs no code change (`commands.rollback`, or turning off the change's flag) for a
  person to run first. A P0 ticket's criteria include a regression case and a blameless postmortem
  comment (timeline, cause, how it was detected, what would have caught it earlier, follow-up
  tickets).
- A `signal:maintenance` item (a dependency update, an advisory, an end of life, an expiry) is P0
  only with evidence of exploitation or impact; an advisory with no fix yet is escalated.
- No gate files a security report; this step files it by hand.
- Escalate when the evidence cannot be redacted or real cannot be told from noise.

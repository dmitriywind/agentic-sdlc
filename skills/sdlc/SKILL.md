---
name: sdlc
description: The process map of the agentic SDLC - statuses, who moves what, the needs-human hold, lanes, change lines and which skill acts next. Load first when you start work on a ticket, do not know your next skill, run a cycle, or edit a skill.
metadata:
  tier: fast
---

# SDLC

The one navigator. It says where a ticket stands and which skill acts next; how to do a step lives
in that step's skill. Under Claude Code the plugin names skills `/agentic-sdlc:<skill>` (this one
is `/agentic-sdlc:sdlc`); elsewhere they are plain `<skill>`. Both mean the same skill.

There are three layers:

- **Process: these skills.** Generic and reusable. Every process rule lives here. No project value.
- **Binding: `.agents/binding.yml`.** Every project value: board, statuses, labels, commands, paths,
  owners, model tiers. A project replaces only the binding, never the skills.
- **Ports: the `agentic-sdlc` CLI.** Board, forge and VCS steps are CLI verbs, never a vendor
  command. See [`references/ports.md`](references/ports.md). Repo gates run in CI, not in agents.

**Harness**: the agent product running the cycle (`init --harness`). **Executor**: who runs one
skill (`executors.<skill>.kind`, of which `harness` is one).

## Common contract

Every step skill follows [`references/contract.md`](references/contract.md): words, roles, trust,
the move guard, the hold, the closing comment. It is the one home of those rules.

## Routing

Pick the first row that matches. Skip a held ticket.

| Ticket state | Skill |
|---|---|
| Status Ideas | none; humans only |
| Status Signals | [`triage-signal`](../triage-signal/SKILL.md) |
| Status Backlog with label `board.labels.release` (a release request), not waiting on a Product owner reply to its proposal | [`release`](../release/SKILL.md), dispatched with `--ticket <request>` (`product.delivery: release-line` only) |
| Status Backlog, no Priority; a plan or conversation that must become tickets | [`backlog-grooming`](../backlog-grooming/SKILL.md) |
| Status Backlog with a Priority, no [open blocker](references/statuses.md#open-blocker), not in `board.later_milestone`, no children (an initiative is never routed) | [`shape`](../shape/SKILL.md) |
| Status Ready or In progress, with an open CR a person opened (author outside `owners.bots`) | [`implement-spec`](../implement-spec/SKILL.md): it hands the ticket to review, outside `cycle.max_implementations` |
| Status Ready | [`implement-spec`](../implement-spec/SKILL.md) |
| Status In progress | [`implement-spec`](../implement-spec/SKILL.md) |
| Status In review, no open CR closes it | [`implement-spec`](../implement-spec/SKILL.md): back to In progress |
| Status In review, draft CR | [`review-pr`](../review-pr/SKILL.md) (dispatches [`verify-ux`](../verify-ux/SKILL.md) for `computer-use` criteria) |
| Status In review, ready CR behind the trunk | [`review-pr`](../review-pr/SKILL.md) |
| Status In review, ready CR with no `review` status on its head | [`review-pr`](../review-pr/SKILL.md) |
| Status In review, ready CR whose required check is red, or missing for longer than `stall_minutes` (never `review` or `human-approval`, which wait for a review and a person) | [`review-pr`](../review-pr/SKILL.md) |
| Status In review, otherwise | none; approvals and auto-merge act |
| Draft factory CR (only `paths.factory` changed, change line per `vcs.factory_change_pattern`) | [`review-pr`](../review-pr/SKILL.md), dispatched with `--cr` |
| Open dependency CR (change line `dependabot/` or `renovate/`, no ticket) | [`review-pr`](../review-pr/SKILL.md), dispatched with `--cr` |
| Status Done, a P0 ticket with Shipped On <env before last> and no open release request | [`release`](../release/SKILL.md): it opens the request itself (`product.delivery: release-line` only) |
| Status Done, otherwise | none; gates write Shipped |
| `ledger summary` shows `learning.due` | [`improve-factory`](../improve-factory/SKILL.md) |
| Any working status, authority unclear | [`escalate-to-human`](../escalate-to-human/SKILL.md) |

## Run one cycle

One unattended run by a scheduler. Its numbers are the binding's `cycle` keys. On a fresh runner,
run `commands.setup` first.

The orchestrator only routes, waits and writes the heartbeat. Each work item (one signal's
triage, one shape, one implementation, one judge) goes to its own subagent with its own scratch
folder, at most `parallel_agents` at once. Each starts with `agentic-sdlc dispatch <skill>
--ticket <id>` (`--cr <n>` for a factory CR; no subject for `improve-factory`); the binding's
`executors` says who runs it (see Executors). A second dispatch of the same skill and subject
inside `cycle.dedupe_minutes` prints `{ skipped: true }`: it is a double fire; leave it.

A CR **needs a review** when it is open, a `review-pr` row of the Routing table matches it, and,
for a draft CR, the newest `<!-- review-pr` report on it (`forge comments <n> --last 1 --marker
"<!-- review-pr" --trusted`) is not for its head sha.

In order:

1. **Read state.** First `dispatch sdlc --ticket <heartbeat.ticket>`: when it prints `{ skipped: true }`
   another cycle is running; stop and write nothing. List the board once (`board list`). Read open CRs (`forge list`), the last
   `cycle.failure_limit` heartbeats (`board comments <heartbeat.ticket> --last <n> --marker
   "<!-- heartbeat -->" --trusted`) and `ledger summary`.
2. **Idle exit.** When no unheld ticket matches a Routing row the cycle dispatches (any skill but
   `review-pr`), no held ticket has a trusted owner reply after its last `### Needs human`
   comment, no CR needs a review, and `ledger summary` shows neither `learning.due` nor
   `learning.judge` with an unscored run: write the idle heartbeat (`at`, `factory`, `runs: []`,
   `errors: []`), fire no review, and stop. Done when it is posted.
3. **Judge.** When `ledger summary` shows `learning.judge` (true only when `learning.enabled`): for
   each run in the newest heartbeats since the last judge step that has no `score` yet, except `judge-run` runs, `dispatch judge-run --ticket <id>` (`--cr <n>`; the heartbeat ticket for a
   run with neither) `--run <run id> --run-model <the row's model>`. It prints
   `{ skip: true }` when no independent model exists: name it in this heartbeat's `errors`.
4. **Learn.** When step 1's `ledger summary` shows `learning.due` (due counts cycles, only when
   `learning.enabled`), `dispatch improve-factory`. It runs beside the next steps and writes its own
   `learn` heartbeat, so its row survives a cycle that times out; give it its own executor
   (`executors.improve-factory`) when the bench would outlast the cycle's job timeout.
5. **Triage Signals.** Every ticket at Signals, in the order `triage-signal` names.
6. **Route.** Walk the unheld tickets and dispatch each by the Routing table, in this order:
   - every release request, and every Done P0 the `release` rows match;
   - every Ready or In progress ticket whose open CR a person opened (a hand-off, no cap);
   - every ticket at In progress (rework, or a resumed implementation);
   - Ready from the top, at most `cycle.max_implementations` new claims;
   - Backlog: grooming for items with no Priority; shape while Ready plus the shapes under way hold
     fewer than `cycle.min_ready` tickets.
7. **Report.** Write one heartbeat as [`references/heartbeat.md`](references/heartbeat.md) says. Its
   runs include the judge runs of step 3; the `improve-factory` run is in its own `learn` heartbeat, and
   the review runtime writes a `review` heartbeat for its runs, so every run is in the ledger once.
8. **Review hand-off.** `forge list` again, since this cycle may have opened CRs. Fire the review
   runtime once, as the runner prompt says, only when a CR needs a review. Done when it was fired,
   or no CR needs a review.

The review runtime runs `review-pr`; the cycle never holds the review token and never reviews.

Rules for every step:

- Route only by the Routing table. No cap other than `cycle.max_implementations` and `cycle.min_ready`
  holds a routed ticket back.
- After `cycle.time_budget_minutes`, start nothing new, judge and learn included: wait for the running
  subagents, then report. The next cycle judges the runs that have no score.
  Keep `cycle.time_budget_minutes` below the runner's job timeout, so the heartbeat is always written.
- A failed step goes into the heartbeat's `errors`, and the cycle goes on with the next step.
- A step that failed in each of the last `cycle.failure_limit` heartbeats is not retried: call
  `escalate-to-human` on the step's ticket. A step with no ticket (read state, judge, learn) asks
  `owners.factory` with one comment on the heartbeat ticket, as escalate-to-human step 4 does for a
  run with no ticket: no label, no hold. The heartbeat is always written.

## Executors

The executor kinds, their fields and what `dispatch` prints are defined once, in
[`references/executors.md`](references/executors.md). Every executor
obeys the same skills and gates; a reviewer is never the implementer of the same CR.

## The needs-human hold

- A label (`board.labels.human`), not a status, set by `escalate-to-human` or on a
  last-environment-failure Signal. It applies at Backlog, Ready, In progress and In review, and to
  a Signal.
- A held ticket keeps its Status. No automation moves it, except gate `merged` when its CR merges:
  Done records the merge and the label stays.
- Removing the label is the only release; the next run resumes at the same Status. A trusted owner
  reply after the ticket's last `### Needs human` comment is a release too: the cycle removes the
  label (`board label <id> remove <board.labels.human>`) and routes the ticket, so an owner who only
  comments is never stuck.

## Statuses, board, lanes, gates

- Statuses and Shipped: [`references/statuses.md`](references/statuses.md).
- Board fields, Size, Priority, labels, milestones, Lanes and sub-issues:
  [`references/board.md`](references/board.md).
- Gates, required checks, approval and the In review hand-offs:
  [`references/gates.md`](references/gates.md).

## Branches and releases

- Trunk-based on Git: one trunk (`vcs.trunk`), short-lived change lines matching
  `vcs.change_pattern` in, release lines `vcs.release_prefix` out. No long-lived develop line. With
  release-line delivery, a P0 fix starts release as soon as it is Done with Shipped On <env before
  last>; the Product owner still approves the cut.
- `implement-spec` writes the CR's one `Closes <id>` line; every later reader checks the CR's
  `closes` against its change line.
- A merge to the trunk moves the ticket to Done and deploys the first environment. With
  `product.delivery: release-line` the last environment deploys from a release line after the Product
  owner approves it; with `continuous` every environment deploys from the trunk. Agents never
  approve it.
- The tag is `vcs.tag_prefix` plus the version, created by the release pipeline at success in the
  last environment.
- Every CR gets an agent review from a fresh context. A Full-lane product CR also needs a human
  approval per `forge.human_approval`; a `guardrail` factory CR needs the Factory owner's.

## Editing skills

- Short plain sentences. A rule has one home; elsewhere a pointer, never a copy.
- The agent card routes and never rules: a promise and a pointer, no mechanism.
- A skill holds process only; project values belong in the binding, domain rules in the docs the
  card routes to.
- A skill's description names what it is and the distinct cases that should trigger it.
- A step skill points to [`references/contract.md`](references/contract.md), never to this file.
- Every step ends on a checkable done condition. State the behaviour wanted, not the one banned.
- Delete a sentence the agent would follow anyway. Prune stale lines when you touch a file.
- New rules come only from [`improve-factory`](../improve-factory/SKILL.md), which owns the
  evidence bar and the merge classes. Any change to skill text is class `guardrail`.

---
name: sdlc
description: The process map of the agentic SDLC - statuses, who moves what, the needs-human hold, lanes, fields, change lines and which skill acts next. Load first when you start work on a ticket, do not know your next skill, run a cycle, or edit a skill.
tier: fast
---

# SDLC

The one navigator. It says where a ticket stands and which skill acts next; how to do a step lives
in that step's skill.

There are three layers:

- **Process: these skills.** Generic and reusable. Every process rule lives here. No project value.
- **Binding: `.agents/binding.yml`.** Every project value: board, statuses, labels, commands, paths,
  owners, model tiers. A project copies the skills whole and replaces only the binding.
- **Ports: the `agentic-sdlc` CLI.** Board, forge and VCS steps are CLI verbs, never a vendor
  command. See [`references/ports.md`](references/ports.md). Repo gates run in CI, not in agents.

## Roles

- **Product owner** (`owners.product`) rules the product: the guiding narrative, priorities, P0,
  releases, production approval.
- **Factory owner** (`owners.factory`) rules the factory: skills, binding, gates, and learning
  proposals of class guardrail.

## Common contract for every step skill

- Read the binding first. Take no project fact from a skill.
- Read the agent card and follow its pointers for domain rules.
- Judge every ticket against `paths.guiding_narrative` first: the narrative already carries it,
  contradicts it, or the ticket would move it. Only the Product owner moves the narrative.
- A ticket that would breach a non-negotiable `paths.importance_doc` names is Cancelled with a
  reason, never escalated.
- Set the fields of `board.fields` (Status, Size, Priority, Lane, Shipped, Release Version) only
  through the board port. Moving to Cancelled also closes the ticket as not planned.
- Each run has its own scratch folder and names every file it writes for its ticket.
- Model choice: each skill names a `tier`; the binding's `models` maps it to a model. A skill may
  hand a narrow, checkable part of its step (a wide search, a read-and-summarise, a mechanical
  edit) to a subagent on a lower tier. The skill keeps the decision and checks the result.
- Only product work is a ticket. A change only under `paths.factory` (the SDLC, its gates and the
  agent setup) is a factory change: no ticket, no board item, its CR needs no `Closes`.
- A ticket a skill creates goes on the board with a Status in the same step: Backlog for a child
  or a new deliverable, Signals for a signal, which also gets one `signal:<stream>` label.
- A skill moves a ticket only if it is still in the status where the skill found it
  (`board move <id> <status> --only-from <s>`). Otherwise it stops and writes one comment.
- The assignee is a human, or the bot an `assign` executor names while its run is open.
- Ideas is a hand-off to humans. A skill may place a concept or a snoozed signal there. It never
  picks one up, edits it, comments on it or moves it out.
- A ticket made from a failure carries a regression case in its criteria.
- No gate files security reports; `triage-signal` files them by hand.
- When unsure of authority, call [`escalate-to-human`](../escalate-to-human/SKILL.md) before acting.
- Finish with one short ticket comment: what was done, what was decided, the next status.
- A decision is recorded only on its ticket. A doc states the resulting rule as a plain sentence,
  with no ruling id, date or decider.

## Routing

Pick the first row that matches. A ticket labelled `needs-human` is held: skip it.

| Ticket state | Skill |
|---|---|
| Status Ideas | none; humans only |
| Status Signals | [`triage-signal`](../triage-signal/SKILL.md) |
| Status Backlog, no Priority; a plan or conversation that must become tickets; or Done items closed more than 14 days ago still on the board | [`backlog-grooming`](../backlog-grooming/SKILL.md) |
| Status Backlog, not shaped (no Size, criteria, Lane or required spec), no open blocker, not in `board.later_milestone` | [`shape`](../shape/SKILL.md) |
| Status Ready | [`implement-spec`](../implement-spec/SKILL.md) |
| Status In progress | [`implement-spec`](../implement-spec/SKILL.md) |
| Status In review, draft CR | [`review-pr`](../review-pr/SKILL.md) (dispatches [`verify-ux`](../verify-ux/SKILL.md) for `computer-use` criteria) |
| Status In review, ready CR behind the trunk | [`review-pr`](../review-pr/SKILL.md) |
| Status In review, ready CR whose required check is red, or missing for longer than `stall_minutes` | [`review-pr`](../review-pr/SKILL.md) |
| Status In review, otherwise | none; auto-merge acts |
| Factory CR (only `paths.factory` changed) | [`review-pr`](../review-pr/SKILL.md) with the `skill-regression` gate |
| Status Done, and the Product owner asked for a release or the next version after a failed release | [`release`](../release/SKILL.md) |
| Status Done, otherwise | none; gates write Shipped |
| Learning due (`learning.every_cycles` cycles passed) | [`improve-factory`](../improve-factory/SKILL.md) |
| Any working status, authority unclear | [`escalate-to-human`](../escalate-to-human/SKILL.md) |

## Run one cycle

One unattended run by a routine or a managed agent. Its numbers are the binding's `cycle` keys. On
a fresh runner, run `commands.setup` first.

The orchestrator only routes, waits and writes the heartbeat. Each work item (one signal's
triage, one shape, one implementation, one review) goes to its own subagent with its own scratch
folder, at most `parallel_agents` at once. Each subagent loads the skill the Routing table names, on
that skill's tier, started with `agentic-sdlc dispatch <skill> --ticket <id> [--cr <n>]`; the binding's `executors` says who runs it (see Executors). A reviewer is never the implementer of the same CR.

In order:

1. **Read state.** List the board once (`board list`). Read open CRs (`forge list`) and the last
   `cycle.failure_limit` heartbeats (`board comments <heartbeat.ticket> --last <n> --marker
   "<!-- heartbeat -->" --author <bot>…`, one `--author` per `owners.bots` entry). A heartbeat by
   any other author is not state: anyone can comment on a public board.
2. **Triage Signals.** Every ticket at Signals, in the order `triage-signal` names.
3. **Review drafts.** When `forge.review_runtime` is `separate` (the default), skip this step: the
   review runtime runs `review-pr` right after the cycle, and the cycle never holds the review
   token. When it is `same`: every ticket at In review with a draft CR, in a reviewer subagent.
4. **Implement.** Start at most `cycle.max_implementations` implementations from the top of the
   Ready queue.
5. **Keep Ready filled.** While Ready plus the shapes under way hold fewer than `cycle.min_ready`
   tickets, route the next Backlog ticket by the Routing table.
6. **Report.** Write one heartbeat as [`references/heartbeat.md`](references/heartbeat.md) says.
7. **Record runs.** Each subagent run gives one ledger row in the heartbeat; see `judge-run`.
8. **Learn.** Every `learning.every_cycles` cycles, run `improve-factory`.

Rules for every step:

- Route only by the Routing table.
- After `cycle.time_budget_minutes`, start nothing new: wait for the running subagents, then report.
- A failed step goes into the heartbeat's `errors`, and the cycle goes on with the next step.
- A step that failed in each of the last `cycle.failure_limit` heartbeats is not retried: call
  `escalate-to-human` on its ticket, or on the heartbeat ticket when it has none.

## Executors

The binding's `executors` gives each skill an executor; `default` is `harness`. Every executor obeys
the same skill and gates. Tracker truth is the only hand-off. The reviewer executor is never the
implementer executor of the same CR. Moving a skill to another executor is a guardrail change.

| Kind | Start | Result comes back by |
|---|---|---|
| `harness` | A subagent loads the skill, model by its tier. | Its own board and forge writes. |
| `command` | The CLI runs the bot's `run` command. | Exit code plus the bot's writes. |
| `webhook` | The CLI POSTs the task to the bot's URL. | The bot's writes; the next cycle reads them. |
| `managed` | The CLI starts a managed-agent session. | Same; the session id goes in the ledger row. |
| `assign` | The CLI assigns the ticket or CR to the bot user with the skill name as a comment. | Same. |

An executor may also declare `mcps` (names from the binding's `mcps`; the stage gets only those), `secrets` (env var names it may receive; nothing else is passed), `sandbox` (`cloud`, `container` or `local`; `dispatch --unattended` refuses `local`) and `model` (`{ tier }` or `{ id }`; the skill's tier by default). `dispatch` resolves them and never prints a secret value.

## Intake

Any tool that creates a Signals item with a `signal:<stream>` label is an intake; the factory has none of its own.

## Statuses

The heartbeat ticket (`heartbeat.ticket`) is not a ticket: it stays off the board and outside the
ticket rules.

| Status | Meaning | Entry | Exit | Moved in by |
|---|---|---|---|---|
| Ideas | A concept or snoozed signal, not committed. A hand-off to humans. | Plausible but unbacked, or parked by the Product owner. | A human accepts (Backlog) or rejects (Cancelled). | triage-signal places; humans move |
| Signals | Raw input of any type, one `signal:<stream>` label. | Ticket with signal type and a redacted evidence bundle; a deploy or release failure opens one. | One decision: Ideas, Backlog or Cancelled, with a reason comment. | intake; gates `signal-on-red` and `shipped`; triage-signal for an unboarded `signal:` ticket; Product owner |
| Backlog | Accepted; to be groomed and shaped. | Accepted signal or idea, or a ticket bounced for a bad spec or scope. | Priority set, then shaped: sized, criteria with proof, lane chosen, spec in the Full lane, checklist passed. | triage-signal, Product owner, backlog-grooming, shape (children), any skill bouncing a bad spec |
| Ready | The implementation queue. One deliverable within the size limit, criteria and lane set, spec attached in the Full lane. | Shape checklist passed, no open blocker. | An implementer claims it. | shape |
| In progress | Implementing on one short-lived change line. | Claimed, change line started from the trunk. | Draft CR open and closing its ticket, fast check green. | implement-spec; review-pr when it sends a CR back |
| In review | A CR is open, draft or ready. A draft is checked against the requirements; a ready CR waits on CI and auto-merge. | CR opened, linked to the ticket. | Merged to the trunk. Review passes when criteria are proven, no risk is open, verify is green on the head and the review check is posted; the CR is then marked ready. | gate `board-sync` on every CR open, ready or back-to-draft event; implement-spec when the CR is already open |
| Done | Merged to the trunk. Where the code runs is the Shipped field. | Merge on the trunk. | End. A later failure never moves it. | gate `board-sync` on merge |
| Cancelled | Rejected, superseded, will not fix. | A reason comment. | End; closed as not planned. | triage-signal, backlog-grooming, Product owner |

A failure never moves a Done ticket. A deploy or release failure opens a new Signal on the merge
or release revision; the fix is a new ticket through the normal path. A release failure also returns
its tickets to Shipped = On <the environment before the last> and clears the Release Version; its Signal carries `needs-human`
for a failure in the last environment. Bounces back: Ready, In progress or In review to Backlog when the spec
or scope is wrong; In review to In progress when review sends it back. Red CI puts the CR back to
draft; the Status stays In review.

## The needs-human hold

- A label (`board.labels.human`), not a status, set by `escalate-to-human` or on a
  last-environment-failure Signal. It applies at Backlog, Ready, In progress and In review, and to a Signal.
- A held ticket keeps its Status. Every skill skips it, never moves or reorders it, and no
  automation moves it.
- Removing the label is the only release; the next run resumes at the same Status.

## Shipped

- **Shipped** is where the product runs. Its options derive from `product.environments`: Not
  shipped, `On <env>` per environment, and In release before the last one. Gates write it: `On
  <env>` after a green deploy (or publish) to that environment. `release` starts In release by
  cutting the release line. Merged work begins Not shipped.
- A release failure returns its tickets to On <the environment before the last> and clears the
  Release Version.

## Lanes

- **Fast:** Size at or below `fast_lane_max_size`, no escalation trigger fires, and no path in
  `paths.lane_areas` is touched. The ticket's criteria and a proof list are the spec; there is no
  spec comment.
- **Full:** everything else. It carries a spec comment.
- [`shape`](../shape/SKILL.md) writes the Lane field. `implement-spec` or `review-pr` promotes
  Fast to Full when a deviation, a trigger, a second failed fix or an unlisted risk shows up.
  Nothing demotes.
- Review and verify run in both lanes: the lane changes the amount of design, not the proof.

## Board

- **Statuses** are `board.statuses`. **Views** are `board.views`: Board (open work from Signals to
  Done; Done shows the last 14 days, grouped by Shipped), Signals (Status Signals, sliced by
  `signal:<stream>`), Human (Ideas plus every `needs-human` ticket, by Status), Release (Done where
  Shipped is not On <the last environment>, grouped by Shipped, then Release Version), Roadmap (open work except
  Signals and Ideas, grouped by milestone). A view never changes a Status. Roadmap only orders work
  by milestone: the milestone is its date. `paths.roadmap_doc` says what each milestone contains.
- **Size** is one CR's review burden, not effort. Up to `ready_size_limit` may be Ready; the
  largest is an initiative. From the smallest: one behaviour in one place; one small behaviour in
  one area; one complete user path in one domain; a path across several areas or a new seam; a
  capability over many deliverables. An item above the limit goes back to
  [`shape`](../shape/SKILL.md), which splits it; no other skill splits.
- **Priority** in the order of `priorities`. `triage-signal` sets it on accept; `backlog-grooming`
  sets a missing one and reorders; the Product owner overrides. The first means the last environment is
  impacted, data, money or security is at risk, or a release is blocked; only `p0_setters` set it,
  with proof, and triage also escalates. Ready queue: priority order, then a ticket that unblocks
  others, then oldest.
- **Labels** are the binding's and no others: `bug` or `feature` on every open ticket, the hold
  label, one `signal:<stream>` per signal, and one of `board.env_labels` on a signal from a deployed
  environment.
- **Moves** are explicit: the tracker's built-in automations are off. Read one ticket at a time
  (`board get`); never list the whole board, except once per cycle to read state.
- **Milestone:** every open ticket carries exactly one, the phase it ships in. Children inherit the
  parent's. A milestone's due date, if any, is the only date. Release versions stay independent of
  milestones. `board.later_milestone` holds accepted work that is nice to have and has no delivery
  date; nothing shapes or builds a ticket there until `backlog-grooming` moves it into a dated
  milestone.
- **Release Version:** set by `release` before the release line is cut; cleared when a release fails.
- **Lane:** see Lanes.

## Sub-issues

- An initiative is a parent: children inside one milestone; never a spec, change line or CR. It stays
  at Backlog until it closes, and no skill routes it to `shape`'s spec step, `implement-spec` or
  `review-pr`.
- A deliverable is a child or a standalone ticket within the size limit. Depth is at most
  `max_subissue_depth`.
- Items that change the same behaviour merge into one deliverable; separate deliverables toward one
  outcome become children of an initiative; an item above the limit is split into children of itself.
- A parent's progress is the board's sub-issue progress; no move rolls a Status up.
  [`backlog-grooming`](../backlog-grooming/SKILL.md) closes a parent once every child is closed:
  as Cancelled when every child was, else as Done with Shipped the lowest value among its Done children.

## Branches and releases

- Trunk-based on every VCS (git, hg, p4): one trunk (`vcs.trunk`), short-lived change lines
  matching `vcs.change_pattern` in, release lines `vcs.release_prefix` out. No long-lived develop
  line, no hotfix path. "Branch" means the change line `vcs start` creates. One ticket, one change
  line, one CR.
- The change line names its ticket, and the CR closes exactly that ticket: one line `Closes <id>`
  with the line's id. `implement-spec` writes it; every later reader takes the CR's `closes` and
  checks it against the change line.
- On a draft CR the required CI check reads pending, never success, so a draft never satisfies the
  required checks and never reports red.
- A merge to the trunk moves the ticket to Done and deploys the first environment. The last environment deploys from a
  release line after the Product owner approves it. Agents never approve it.
- The tag is `vcs.tag_prefix` plus the version, created by the release pipeline at success in the last environment.
- No second human approves a CR: author and reviewer are different skills in fresh contexts, and the
  required checks are mechanical.

## Skills and the repo

The skills decide and act on tickets; the repo guarantees the gates. Each gate is
`agentic-sdlc gate <name>`, run by CI from the templates in `templates/gates/`. A guarantee the repo
cannot keep is escalated to the Factory owner (Access), never worked around.

| Gate | Outcome |
|---|---|
| `branch-names` | A change line outside `vcs.change_pattern`, `vcs.factory_change_pattern`, `vcs.release_prefix` and the trunk cannot be pushed or merged. |
| `linkage` | A product CR closes exactly one open ticket and names it in its source. |
| `board-sync` | A CR opened, made ready or put back to draft moves its ticket to In review; a merge moves it to Done with Shipped Not shipped. |
| `shipped <env>` | A green deploy to `<env>` writes On <env>; a pushed release line writes In release; a failed deploy to the last environment returns the tickets to On <the environment before the last> and opens a held Signal. |
| `signal-on-red` | A red trunk or deploy run opens a Signal with a redacted evidence bundle. |
| `skill-regression` | A change under `paths.factory` keeps the skill pack valid and the bench non-regressing. |

No merge until every `forge.required_checks` entry is green: that is the forge's branch protection,
not a gate; `agentic-sdlc doctor` reports it.

### In review, hand-offs in order

| Step | Actor | Trigger | Proof | On failure, next actor |
|---|---|---|---|---|
| Draft CR opened | implement-spec | Fast check green | Draft CR closing the ticket; board shows In review | Gate `linkage` red: implement-spec fixes the body |
| Review | review-pr; verify-ux for `computer-use` criteria | Draft CR at In review | Report comment with a row per criterion; a `<!-- verify-ux -->` evidence comment per `computer-use` criterion set | Findings below |
| Findings | review-pr | An Important finding | Ticket at In progress with the findings | implement-spec fixes, opens the CR again |
| Pass | review-pr | Every criterion proven, verify green on the head | `forge.review_check_name` and `forge.verify_check_name` statuses on the head; CR ready; auto-merge on | A step fails: CR stays draft, review-pr reports |
| Gate runs | CI | Ready CR | Every `forge.required_checks` entry green | Red or missing: see the two rows below |
| Merge | Forge | All required checks green | Merge on the trunk; board Done, Not shipped | Behind the trunk: review-pr syncs the CR and reviews again |
| Meanwhile | none | Auto-merge on | Nothing: do nothing until the next cycle | None |
| A required check red | review-pr | Ready CR, a required check red | CR back to draft, cause read | Cause in the diff or scope: review-pr fixes; else the ticket returns to In progress with the cause |
| A required check missing longer than `stall_minutes` | review-pr | Ready CR, check absent past the limit | Heartbeat `stalled` lists it | Same as red |
| A gate that never runs | escalate-to-human | No run at all for a gate | `needs-human` ask, reason Access | Factory owner restores the gate |

## Editing skills

- Short plain sentences. A rule has one home; elsewhere a pointer, never a copy.
- The agent card routes and never rules: a promise and a pointer, no mechanism.
- A skill holds process only; project values belong in the binding, domain rules in the docs the
  card routes to.
- A skill's description names what it is and the distinct cases that should trigger it.
- Every step ends on a checkable done condition. State the behaviour wanted, not the one banned.
- Delete a sentence the agent would follow anyway. Prune stale lines when you touch a file.
- A rule enters a skill or the agent card only after the same mistake appears twice.
  [`review-pr`](../review-pr/SKILL.md) proposes it; the Factory owner accepts it.
- A change under `paths.factory` is a factory change and needs the `skill-regression` gate green.

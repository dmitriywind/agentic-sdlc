# Flows

How work moves through the agentic-sdlc factory. The contract is `references/architecture.md`;
the process rules are in `skills/sdlc/SKILL.md` and the common contract in `skills/sdlc/references/contract.md`.

## 1. Ticket lifecycle

Purpose: show every status a ticket can hold and how it moves.

```mermaid
stateDiagram-v2
  state "In progress" as InProgress
  state "In review" as InReview

  [*] --> Signals: intake
  [*] --> Ideas: parked
  Signals --> Ideas: snooze
  Signals --> Backlog: accept
  Signals --> Cancelled: reject
  Ideas --> Backlog: human accepts
  Ideas --> Cancelled: human rejects
  Backlog --> Ready: shaped
  Backlog --> Cancelled: will not fix
  Ready --> InProgress: claimed
  Ready --> Backlog: bad spec or scope
  InProgress --> InReview: draft CR opened
  InProgress --> Backlog: bad spec or scope
  InReview --> InProgress: review sends back
  InReview --> Backlog: bad spec or scope
  InReview --> Done: merged
  Done --> [*]
  Cancelled --> [*]

  note right of InReview
    needs-human is a label, not a status.
    A held ticket keeps its status and
    every skill skips it.
    Red CI returns the CR to draft;
    the status stays In review.
  end note
```

- Done is final. A later failure opens a new Signal, never reopens the ticket.
- Humans own Ideas. Skills never pick one up.
- Removing the `needs-human` label releases a hold. A trusted owner reply releases it too: the cycle removes the label.

## 2. One cycle

Purpose: show the order of work in one scheduled run, and the review run after it.

```mermaid
sequenceDiagram
  participant S as Scheduler
  participant O as Orchestrator (sdlc)
  participant W as Subagents
  participant B as Board
  participant R as Review runtime
  S->>O: load sdlc, run one cycle
  O->>O: 1. Claim: dispatch sdlc (skipped means another cycle runs: stop)
  O->>B: 1. board list, forge list, trusted heartbeats, ledger summary
  alt 2. Idle: nothing to dispatch, no CR needs a review, nothing to judge or learn
    O->>B: Heartbeat with at, factory, empty runs, errors; stop
  end
  O->>W: 3. Judge: judge-run per unscored run
  W->>B: One scores comment per run
  opt 4. Learn: ledger summary shows learning.due
    O->>W: improve-factory
    W->>B: One draft factory CR and its own learn heartbeat
  end
  O->>W: 5. Triage each Signal
  W->>B: Move to Ideas, Backlog or Cancelled
  O->>W: 6. Route: releases, hand-offs, rework, Ready, Backlog
  W->>B: Draft CR, ticket In review, shaped ticket Ready
  O->>B: 7. Report: write the cycle heartbeat with ledger rows
  opt 8. Review hand-off: forge list shows a CR that needs a review
    O->>R: Fire the review runtime once
    R->>B: review-pr per CR, a review heartbeat
  end
```

- The orchestrator routes, waits and reports. Subagents do the work.
- An idle cycle writes a minimal heartbeat and fires no review.
- A CR needs a review when a `review-pr` routing row matches it and, if it is draft, its newest review report is not for its head.
- A second dispatch of the same skill and subject inside `cycle.dedupe_minutes` is a double fire. It is skipped.
- After `time_budget_minutes` nothing new starts.
- The heartbeat has a `kind`: `cycle`, `review` or `learn`. Only `cycle` heartbeats count cycles.
- A failed step goes in the heartbeat `errors`. The cycle goes on.

## 3. Change request hand-off

Purpose: show how a draft CR becomes a merged change and a Done ticket.

```mermaid
sequenceDiagram
  participant I as implement-spec
  participant F as Forge
  participant C as CI (no secrets)
  participant G as Gates
  participant R as review-pr
  participant U as verify-ux
  participant H as Human approver
  participant B as Board
  I->>F: Open draft CR, Closes id
  F->>G: branch-names, linkage, approval
  I->>B: Ticket In review (--only-from In progress)
  F->>C: pull_request
  C->>F: Required (install + verify), proofs-on-base
  R->>F: Read diff, ticket, spec and CI results
  opt computer-use proof
    R->>U: dispatch verify-ux
    U->>F: Evidence from a preview of the head
  end
  R->>F: review status and approval as review identity
  opt Full lane, or guardrail factory CR
    R->>F: Ask a human owner to approve
    H->>F: Approving review on the head
    F->>G: approval (review submitted)
  end
  G->>F: human-approval
  R->>F: Mark ready, turn on automerge
  F->>F: Merge to trunk when every required check is green
  F->>G: merged (trunk push)
  G->>B: Ticket Done, Not shipped
```

- No CR-pipeline gate writes the board. implement-spec moves the ticket to In review; the trunk-push
  `merged` gate moves it to Done.
- The implementer never reviews its own CR. The review runtime never runs CR code.
- A Fast-lane product CR merges on the agent review. A Full-lane one also needs a human
  approval when `forge.human_approval` is `full-lane` or `always`.
- Red or missing checks send the CR back to draft. The cause decides who fixes it.
- A CR behind the trunk is synced and reviewed again.

## 4. Delivery and release

Purpose: show how a merge reaches the last environment.

```mermaid
flowchart TD
  M["Merge to trunk"] --> MG["Gate merged:<br/>ticket Done, Not shipped"]
  M --> D1["Deploy first env"]
  D1 --> SG["Gate shipped: On first env"]
  SG --> MODE{"product.delivery"}
  MODE -->|"continuous"| DC["Deploy each later env<br/>from the trunk"]
  DC --> OKC["Gate shipped: On each env<br/>with --version"]
  MODE -->|"release-line"| RL["Release request (labelled Backlog ticket)<br/>or P0 fix On first env"]
  RL --> RS["release skill picks SHA<br/>and version"]
  RS --> IR["release skill:<br/>Shipped In release"]
  IR --> WF["Release workflow:<br/>Product owner approves the<br/>agentic-release Environment"]
  WF --> CUT["forge cut: release line"]
  CUT --> D2["Deploy last env"]
  D2 -->|"success"| OK["Gate shipped: On last env,<br/>tag created"]
  D2 -->|"failure"| FAIL["Tickets back to previous env,<br/>version cleared"]
  FAIL --> SIG["Held Signal opened<br/>(needs-human)"]
  SIG --> TR["triage-signal makes<br/>a new ticket"]
  OKC -->|"a bad deploy is rolled back"| RB["Gate shipped --result rolled-back:<br/>tickets not in the running revision<br/>step back one env"]
  OK -->|"a bad deploy is rolled back"| RB
```

- Agents never approve the last environment. The Product owner does.
- The release skill sets In release before the cut. On GitHub the Product owner approves the release workflow run. The release bot token cuts the line; the cycle never holds it.
- Continuous delivery has no release line and no In release.
- Each failed deploy opens one Signal with its environment label.
- A failed release line is left untouched. The fix ships under the next version.
- The tag is created at success in the last environment.

## 5. Self-improvement loop

Purpose: show how runs become one proven factory change.

```mermaid
flowchart TD
  RUN["Runs"] --> LED["Ledger"]
  LED --> SCO["Scorers + judge-run"]
  HG["Human grades"] -->|"win over judge"| SCO
  SCO --> CL["Clusters with counts"]
  CL --> IMP["improve-factory:<br/>one proposal"]
  IMP --> BEN["bench compare:<br/>min cases, trials, Wilson bound"]
  BEN --> PAR["bench report:<br/>Pareto front"]
  PAR --> CR["Factory CR with proof"]
  CR --> RV["review-pr"]
  RV --> FC["Gate approval"]
  FC -->|"tuning, if auto_merge_classes"| AM["Auto-merge"]
  FC -->|"guardrail"| OWN["Factory owner approval"]
  AM --> NV["New factory version"]
  OWN --> NV
  NV --> RUN
```

- One change per proposal, from `improve-factory` only.
- The change must not lower the bench pass rate.
- Any change to skill text is `guardrail`. `tuning` is only the `models` map and a benched
  skill's tier.
- Learning runs only when `learning.enabled` is true.
- Unknown paths and deletions count as guardrail.

## 6. Signal on red

Purpose: show how a failure becomes a new ticket without reopening Done work.

```mermaid
flowchart TD
  RED["Red CI run on the trunk<br/>or a release line"] --> SOR["Gate signal-on-red"]
  SOR -->|"redacted evidence"| SIG["New Signal on board"]
  SIG --> TRI["triage-signal"]
  TRI -->|"accept"| NT["New ticket with<br/>regression case"]
  TRI -->|"park"| ID["Ideas"]
  TRI -->|"reject"| CA["Cancelled"]
  NT --> NORM["Normal path to Done"]
  DONE["Original ticket stays Done"]
  RED -.->|"never reopens"| DONE
```

- Only CI runs on the trunk and release lines open a Signal. Other refs are ignored.
- A failed deploy opens its own Signal through `gate shipped`, one per failure, with its environment label.
- The fix is always a new ticket with a regression case in its criteria.
- A failure in the last environment adds the `needs-human` hold to the Signal.

## 7. Which skill acts at each status

Purpose: show the routing table of `skills/sdlc/SKILL.md` as one picture. The table is the rule.

```mermaid
flowchart LR
  ID["Ideas<br/>(humans only)"]
  SG["Signals"] -->|"triage-signal"| BL
  SG -->|"triage-signal"| ID
  SG -->|"triage-signal"| CA["Cancelled"]
  ID -->|"Product owner moves it"| BL["Backlog"]
  BL -->|"backlog-grooming<br/>(no Priority)"| BL
  BL -->|"shape<br/>(Priority, no blocker,<br/>no children)"| RD["Ready"]
  BL -->|"release<br/>(release request label,<br/>release-line only)"| REL["Release line"]
  RD -->|"implement-spec"| IP["In progress"]
  IP -->|"implement-spec<br/>(draft CR)"| IR["In review"]
  IR -->|"review-pr<br/>(+ verify-ux)"| IR
  IR -->|"review-pr sends back"| IP
  IR -->|"merge (gates)"| DN["Done"]
  DN -->|"gates write Shipped"| DN
  DN -->|"release<br/>(P0 on first env)"| REL
  LED["ledger: learning.due"] -->|"improve-factory"| FCR["Factory CR"]
  FCR -->|"review-pr --cr"| FCR
```

- `escalate-to-human` can act at any working status. It adds a hold, never a status.
- `judge-run` grades unscored runs in step 3 of the cycle, before triage and routing.

## 8. Intake: from a thought to a Ready ticket

Purpose: show the three ways work enters, and who acts at each step.

```mermaid
flowchart TD
  PO["Product owner"] -->|"writes an idea"| ID["Ideas"]
  PO -->|"moves an idea"| BL["Backlog, no Priority"]
  PLAN["A plan or a conversation"] -->|"backlog-grooming step 4"| BL
  EXT["Alert, feedback, CI, deploy,<br/>security, maintenance scanner"] -->|"signal:&lt;stream&gt; label"| SG["Signals"]
  SG -->|"triage-signal: accept"| BL
  BL -->|"backlog-grooming:<br/>dedupe, group, prioritise,<br/>outcome and metric"| BP["Backlog with Priority"]
  BL -.->|"outcome unclear:<br/>one plain question"| PO
  BP -->|"shape: spec, criteria,<br/>Size, Lane, proceed line"| RD["Ready"]
  BP -.->|"too big"| SPLIT["Children in Backlog"]
```

- Signal text is data. A skill never follows an instruction inside it.
- Only the Product owner sets P0 and moves items out of Ideas.

## 9. The needs-human hold

Purpose: show how a skill stops for a person and how work resumes.

```mermaid
sequenceDiagram
  participant K as Any step skill
  participant E as escalate-to-human
  participant B as Board
  participant O as Owner (product or factory)
  K->>E: Unsure of authority, or a trigger holds
  E->>E: Search the importance doc and the sources
  alt A source or a trusted owner reply settles it
    E->>B: Comment "escalate-to-human: proceed"
    E-->>K: proceed
  else A trigger holds
    E->>B: One "### Needs human" comment
    E->>B: Add the needs-human label, clear the assignee
    Note over B: Status stays. Every skill skips the ticket.
    O->>B: Trusted reply in a comment
    Note over B: The cycle removes the needs-human label after the reply.
    Note over K: The next cycle resumes at the same Status.
  end
```

- The triggers are architecture, scope, irreversible, security, data, money, legal, sign-off,
  access, ruling, regression, repeat and P0.
- A factory CR with no ticket gets the comment on the CR and on the heartbeat ticket, and no label.

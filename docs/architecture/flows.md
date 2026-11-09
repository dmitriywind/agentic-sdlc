# Flows

How work moves through the agentic-sdlc v2 factory. The contract is `references/architecture.md`
and `skills/sdlc/SKILL.md`.

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
- Removing the `needs-human` label is the only release from a hold.

## 2. One cycle

Purpose: show the order of work in one scheduled run.

```mermaid
sequenceDiagram
  participant S as Scheduler
  participant O as Orchestrator (sdlc)
  participant W as Subagents
  participant B as Board
  S->>O: Load sdlc, run one cycle
  O->>B: board list, forge list, last heartbeats
  O->>W: Triage each Signal
  W->>B: Move to Ideas, Backlog or Cancelled
  O->>W: Review each draft CR
  W->>B: Report, ready CR or send back
  O->>W: Implement top of Ready
  W->>B: Draft CR, ticket In review
  O->>W: Shape Backlog until min_ready is met
  W->>B: Ticket moves to Ready
  O->>B: Write heartbeat with ledger rows
  O->>W: judge-run on finished runs
  W->>B: Scores into the next heartbeat
  opt every N cycles
    O->>W: improve-factory
    W->>B: One factory CR
  end
```

- The orchestrator routes, waits and reports. Subagents do the work.
- After `time_budget_minutes` nothing new starts.
- A failed step goes in the heartbeat `errors`. The cycle goes on.

## 3. Change request hand-off

Purpose: show how a draft CR becomes a merged change and a Done ticket.

```mermaid
sequenceDiagram
  participant I as implement-spec
  participant F as Forge + CI
  participant G as Gates
  participant R as review-pr
  participant U as verify-ux
  participant B as Board
  I->>F: Open draft CR, Closes id
  F->>G: branch-names, linkage, factory-class
  F->>G: board-sync (opened)
  G->>B: Ticket In review
  R->>F: Read diff, run verify on head
  opt computer-use proof
    R->>U: dispatch verify-ux
    U->>F: Attach evidence to CR
  end
  R->>F: Post review status as review identity
  R->>F: Approve as review identity
  R->>F: Mark ready, turn on automerge
  F->>G: Required checks run
  G-->>F: All green
  F->>F: Merge to trunk
  F->>G: board-sync (merged)
  G->>B: Ticket Done, Not shipped
```

- The implementer never reviews its own CR.
- Red or missing checks send the CR back to draft. The cause decides who fixes it.
- A CR behind the trunk is synced and reviewed again.

## 4. Delivery and release

Purpose: show how a merge reaches the last environment.

```mermaid
flowchart TD
  M["Merge to trunk"] --> D1["Deploy first env"]
  D1 --> SG["Gate shipped: On first env"]
  SG --> RL["Product owner asks for release"]
  RL --> RS["release skill picks SHA<br/>and version"]
  RS --> CUT["vcs cut: release line"]
  CUT --> IR["Gate board-sync:<br/>Shipped In release"]
  IR --> D2["Deploy last env<br/>(owner approves)"]
  D2 -->|"success"| OK["Gate shipped: On last env,<br/>tag created"]
  D2 -->|"failure"| FAIL["Tickets back to previous env,<br/>version cleared"]
  FAIL --> SIG["Held Signal opened<br/>(needs-human)"]
  SIG --> TR["triage-signal makes<br/>a new ticket"]
```

- Agents never approve the last environment. The Product owner does.
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
  IMP --> BEN["Bench suites"]
  BEN --> PAR["bench report:<br/>Pareto front"]
  PAR --> CR["Factory CR with proof"]
  CR --> FC["Gate factory-class"]
  FC -->|"tuning"| AM["Auto-merge"]
  FC -->|"guardrail"| OWN["Factory owner approval"]
  AM --> NV["New factory version"]
  OWN --> NV
  NV --> RUN
```

- One change per proposal. A rule enters a skill only after the same mistake appears twice.
- The change must not lower the bench score or raise cost beyond its gain.
- Weekly spend on learning stays under the budget. Over budget, the loop stops.
- Unknown paths and deletions count as guardrail.

## 6. Signal on red

Purpose: show how a failure becomes a new ticket without reopening Done work.

```mermaid
flowchart TD
  RED["Red trunk,<br/>release line or deploy"] --> SOR["Gate signal-on-red"]
  SOR -->|"redacted evidence"| SIG["New Signal on board"]
  SIG --> TRI["triage-signal"]
  TRI -->|"accept"| NT["New ticket with<br/>regression case"]
  TRI -->|"park"| ID["Ideas"]
  TRI -->|"reject"| CA["Cancelled"]
  NT --> NORM["Normal path to Done"]
  DONE["Original ticket stays Done"]
  RED -.->|"never reopens"| DONE
```

- Only trunk and release-line runs open a Signal. Other refs are ignored.
- The fix is always a new ticket with a regression case in its criteria.
- A failure in the last environment adds the `needs-human` hold to the Signal.

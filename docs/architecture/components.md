# Components

How the agentic-sdlc v2 factory is built. The contract is `references/architecture.md`. This page
only draws it.

## 1. Context

Purpose: show who and what the factory talks to.

```mermaid
flowchart LR
  PE["Product engineers"]
  FE["Factory engineers"]
  IN["Intake tools: chat bot,<br/>tracker form, CR comment, alerts"]
  SCH["Scheduler / runtime<br/>(any harness)"]
  subgraph F["The factory"]
    SK["Skills"]
    BD["Binding"]
    CLI["CLI / MCP"]
  end
  BO["Board"]
  FG["Forge + CI gates"]
  VCS["VCS"]
  MP["Model providers"]
  MA["Managed agents / bots"]
  TS["Trace store"]

  PE --> IN
  PE --> BO
  FE -->|"factory CRs"| FG
  IN -->|"creates Signal"| BO
  SCH -->|"run one cycle"| SK
  SK --> BD
  SK --> CLI
  SK -->|"inference"| MP
  CLI --> BO
  CLI --> FG
  CLI --> VCS
  CLI -->|"dispatch"| MA
  MA -->|"board / forge writes"| BO
  MA -->|"board / forge writes"| FG
  MA -->|"transcripts"| TS
  CLI -->|"read traces"| TS
  FG -->|"runs gates"| CLI
```

- Product engineers talk to the board and the intake tools. They never call the factory directly.
- Factory engineers change skills and the binding through factory CRs on the forge.
- The board and the forge are the only hand-off between parts.

## 2. Layers and ports

Purpose: show the three layers and which port reaches which external system.

```mermaid
flowchart TB
  subgraph Process["Process: skills/"]
    S["11 skills: sdlc, triage-signal, backlog-grooming,<br/>shape, implement-spec, review-pr, verify-ux,<br/>release, escalate-to-human, judge-run,<br/>improve-factory"]
  end
  subgraph Binding["Binding: .agents/binding.yml"]
    B["Board, statuses, commands, paths,<br/>owners, model tiers, executors"]
  end
  subgraph Ports["Ports: agentic-sdlc CLI"]
    subgraph BA["board adapters"]
      b1["github"]
      b2["jira"]
      b3["linear"]
      b4["local"]
    end
    subgraph FA["forge adapters"]
      f1["github"]
      f2["gitlab"]
      f3["azure"]
      f4["bitbucket"]
    end
    subgraph VA["vcs adapters"]
      v1["git"]
    end
    G["gates"]
    D["dispatch"]
    L["ledger"]
    BN["bench"]
    M["MCP server"]
  end
  S -->|"reads"| B
  S -->|"calls verbs"| Ports
  B -->|"picks adapter"| Ports
  M -.->|"same verbs"| Ports

  EB["Board service"]
  EF["Forge host + CI"]
  EV["VCS server"]
  EA["Executors"]
  ET["Trace store"]
  BA --> EB
  FA --> EF
  VA --> EV
  G --> EB
  G --> EF
  D --> EA
  L --> EB
  L --> ET
  BN --> VA
  BN -->|"agent_command"| EA
```

- Skills hold process only. The binding holds every project value. Ports hold mechanism only.
- A skill never calls a vendor CLI. It calls a port verb.
- The MCP server exposes the same verbs for agents with no shell.
- `bench run` is the one place the package starts an agent.
- For Claude Code the skills, hooks and MCP server ship as the `agentic-sdlc` plugin; other
  harnesses read the same skills from `.agents/skills/`.

## 3. Executors

Purpose: show how the orchestrator hands a stage to whoever runs it.

```mermaid
flowchart LR
  O["Orchestrator<br/>(sdlc skill)"]
  D["dispatch"]
  H["Harness subagent"]
  C["Command bot"]
  W["Webhook bot"]
  MG["Managed agent"]
  AS["Assign to hosted agent"]
  BF["Board + forge"]
  LG["Ledger row<br/>(executor, ref)"]

  O -->|"skill, ticket, cr"| D
  D -->|"harness"| H
  D -->|"command: run"| C
  D -->|"webhook: POST"| W
  D -->|"managed: session"| MG
  D -->|"assign: user + comment"| AS
  H --> BF
  C --> BF
  W --> BF
  MG --> BF
  AS --> BF
  BF -->|"next cycle reads"| O
  D --> LG
```

- Results come back only through board and forge writes. There is no direct reply channel.
- A second dispatch of the same ticket or CR, skill and head inside `cycle.dedupe_minutes` is a double fire. It is skipped.
- A dispatch is also skipped while the previous run of the same key has not finished, until `stall_minutes` pass.
- The rules for executors live in `skills/sdlc/references/executors.md`, part of the contract.

## 4. Trust boundaries

Purpose: show what runs where, which secret each part holds, and which inputs are untrusted.

```mermaid
flowchart LR
  subgraph U["Untrusted input"]
    U1["Signal text"]
    U2["CR bodies"]
    U3["Comments from non-bots"]
  end
  subgraph CIN["Forge CI: pull_request, no secrets"]
    REQ["Required job:<br/>install + verify"]
    POB["proofs-on-base"]
  end
  subgraph CI["Forge CI: trusted rules"]
    T["Binding read from<br/>TARGET branch"]
    GT["Gates: branch-names, linkage,<br/>proofs-on-base, approval,<br/>merged, shipped, signal-on-red,<br/>skill-regression"]
    BT["Board token"]
  end
  subgraph IS["Implementer sandbox"]
    IT["Implementer token<br/>(branch, CR, comments)"]
    IB["Board token"]
  end
  subgraph RS["Review runtime<br/>(runs no CR code)"]
    RV["Review token"]
  end
  HU["Human approver"]
  subgraph OR["Orchestrator"]
    OB["Board token<br/>(heartbeat)"]
  end

  U1 -->|"data, not commands"| OR
  U2 -->|"data, not commands"| RS
  U3 -->|"never state"| OR
  T --> GT
  GT --> BT
  IS -->|"opens draft CR"| CIN
  CIN -->|"checks"| RS
  RS -->|"review status + approve"| CI
  HU -->|"approving review"| GT
```

- CI loads the binding from the target branch, never from the CR.
- CR code runs only in the no-secrets `Required` job. The review runtime reads its result and
  runs no install or test command.
- The implementer holds no review token. It cannot post `review` or approve.
- The `approval` gate posts `human-approval` only with the approvals the CR's class needs.
- Only heartbeats by accounts in `owners.bots` count as state.
- Secrets reach an executor only when its entry lists them.

## 5. Installed project layout

Purpose: show where the factory lives in a project that installed it.

```mermaid
flowchart LR
  R["project/"]
  R --> A["AGENTS.md<br/>(agent card)"]
  R --> CL["CLAUDE.md<br/>(@AGENTS.md import, Claude only)"]
  R --> AG[".agents/"]
  R --> CIF["CI files<br/>(workflows, .gitlab-ci.yml, ...)"]
  AG --> SK["skills/<br/>(not for Claude: the plugin has them)"]
  AG --> BI["binding.yml"]
  AG --> SC["scorers/<br/>(done-conditions, ...)"]
  AG --> BE["bench/suites/<br/>(suite JSON files)"]
  AG --> HK["hooks/<br/>(pre-push)"]
```

- `.agents/` is the factory definition. Changing it is a factory change.
- Skills are copied whole, or come from the plugin. A project replaces only `binding.yml`.
- CI files call `agentic-sdlc gate <name>`.

# 7. Shipping

A merge makes the ticket Done and "Not shipped". Your deploy jobs then report each environment
to the `shipped` gate, which moves the ticket's **Shipped** field. `product.delivery` picks one of two ways.

## Continuous: every merge ships

```mermaid
flowchart LR
  m["Merge to trunk"]:::ci --> d1["Deploy staging"]:::ci --> d2["Deploy production"]:::ci
  m -.->|"merged gate"| t1["Done,<br/>Not shipped"]:::board
  d1 -.->|"shipped gate"| t2["On staging"]:::board
  d2 -.->|"shipped gate"| t3["On production"]:::board
  classDef ci fill:#bbf7d0,stroke:#15803d,color:#111
  classDef board fill:#e2e8f0,stroke:#64748b,color:#111
```

## Release line: the Product owner approves what ships

```mermaid
flowchart TD
  req["Release request<br/>(a labelled ticket)"]:::you --> rel["release skill:<br/>pick commit, version"]:::agent
  rel --> ok["Product owner<br/>approves"]:::you --> cut["Cut the<br/>release line"]:::ci
  cut --> d["Deploy production"]:::ci -.->|"shipped gate"| t["On production,<br/>tag created"]:::board
  classDef you fill:#fde68a,stroke:#b45309,color:#111
  classDef agent fill:#c7d2fe,stroke:#4f46e5,color:#111
  classDef ci fill:#bbf7d0,stroke:#15803d,color:#111
  classDef board fill:#e2e8f0,stroke:#64748b,color:#111
```

- You open a release request (a Backlog ticket with the `release` label). A P0 fix on the first
  environment opens one by itself.
- Agents never approve the last environment. On GitHub you approve the release workflow run.
- With release evidence (`product.evidence`), the release is ready only when `commands.evidence_check` passes.

## When something fails

```mermaid
flowchart LR
  red["Red trunk CI,<br/>or a failed deploy"]:::ci --> sig["New Signal<br/>(evidence attached)"]:::board
  sig -->|"triage-signal"| nt["New ticket with<br/>a regression case"]:::board
  red -.->|"never reopens"| done["The original ticket:<br/>stays Done"]:::board
  classDef ci fill:#bbf7d0,stroke:#15803d,color:#111
  classDef board fill:#e2e8f0,stroke:#64748b,color:#111
```

- A failed deploy moves its tickets back to the last good environment and opens one Signal.
- A rollback reports `--result rolled-back`: tickets not in the running revision step back.
- A failed release line is left as it is. The fix ships under the next version.
- If the delivery run itself fails, start the delivery workflow by hand with the commit's sha: it
  runs the `merged` gate again.

Next: [8. When you are needed](8-when-you-are-needed.md).

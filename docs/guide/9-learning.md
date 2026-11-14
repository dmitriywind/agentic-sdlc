# 9. Learning

Optional. Off until you set `learning.enabled: true` and an `agent_command` for the bench.

The factory can improve its own skills, one proven change at a time.

```mermaid
flowchart TD
  runs["Runs<br/>(heartbeats)"]:::board --> judge["judge-run:<br/>grade each run"]:::agent
  judge --> worst["Worst repeated<br/>failure"]:::agent
  worst --> prop["improve-factory:<br/>one change"]:::agent
  prop --> bench["Bench: replay<br/>your merged work"]:::ci
  bench --> cr["Factory change<br/>request"]:::ci
  cr -->|"review and gates"| runs
  classDef agent fill:#c7d2fe,stroke:#4f46e5,color:#111
  classDef ci fill:#bbf7d0,stroke:#15803d,color:#111
  classDef board fill:#e2e8f0,stroke:#64748b,color:#111
```

1. `judge-run` grades each finished run with the scorers in `.agents/scorers/`, on a different model
   than the run used. Your own grades always win over the judge's.
2. Every `learning.every_cycles` cycles, `improve-factory` finds the worst failure that repeats in at
   least `learning.min_evidence_runs` runs.
3. It proposes exactly one change: a skill sentence, a binding value, a gate or an executor.
4. The bench replays cases built from your merged work, with the change and without it. The change
   must not lower the pass rate (`learning.bench_min_cases`, `bench_trials`, a Wilson lower bound).
5. The change goes through review and the gates like any other. A `guardrail` change needs the factory
   owner; a `tuning` change (the model map) may merge alone once a bench baseline exists.

Next: [10. The parts](10-parts.md).

# 12. Glossary
<!-- group: Reference -->

The words the guide uses. On the guide page, the first use of each word in a chapter shows its
meaning when you point at it.

| Term | Means |
|---|---|
| factory | The skills, your settings (the binding), the CLI and the CI checks, working together. |
| cycle | One scheduled agent run that moves each ticket one step and writes a heartbeat. |
| ticket | One item on the board. Its status says where it stands. |
| status | Where a ticket stands: Ideas, Signals, Backlog, Ready, In progress, In review, Done or Cancelled. |
| Signal | Raw input on the board: an alert, feedback, a red CI run, a scanner finding. triage-signal decides on it. |
| skill | A written procedure an agent follows for one step, such as shape or review-pr. |
| binding | The file .agents/binding.yml: every value of your project. The only file a project changes. |
| change request | A pull request. Its short-lived branch is the change line. |
| change line | The short-lived branch of one change request, named after its ticket. |
| main branch | The trunk: the one long-lived branch every change merges into. |
| forge | Where pull requests and CI live. GitHub is the only one supported. |
| gate | A CI job that posts a required check. Agents cannot skip it. |
| check | A pass, pending or fail result on a pull request. Six are required to merge. |
| lane | Fast (small, low risk: merges on the agent review) or Full (also needs a human approval). |
| proof | How a criterion is shown done: a test, an eval, a visual check, a data check, computer-use or manual. |
| hold | The needs-human label: every skill skips the ticket until an owner replies. |
| heartbeat | One comment per cycle on the heartbeat ticket: what ran, on which model, what failed. |
| identity | The GitHub account the factory acts as. One identity is yours; two adds a separate review app. |
| profile | Who pays for the agents: individual, individual-api or organization. |
| executor | Who runs a skill: a subagent, a local CLI, a bot, a managed agent or a hosted coding agent. |
| harness | The agent product that runs the cycle: Claude Code, Codex, Cursor or another. |
| port | One group of CLI verbs the skills use: board, forge or Git. |
| dispatch | Starting one skill on one ticket through its executor. |
| Shipped | A ticket field, not a status: where the merged change runs (On staging, On production). |

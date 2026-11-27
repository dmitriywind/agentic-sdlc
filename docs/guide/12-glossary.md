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
| Signal | Raw input on the board: an alert, feedback, a red CI run, a scanner finding. plan/triage decides on it. |
| skill | One phase of the process, written for agents: sdlc, plan, build, review, ship, learn or escalate. Its steps are what runs. |
| step | The unit that runs, named skill/step, such as plan/shape or review/review. A skill with one step runs by its name, such as build. |
| navigator | The sdlc skill: it routes each ticket and pull request to its next step and runs one cycle. |
| binding | The file .agents/binding.yml: every value of your project. The only file a project changes. |
| change request | A pull request. Its short-lived branch is the change line. |
| change line | The short-lived branch of one change request, named after its ticket. |
| main branch | The trunk: the one long-lived branch every change merges into. |
| forge | Where pull requests and CI live. GitHub is the only one supported. |
| gate | A CI job that posts a required check. Agents cannot skip it. |
| check | A pass, pending or fail result on a pull request. Six are required to merge. |
| verdict | The pass or fail that forge verdict publishes for the latest commit of a pull request, with the review report. A new commit needs a new verdict. |
| queue | The output of forge queue: every open pull request with its one next action (review, rework, sync, land, wait or escalate). |
| land | What forge land does: wait for the required checks, then turn on auto-merge, or report who must approve. The only way a change merges. |
| lane | Fast (small, low risk: merges on the agent review) or Full (also needs a human approval). |
| proof | How a criterion is shown done: a test, an eval, a visual check, a data check, computer-use or manual. |
| hold | The needs-human label with one ask (board hold): every step skips the ticket until an owner replies, then the cycle releases it (board release). |
| comment kind | The role of a factory comment, such as spec, verdict, note, ask or heartbeat. The CLI stamps its first line, and steps find comments by it. |
| heartbeat | One comment per cycle on the heartbeat ticket: what ran, on which model, what failed. |
| identity | The GitHub account the factory acts as. One identity is yours; two adds a separate review app. |
| profile | How the factory is run: individual (one identity) or organization (a separate review identity). |
| executor | Who runs a step: a subagent (`harness`) or a local CLI (`command`). |
| harness | The agent product that runs the cycle: Claude Code. |
| port | One group of CLI verbs the skills use: board, forge or Git. |
| dispatch | Starting one step on one ticket or pull request through its executor. |
| pin | The file .agents/cli.json: the tag or commit of agentic-sdlc the project runs. An upgrade changes it. |
| launcher | The script .agents/bin/agentic-sdlc: it installs the pinned CLI on first use and runs it. Workflows, hooks and runners all call it. |
| Shipped | A ticket field, not a status: where the merged change runs (On staging, On production). |

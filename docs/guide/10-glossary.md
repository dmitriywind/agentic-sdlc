# 10. Glossary
<!-- group: Reference -->

The words the guide uses. On the guide page, the first use of each word in a chapter shows its
meaning when you point at it.

| Term | Means |
|---|---|
| factory | The skills, your settings (the binding), the CLI and the CI checks, working together. |
| cycle | One scheduled agent run that moves each ticket one step and writes a heartbeat. |
| routine | A Claude cloud scheduled task: it runs the cycle on Anthropic's cloud on your subscription. |
| ticket | One GitHub issue on the board. Its status label says where it stands. |
| status | Where a ticket stands: Ideas, Signals, Backlog, Ready, In progress, In review, Done or Cancelled. |
| Signal | Raw input on the board, with a signal: label: your report, an alert, a red CI run, a failed deploy. plan/triage decides on it. |
| skill | One phase of the process, written for agents: sdlc, plan, build, review, ship, learn, escalate, and setup. |
| step | The unit that runs, named skill/step, such as plan/shape or review/review. A skill with one step runs by its name, such as build. |
| navigator | The sdlc skill: it runs one cycle and routes each ticket and pull request to its next step. |
| binding | The file .agents/binding.yml: every value of your project. |
| change request | A pull request. Its short-lived branch is the change line. |
| main branch | The trunk: the one long-lived branch every change merges into. |
| gate | A CI job that posts a required check. Agents cannot skip it. |
| check | A pass, pending or fail result on a pull request. Six are required to merge. |
| verdict | The pass or fail that forge verdict publishes for the latest commit, with the review report. A new commit needs a new verdict. |
| queue | The output of forge queue: every open pull request with its one next action. |
| land | What forge land does: wait for the required checks, then turn on auto-merge, or report who must approve. The only way a change merges. |
| lane | Fast (small, low risk: merges on the agent review) or Full (also needs an approval). |
| approval label | The label (approved by default) an owner adds to a pull request to approve its latest commit. A push removes it. |
| proof | How a criterion is shown done: a test, an eval, a visual check, a data check, computer-use or manual. |
| hold | The needs-human label with one ask: every step skips the ticket until an owner replies. |
| heartbeat | One comment per cycle on the heartbeat issue: what ran, on which model, what failed. |
| dead-man check | A scheduled workflow outside the cycle that files a Signal when no heartbeat arrived in time. |
| Shipped | A ticket field, not a status: where the merged change runs (On staging, On production). |
| pin | The file .agents/cli.json: the tag or commit of agentic-sdlc the project runs. |
| launcher | The script .agents/bin/agentic-sdlc: it installs the pinned CLI on first use and runs it. |

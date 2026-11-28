---
name: setup
description: Use when installing or repairing the agentic-sdlc factory in a project, or when the person asks what now, what is happening, or what waits on them.
metadata:
  tier: balanced
---

# Setup and status

One first call decides the job: `agentic-sdlc status` (compact JSON). Follow
[the contract](../sdlc/references/contract.md) for words and trust.

- `installed: false`, or `problems` or `unresolved` not empty: **install or repair** (below).
- Otherwise: **answer from the state** (last section). Do not run a cycle; that is the `sdlc` skill.

## Install or repair

1. **Install.** Not installed: run the `install` command `status` printed. Installed:
   `agentic-sdlc init --upgrade`. Done when it exits 0; keep its `kept` and `next` lines for the report.
2. **Read the project** as [reading the project](references/project.md) says, and
   `agentic-sdlc forge whoami` for the login, the repo and the default branch.
3. **Resolve the binding.** `agentic-sdlc validate --json` lists every `unresolved` key with a hint, and under
   `missing` the keys the template has and an older binding lacks: add those from the template, and delete
   `forge.options.token_env` unless the project sets that secret.
   Replace each in `.agents/binding.yml` with the value the project states; delete a key the project
   has no use for only where the reference says it may go. A value no source states stays unresolved
   and goes on the person's list: never write a guess as a fact. Done when every remaining unresolved
   key has a reason.
4. **Rewrite the generated files** from the new values: `agentic-sdlc init --upgrade` again. A pin that is a
   commit sha stays; only `--ref` moves it.
5. **Board.** `agentic-sdlc board bootstrap` creates the labels and, while `heartbeat.ticket` is
   unresolved, the heartbeat ticket; put the `heartbeat.id` it prints into `heartbeat.ticket`. A second
   run creates nothing. Done when it prints no new heartbeat.
6. **Board page.** Only with a `github-issues` board and a tool that publishes a page on claude.ai:
   `agentic-sdlc board page --out <a scratch folder>`, then publish its `page` with its `data` file beside it as
   `board.json`, under the `title` and with the `capabilities` it prints. `board.page` set: publish to that URL.
   Not set: put the new URL into `board.page`. Never commit the two files. Without such a tool, skip the
   step and say so in the report. Done when `board.page` opens the page.
7. **Check until clean.** Loop `agentic-sdlc validate --json`, then `agentic-sdlc doctor`: fix what a
   binding value or a rerun of step 4 or 5 fixes; stop after three rounds without progress. Done when
   both exit 0, or each remaining line is on the person's list.
8. **Propose the install.** It is a factory change: commit the files init and this skill wrote on a
   new line named by `vcs.factory_change_pattern` (name `setup`), `agentic-sdlc vcs push`, then
   `agentic-sdlc forge open --source <that line> --title "Install the factory" --body-file <f>`. Done
   when the CR is open; it lands through its checks like any factory change.
9. **Report.** Call `agentic-sdlc status` and end with a short checklist: every `person` entry as
   given (its step, where to do it, the text to paste), marked checked or not checked by its
   `verified` value (`null`: cannot be checked from here, say so); then each unresolved key and each
   failing doctor line you could not fix, with the one action that fixes it.

## Answer from the state

From the one `status` result (run `agentic-sdlc doctor` only when the person asks why something
is broken), answer in this order, one line each, plain words:

1. **Waiting on you**: each `waiting` entry. A `hold`: the ticket, its ask, since when, and whether
   a reply already came. An `approval`: the CR link, its class, and that applying the `label` on the
   forge approves its current head (a push withdraws it); only the people in `who` can.
2. **Next cycle**: `cycle.work` as is; `idle: true` says nothing is due.
3. **Broken**: each `broken` line and each `problems` line, with its fix when the line names one.
4. **Last heartbeat**: `heartbeat.at` and its age; none, or older than two schedule intervals, means
   the scheduled cycle is not running: point at the matching `person` step.
5. **Still to do by you**: the `person` entries, as in step 9.

When the person asks to update the board page, run step 6 again.

## Rules

- Every board, forge and VCS action goes through `agentic-sdlc <group> <verb>`.
- Never apply `forge.approval_label`, never move a ticket or release a hold here: those are the
  person's acts or a cycle's.
- No secret in the binding: name the env var.

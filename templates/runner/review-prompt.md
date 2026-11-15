Preamble (scheduler setup, not part of the prompt):
1. Install this run only when the binding sets `forge.review_identity`. Start it when the cycle's
   `dispatch review/review` fires it (a job dependency, or `AGENTIC_REVIEW_FIRE_CMD`), never on its own clock.
2. Export the review token (`forge.options.review_token_env`, e.g. AGENTIC_REVIEW_TOKEN) here and nowhere else, plus the
   board and forge tokens and the agent's own key.
3. Set `AGENTIC_SDLC_UNATTENDED=1` and `AGENTIC_SDLC_ROLE=review`. Run `sh .agents/runner-setup.sh` first. Never overlap
   two review runs on the same repo.
4. This run holds the review token, so it runs no install or test command: CI posts the checks it reads.
5. The first line works with and without the Claude Code plugin, as in `cycle-prompt.md` (the copies are named `sdlc-review`).
6. Copy everything below the line into the scheduler as the prompt (installed at `.agents/review-prompt.md`).

---
Load the `review` skill: invoke `/agentic-sdlc:review` when that skill is available, otherwise read `.claude/skills/sdlc-review/SKILL.md`, otherwise `.agents/skills/sdlc-review/SKILL.md`. Call the CLI as `npx --no agentic-sdlc ...`.
For each row of `npx --no agentic-sdlc forge queue` with action `review`, run the review step: `npx --no agentic-sdlc dispatch review/review --cr <n> [--ticket <ticket>] --unattended`, then follow `steps/review.md` for that CR.
Then write one heartbeat with `kind: review` and a row per review run, as the `sdlc` skill's Report step says. With no run, write nothing. Do nothing else.

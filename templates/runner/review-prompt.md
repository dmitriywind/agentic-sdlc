Preamble (scheduler setup, not part of the prompt):
1. This is the review runtime. Start it when the cycle found a CR that needs a review (a job
   dependency, or the cycle's `AGENTIC_REVIEW_FIRE_CMD`), never on its own clock.
2. Export the review token (`forge.options.review_token_env`, e.g. AGENTIC_REVIEW_TOKEN) here and nowhere else, plus the board and forge tokens and the agent's own key.
3. Set `AGENTIC_SDLC_UNATTENDED=1` and `AGENTIC_SDLC_ROLE=review` (the plugin's hook allows `forge approve` only then).
   Run `sh .agents/runner-setup.sh` first. Never overlap two review runs on the same repo.
4. This run holds the review token, so it runs no install or test command: `Required` and `proofs-on-base` come from CI.
5. The first line works with and without the Claude Code plugin, as in `cycle-prompt.md`.
6. Copy everything below the line into the scheduler as the prompt (installed at `.agents/review-prompt.md`).

---
Load the `sdlc` and `review-pr` skills: invoke `/agentic-sdlc:sdlc` when that skill is available, otherwise read `.claude/skills/sdlc/SKILL.md` and `.claude/skills/review-pr/SKILL.md`, otherwise the same files under `.agents/skills/`. Review only.
Call the CLI as `npx --no agentic-sdlc ...` and pass `--unattended` to every dispatch.
For each open CR that needs a review (the `sdlc` skill's Run one cycle defines it), run review-pr once: `npx --no agentic-sdlc dispatch review-pr --ticket <id> --unattended` for a CR that closes a ticket at In review, `--cr <n>` for a factory or dependency CR.
Then write one heartbeat with `"kind": "review"` holding a row per run you dispatched (the skill's `references/heartbeat.md`). With no run dispatched, write nothing.
Do nothing else.

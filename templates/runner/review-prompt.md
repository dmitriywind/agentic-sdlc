Preamble (scheduler setup, not part of the prompt):
1. This is the review runtime. Start it when the cycle ends (a job
   dependency, or the cycle's `AGENTIC_REVIEW_FIRE_CMD`), never on its own clock.
2. Export the review token (`forge.options.review_token_env`, e.g. AGENTIC_REVIEW_TOKEN) here and nowhere else, plus the board and forge tokens and the agent's own key.
3. Set `AGENTIC_SDLC_UNATTENDED=1` and `AGENTIC_SDLC_ROLE=review` (the plugin's hook allows `forge approve` only then).
   Run `sh .agents/runner-setup.sh` first. Never overlap two review runs on the same repo.
4. This run holds the review token, so it runs no install or test command: `Required` and `proofs-on-base` come from CI.
5. Claude Code: the first line invokes the plugin's `sdlc` skill; other harnesses follow the second sentence.
6. Copy everything below the line into the scheduler as the prompt (installed at `.agents/review-prompt.md`).

---
/agentic-sdlc:sdlc Review only. Without the Claude Code plugin, load the `sdlc` and `review-pr` skills from `.agents/skills/` first.
Call the CLI as `npx --no agentic-sdlc ...` and pass `--unattended` to every dispatch.
Run review-pr on every ticket at In review whose CR is draft, or ready and behind, red or stalled: `npx --no agentic-sdlc dispatch review-pr --ticket <id> --unattended`.
Run it too on every open factory CR (a change only under `paths.factory`; it has no ticket): `npx --no agentic-sdlc dispatch review-pr --cr <n> --unattended`.
Run it on every ticket at In review whose CR is ready with no `review` status on its head, and on every open dependency CR (`dependabot/`, `renovate/`): `--cr <n>`.
Then write one heartbeat with `"kind": "review"` holding a row per run you dispatched (`.agents/skills/sdlc/references/heartbeat.md`).
Do nothing else.

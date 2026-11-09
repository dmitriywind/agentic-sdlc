Preamble (scheduler setup, not part of the prompt):
1. This is the review runtime (`forge.review_runtime: separate`). Schedule it right after the cycle, as its own job or task.
2. Export the review token (`forge.options.review_token_env`, e.g. AGENTIC_REVIEW_TOKEN) here and nowhere else, plus the board and forge tokens and the agent's own key.
3. Set `AGENTIC_SDLC_UNATTENDED=1`. Run `sh .agents/runner-setup.sh` first. Never overlap two review runs on the same repo.
4. Copy everything below the line into the scheduler as the prompt (installed at `.agents/review-prompt.md`).

---

Load the sdlc and review-pr skills. Run review-pr on every ticket at In review whose CR is draft, or ready and behind/red/stalled. Do nothing else.

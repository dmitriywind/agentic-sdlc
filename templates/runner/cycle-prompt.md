Preamble (scheduler setup, not part of the prompt):
1. Give the run access to this repository (checkout or clone) with push rights to a branch.
2. Export the env vars `.agents/binding.yml` names (board and forge tokens, plus the agent's own key), but never the review token:
   only the review run (`review-prompt.md`) holds it.
3. Run `sh .agents/runner-setup.sh` first; it validates the binding and checks reachability.
4. Run one cycle at a time: never overlap two runs on the same repo.
5. Set `AGENTIC_SDLC_UNATTENDED=1` in the run's environment.
6. Run the session on the binding's `models.fast` model; subagents take their skill's tier.
7. The first line works with and without the Claude Code plugin: it names the plugin skill, then the
   `.claude/skills/` copy (`init --harness claude`), then the `.agents/skills/` copy that every harness has.
8. A scheduler without job dependencies (routines, Managed Agents deployments): set `AGENTIC_REVIEW_FIRE_CMD`
   to the command that starts the review run (see `routine.md`); the cycle runs it only when a CR needs a review.
9. Copy everything below the line into the scheduler as the prompt (installed at `.agents/cycle-prompt.md`).

---
Load the `sdlc` skill: invoke `/agentic-sdlc:sdlc` when that skill is available, otherwise read `.claude/skills/sdlc/SKILL.md`, otherwise `.agents/skills/sdlc/SKILL.md`. Then run exactly one cycle.
Call the CLI as `npx --no agentic-sdlc ...` and pass `--unattended` to every `npx --no agentic-sdlc dispatch` call, so no executor runs on this machine's local sandbox.
Never run `agentic-sdlc forge approve`: this run is not the review identity.
When the cycle ends, write the heartbeat as the skill describes. Then, only if the review hand-off step found a CR that needs a review and `AGENTIC_REVIEW_FIRE_CMD` is set, run `sh -c "$AGENTIC_REVIEW_FIRE_CMD"` once. Then stop. Do not start a second cycle.

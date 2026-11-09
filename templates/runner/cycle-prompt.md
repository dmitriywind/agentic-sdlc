Preamble (scheduler setup, not part of the prompt):
1. Give the run access to this repository (checkout or clone) with push rights to a branch.
2. Export the env vars `.agents/binding.yml` names (board and forge tokens, plus the agent's own key), but never the review token:
   with `forge.review_runtime: separate` (the default) only the review run (`review-prompt.md`), scheduled right after this one, holds it.
3. Run `sh .agents/runner-setup.sh` first; it validates the binding and checks reachability.
4. Run one cycle at a time: never overlap two runs on the same repo.
5. Set `AGENTIC_SDLC_UNATTENDED=1` in the run's environment.
6. Copy everything below the line into the scheduler as the prompt (installed at `.agents/cycle-prompt.md`).

---

Load the `sdlc` skill (`.agents/skills/sdlc/SKILL.md`) and run exactly one cycle.
Pass `--unattended` to every `agentic-sdlc dispatch` call, so no executor runs on this machine's local sandbox.
When the cycle ends, write the heartbeat as the skill describes, then stop. Do not start a second cycle.

Preamble (scheduler setup, not part of the prompt):
1. Give the run access to this repository (checkout or clone) with push rights to a branch.
2. Export the env vars `.agents/binding.yml` names (board and forge tokens, plus the agent's own key), but never the review token:
   with `forge.review_runtime: separate` (the default) only the review run (`review-prompt.md`), started when this one ends, holds it.
3. Run `sh .agents/runner-setup.sh` first; it validates the binding and checks reachability.
4. Run one cycle at a time: never overlap two runs on the same repo.
5. Set `AGENTIC_SDLC_UNATTENDED=1` in the run's environment.
6. Claude Code: the first line invokes the plugin's `sdlc` skill (install the `agentic-sdlc` plugin, or pass
   `--plugin-dir node_modules/agentic-sdlc`). Other harnesses (Codex, Cursor, Antigravity, Grok) read the
   same text: the second sentence tells them where the skill is without the plugin.
7. A scheduler without job dependencies (routines, Managed Agents deployments): set `AGENTIC_REVIEW_FIRE_CMD`
   to the command that starts the review run (see `routine.md`); the last step below runs it.
8. Copy everything below the line into the scheduler as the prompt (installed at `.agents/cycle-prompt.md`).

---
/agentic-sdlc:sdlc Run exactly one cycle. Without the Claude Code plugin, load the `sdlc` skill from `.agents/skills/sdlc/SKILL.md` first.
Call the CLI as `npx agentic-sdlc ...` and pass `--unattended` to every `npx agentic-sdlc dispatch` call, so no executor runs on this machine's local sandbox.
Never run `agentic-sdlc forge approve`: this run is not the review identity.
When the cycle ends, write the heartbeat as the skill describes. Then, if `AGENTIC_REVIEW_FIRE_CMD` is set, run `sh -c "$AGENTIC_REVIEW_FIRE_CMD"` once. Then stop. Do not start a second cycle.

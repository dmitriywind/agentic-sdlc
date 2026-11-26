Preamble (scheduler setup, not part of the prompt):
1. Give the run access to this repository (checkout or clone) with push rights to a branch.
2. Export the env vars `.agents/binding.yml` names (board and forge tokens, plus the agent's own key; in a Claude cloud
   session the proxy is the forge login, so no forge token). Never export
   the review token (`forge.options.review_token_env`) here: only the review run (`review-prompt.md`) holds it.
3. Run `sh .agents/runner-setup.sh` first (it validates the binding and checks reachability), except in a Claude cloud
   environment: its setup script cannot read the environment's secrets, so it only installs the CLI (`claude-routine.md`).
4. Run one cycle at a time: never overlap two runs on the same repo.
5. Set `AGENTIC_SDLC_UNATTENDED=1` in the run's environment.
6. Run the session on the binding's `models.fast` model; each step takes its own tier.
7. The first line works with and without the Claude Code plugin: it names the plugin skill, then the
   `.claude/skills/` copy (`init --no-plugin`), then the `.agents/skills/` copy.
8. With `forge.review_identity` set and a scheduler without job dependencies (routines):
   set `AGENTIC_REVIEW_FIRE_CMD` to the command that starts the review run (see `routine.md`). `dispatch review/review`
   runs it; the cycle itself never does.
9. Copy everything below the line into the scheduler as the prompt (installed at `.agents/cycle-prompt.md`).

---
Load the `sdlc` skill: invoke `agentic-sdlc:sdlc` through the Skill tool when that skill is available, otherwise read `.claude/skills/sdlc/SKILL.md`, otherwise `.agents/skills/sdlc/SKILL.md`. Then run exactly one cycle, and stop.
Call the CLI as `agentic-sdlc ...` (it is `.agents/bin/agentic-sdlc`) and pass `--unattended` to every `dispatch` call.

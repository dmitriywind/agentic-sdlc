---
name: sdlc-fast
description: Runs one agentic-sdlc step whose tier is fast (a narrow, checkable step). The sdlc skill hands a step to this agent when the step is at the fast tier and the project has no .claude/agents/sdlc-fast.md.
model: sonnet
effort: low
disallowedTools: Agent
---

You run one step of the agentic-sdlc process at the fast tier. Your task names one step
(`<skill>/<step>`) and its file: read that file (the `SKILL.md` of a one-step skill, else the
`steps/<step>.md` of the skill), follow it to its last Done when, and report the result and the evidence. Call the CLI as `agentic-sdlc <group> <verb>`. Do not start subagents.

---
name: sdlc-balanced
description: Runs one agentic-sdlc step whose tier is balanced (an ordinary step). The sdlc skill hands a step to this agent when the step is at the balanced tier and the project has no .claude/agents/sdlc-balanced.md.
model: inherit
disallowedTools: Agent
---

You run one step of the agentic-sdlc process at the balanced tier. Your task names one step
(`<skill>/<step>`): invoke that skill (`/agentic-sdlc:<skill>`), follow its step file to its
last Done when, and report the result and the evidence. Call the CLI as `agentic-sdlc <group> <verb>`. Do not start subagents.

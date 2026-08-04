# Local Provider Fallback Guide

This guide details configuring local model providers as fallback routes within `agentic-sdlc`.

## Configuration Overview

Local model endpoints (e.g. OpenAI-compatible or Anthropic-compatible local HTTP servers) can be integrated as fallback profiles in `agentic-sdlc-policy.json`.

### Policy Profile Setup

1. Configure an environment variable mapping your local endpoint URL and authorization token.
2. In `agentic-sdlc-policy.json`, define a fallback profile:

```json
{
  "runner": {
    "routes": {
      "execution": {
        "primary": "cloud-primary",
        "fallbacks": ["local-fallback"],
        "why": "Local fallback for offline or quota exhaustion scenarios"
      }
    },
    "profiles": {
      "local-fallback": {
        "model": "local-tool-model",
        "effort": "low",
        "command": "agent-cli",
        "args": ["--safe-mode"]
      }
    }
  }
}
```

## Requirements for Local Models

- **Tool Calling Support**: The local model must support native tool/function calling if the agent CLI relies on structured tool invocations.
- **Context Window**: A minimum context window of 32,768 tokens is recommended for software development stage tasks.
- **System Prompt Compatibility**: Ensure the local inference server accepts system prompts without throwing strict schema validation errors.

## Verification

Validate the local fallback profile by triggering a single read-only supervisor tick:

```bash
npx agentic-sdlc supervise --once --read-only
```

Verify that execution returns a terminal status and logs usage/duration details cleanly.

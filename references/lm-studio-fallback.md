# LM Studio fallback

Use this only for a last-resort local profile. The portable process does not require LM Studio.

## Configure

1. Start LM Studio's local server.
2. Load a tool-capable model with enough context for the agent CLI:

   ```powershell
   lms load <model-key> --gpu max --context-length 32768 --parallel 1 --ttl 3600 -y
   ```

3. Add a policy profile that:
   - points `ANTHROPIC_BASE_URL` at the local server;
   - supplies the local server token expected by the Claude-compatible endpoint;
   - invokes Claude Code with `--safe-mode`, a minimal `--system-prompt`, an explicit lane tool
     allowlist, a pinned `--model`, explicit `--effort`, and the permissions required by that lane.

`--safe-mode` prevents cloud connectors, plugins, hooks, and unrelated MCP startup from breaking
local-token mode. Put every required project rule in `rules.context`; the runner includes those
files in the bounded stage prompt.

## Qwen compatibility

If LM Studio reports `System message must be at the beginning`, override that model's prompt
template under **Load Parameters → Prompt Template**. The template must render later system
messages instead of raising an exception. For model YAML, current LM Studio versions use the
load field `llm.load.promptTemplate`, not the older prediction-operation field.

Hybrid reasoning models may ignore the CLI effort budget and generate hidden reasoning toward
the full context limit. Disable the model template's independent **Enable Thinking** toggle when
that happens, and use low effort for the local profile. Keep stronger cloud models ahead of it.

Reload the model after changing load parameters.

## Verify

Run a one-line Claude Code smoke through the local endpoint, then run one read-only SDLC stage
through the configured profile. A passing smoke must exit zero, return a terminal result, and
record the selected model and effort. Parser success alone is not enough.

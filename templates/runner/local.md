# Local execution (your own machine)

Profile: any. Use it when the cycle must run where your code, tools or network are: a private
network, a device, a GPU, or no cloud at all. The machine must be on at each scheduled time.

Warning: a local run has no sandbox. Every agent the cycle starts runs with your user account,
your files and your logins. Use a separate clone, never your working copy, and keep only the
secrets the binding names in the scheduler's environment.

## Opt in
1. In the binding, name the local sandbox for every stage that runs here:
   `executors: { default: { kind: harness, sandbox: local } }`.
2. In the scheduler's environment, set `AGENTIC_SDLC_UNATTENDED=1` and `AGENTIC_SDLC_LOCAL=1`.
   `dispatch` refuses a local stage in an unattended run without both. An unset sandbox stays refused.

## The command
Run it from the root of a separate clone, one run at a time:
```bash
git pull --ff-only && sh .agents/runner-setup.sh && claude -p "$(sed '1,/^---$/d' .agents/cycle-prompt.md)" \
  --permission-mode acceptEdits --max-turns 200 --output-format json \
  --allowedTools "Bash(npx --no agentic-sdlc *)" "Bash(git add *)" "Bash(git commit *)" "Bash(git push *)" "Bash(npm run *)" "Bash(npm test *)" "mcp__agentic-sdlc" "mcp__plugin_agentic-sdlc_agentic-sdlc" \
  --disallowedTools "Bash(npx --no agentic-sdlc forge approve *)"
```
Set the npm entries to the binding's `commands.fast_check` and `commands.verify`. The login is your
subscription (`claude` logged in, or `CLAUDE_CODE_OAUTH_TOKEN`); the runner setup fails when
`ANTHROPIC_API_KEY` is set under an individual profile. With two identities, run the review the same
way with `review-prompt.md`, `AGENTIC_REVIEW_TOKEN` and `AGENTIC_SDLC_ROLE=review` in its environment only.

## Schedulers
| Scheduler | Entry |
|---|---|
| cron (Linux) | `0 * * * * cd /srv/app-factory && flock -n .agents/runtime/cycle.lock sh -c '<the command>' >> .agents/runtime/cycle.log 2>&1` |
| launchd (macOS) | A LaunchAgent with `StartInterval` 3600 that runs the command in the clone. macOS has no `flock`: use `shlock` or a lock directory (`mkdir .agents/runtime/cycle.lock`). |
| Task Scheduler (Windows) | `schtasks /Create /SC HOURLY /TN agentic-cycle /TR "\"C:\Program Files\Git\bin\bash.exe\" -lc 'cd /c/factory/app && <the command>'"`. Set "Do not start a new instance" in the task's settings. |
| Claude Desktop scheduled task | A local scheduled task in the Claude desktop app, with the clone as its folder and the text of `cycle-prompt.md` below the `---` line as its prompt. It runs only while the app is open. |

Gates still run in the forge's CI. A local runner changes where agents run, not what merges.

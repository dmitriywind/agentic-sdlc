# 7. Install
<!-- group: Adopt -->

Three steps, once, on a computer with Claude Code and Node 22.18 or later. After that you work from
the phone.

## 1. Add the plugin

In Claude Code:

```text
/plugin marketplace add dmitriywind/agentic-sdlc
/plugin install agentic-sdlc@agentic-sdlc
```

The plugin brings the skills, the guard hook, a session-start hook, the MCP server, a subagent per
model tier, the read-only `sdlc-reviewer`, and `agentic-sdlc` on the Bash path.

## 2. Run the setup skill

Open your repo in Claude Code and ask it to set up the factory. The `setup` skill:

1. runs `agentic-sdlc init --no-plugin`, which writes `.agents/` (the binding, the CLI pin
   `.agents/cli.json` and the launcher `.agents/bin/agentic-sdlc`), the workflows and rulesets under
   `.github/`, and the skills, reviewer and hooks under `.claude/`, because a cloud routine loads
   only the repo's own files;
2. reads the project and `agentic-sdlc forge whoami`, and replaces each `unresolved: <hint>` in the
   binding with what the project states, leaving the rest on your list;
3. runs `agentic-sdlc board bootstrap`: the labels and the heartbeat issue
   ([the bootstrap feature](../../features/board/bootstrap.feature));
4. loops `validate --json` and `doctor` until they pass, or each line left is on your list;
5. opens the install as a factory pull request, and ends with a checklist.

The behaviour is in [the init feature](../../features/install/init.feature) and
[the validate feature](../../features/install/validate.feature). The CLI installs from Git only: the
npm package named `agentic-sdlc` is a different project.

## 3. Do the checklist

The skill's checklist comes from the `person` list of `agentic-sdlc status`
([the status feature](../../features/cycle/status.feature)): each item says where to do it, and the
ones the CLI can check are marked. Around it, merge the install pull request and write two docs.

| Step | Where |
|---|---|
| Merge the install pull request. | GitHub. It is a factory change, so see [3. Your part](3-your-part.md) for who can approve it. |
| Install the Claude GitHub App on this repo only. | github.com/apps/claude |
| Create the cloud routine that runs one cycle: this repo, an environment with `AGENTIC_SDLC_UNATTENDED=1` and the setup script from `templates/runner/claude-routine.md`, the model of `models.fast`, the prompt from `.agents/cycle-prompt.md`, and a schedule at least an hour apart (for example `7 */2 * * *`). | claude.ai/code/routines |
| Optional: a GitHub event trigger on Issues (opened, labeled), so a new Signal starts a cycle. Not yet tried on a real routine. | the routine's triggers |
| Protect the main branch: import `.github/rulesets/trunk.json`. A private repo on GitHub Free cannot enforce it. | the repo's Settings > Rules |
| Write the two docs every ticket is judged against: `paths.importance_doc` and `paths.guiding_narrative`. Without them product questions become holds. | the repo |

<div class="callout ok">

**Done when** a scheduled cycle writes a heartbeat with no `errors`, and a pull request merges through
the checks. Run the first cycles with two or three small tickets and read every comment they write.

</div>

## Try it with no accounts

The `local` board is a file, `.agents/board.json`:

```bash
mkdir try-agentic && cd try-agentic && git init -b main
npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v0.2.0 init --board local --no-plugin
printf 'Show a greeting on the home page.\n' > body.md
.agents/bin/agentic-sdlc board create --title "Greeting" --body-file body.md --status Backlog
.agents/bin/agentic-sdlc dispatch plan/shape --ticket 2
```

`dispatch` prints the instruction an agent would follow and starts nothing. Open the folder in
Claude Code and ask it to run the `sdlc` skill for one cycle. npm older than 12 does not know
`--allow-git`: drop the flag there.

Next: [8. Run it](8-run-it.md).

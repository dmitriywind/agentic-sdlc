# 8. Install
<!-- group: Adopt -->

Try it first in five minutes with no accounts. Then install it on a real repo.

## Try it in five minutes

The `local` board is a file, `.agents/board.json`. No board account and no forge are needed.

```bash
mkdir try-agentic && cd try-agentic && git init -b main
npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v0.1.0 init --board local --forge github --harness generic
printf 'Show a greeting on the home page.\n' > body.md
.agents/bin/agentic-sdlc board create --title "Greeting" --body-file body.md --status Backlog
.agents/bin/agentic-sdlc dispatch plan/shape --ticket 2
```

The first command runs the package once from its Git tag. `init` writes the pin `.agents/cli.json`
and the launcher `.agents/bin/agentic-sdlc`; from then on every command runs through the launcher,
which installs the pinned CLI on first use. The folder needs no `package.json`.

`dispatch` prints the instruction your agent would follow and starts nothing. Open the folder in your
agent and ask it to run the `sdlc` skill for one cycle. `doctor` also probes Git and GitHub, so it needs a
first commit and a GitHub remote: run it on a real repo.

<div class="callout warn">

The CLI installs from Git only. The npm package named `agentic-sdlc` is a different project: do not
install it.

</div>

## Install on a real repo

1. **Run `init`** with the command from [7. Choose your setup](7-choose.md), in the repo's root. It
   runs the package once from its Git tag, writes the pin `.agents/cli.json` and the launcher
   `.agents/bin/agentic-sdlc`, adds `.cli/` and `work/` to `.agents/.gitignore`, and lists every file it writes.
   It writes nothing into `package.json` or `.npmrc`; a product that is not a Node project needs
   neither. npm older than 12 does not know `--allow-git`: drop the flag there.
2. **Fill in `.agents/binding.yml`**. The file documents every key. Set at least the owners, the board
   options (`init` reads the repo from `git remote origin`), `commands.*`, `product.environments`,
   `product.delivery` and `models`. `.agents/bin/agentic-sdlc validate` names every key still missing.
   It also warns, per `paths.*` file key, when the named file is missing: the skills then read nothing there.
   The Claude Code plugin also brings a subagent per tier, a `sdlc-reviewer` that can only read files and
   run `agentic-sdlc` commands, and `agentic-sdlc` itself on the Bash path. Codex and Cursor can install
   the package as a plugin for the skills and the MCP server.
3. **Write the two docs** the skills judge every ticket against: `paths.importance_doc` (what
   matters) and `paths.guiding_narrative` (where the product goes). Without them, product questions
   become holds.
4. **Run `.agents/bin/agentic-sdlc doctor`** until every port is ok. It also checks that the pin
   parses and the launcher runs. Import `.github/rulesets/trunk.json` in the repo settings. A private
   repo on GitHub Free cannot enforce a ruleset; `doctor` warns.
5. **Create the heartbeat ticket** and put its id in `heartbeat.ticket`. Keep it off every route: on
   `github-issues`, an issue with no `status:` label is off the board, and comments still work; on the
   local board, status Cancelled (`init` does this); on other boards, a Cancelled status.
6. **Run one cycle by hand** with two or three real tickets in Backlog. Read every comment it writes.
   Repeat until three cycles in a row need no correction.
7. **Schedule the cycle** from [`templates/runner/`](../../templates/runner/routine.md), and the
   dead-man check (`agentic-sdlc ledger stale --max-hours <h>`). Every workflow job runs the CLI
   through the launcher, so it uses the same pin. The runner workflows also need the repo variable
   `AGENTIC_AGENT_CLI_VERSION` (an exact version of the agent's CLI); they fail when it is unset
   ([GitHub forges](../forges.md)).

<div class="callout ok">

**Done when** a scheduled cycle writes a heartbeat with no `errors`, and a pull request merges
through the checks.

</div>

## Claude Code plugin

For Claude Code, the skills, the guard hook and the MCP server ship as a plugin:

```text
/plugin marketplace add dmitriywind/agentic-sdlc
/plugin install agentic-sdlc@agentic-sdlc
```

A skill under the plugin is `agentic-sdlc:<skill>`. A copied install has no namespace, so `init`
names each copy `sdlc-<skill>` (`sdlc` stays `sdlc`). A scheduled run loads the pinned copy instead:
`claude --plugin-dir .agents/.cli/<ref>/node_modules/agentic-sdlc`, where `<ref>` is the `ref` in
`.agents/cli.json`. A Claude cloud routine loads `.claude/skills/`: install with `init --no-plugin`.

Next: [9. Run it](9-run-it.md).

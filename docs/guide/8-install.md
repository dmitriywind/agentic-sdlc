# 8. Install
<!-- group: Adopt -->

Try it first in five minutes with no accounts. Then install it on a real repo.

## Try it in five minutes

The `local` board is a file, `.agents/board.json`. No board account and no forge are needed.

```bash
mkdir try-agentic && cd try-agentic && git init -b main && npm init -y
npm i -D --allow-git=root github:dmitriywind/agentic-sdlc#v2.0.0-alpha.5
npx --no agentic-sdlc init --board local --forge github --harness generic
printf 'Show a greeting on the home page.\n' > body.md
npx --no agentic-sdlc board create --title "Greeting" --body-file body.md --status Backlog
npx --no agentic-sdlc dispatch shape --ticket 2
```

`dispatch` prints the instruction your agent would follow and starts nothing. Open the folder in your
agent and ask it to run the `sdlc` skill for one cycle.

<div class="callout warn">

The CLI installs from Git only. The npm package named `agentic-sdlc` is a different project: do not
install it.

</div>

## Install on a real repo

1. **Install the CLI**, pinned to a tag:
   `npm i -D --allow-git=root github:dmitriywind/agentic-sdlc#v2.0.0-alpha.5`
2. **Run `init`** with the command from [7. Choose your setup](7-choose.md). It lists every file it writes.
3. **Fill in `.agents/binding.yml`**. The file documents every key. Set at least the owners,
   `commands.*`, `product.environments`, `product.delivery` and `models`.
4. **Write the two docs** the skills judge every ticket against: `paths.importance_doc` (what
   matters) and `paths.guiding_narrative` (where the product goes). Without them, product questions
   become holds.
5. **Run `npx --no agentic-sdlc doctor`** until every port is ok. Import `.github/rulesets/trunk.json`
   in the repo settings. A private repo on GitHub Free cannot enforce a ruleset; `doctor` warns.
6. **Create the heartbeat ticket** on the board and put its id in `heartbeat.ticket`.
7. **Run one cycle by hand** with two or three real tickets in Backlog. Read every comment it writes.
   Repeat until three cycles in a row need no correction.
8. **Schedule the cycle** from [`templates/runner/`](../../templates/runner/routine.md), and the
   dead-man check (`agentic-sdlc ledger stale --max-hours <h>`).

<div class="callout ok">

**Done when** a scheduled cycle writes a heartbeat with no `errors`, and a pull request merges
through the checks.

</div>

## Claude Code plugin

For Claude Code, the skills, the guard hook and the MCP server ship as a plugin, named
`/agentic-sdlc:<skill>`:

```text
/plugin marketplace add dmitriywind/agentic-sdlc
/plugin install agentic-sdlc@agentic-sdlc
```

A scheduled run loads the repo's pinned copy instead: `claude --plugin-dir ./node_modules/agentic-sdlc`.
A Claude cloud routine loads `.claude/skills/`: install with `init --no-plugin`.

Next: [9. Run it](9-run-it.md).

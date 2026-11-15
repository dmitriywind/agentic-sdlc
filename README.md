# agentic-sdlc

> **0.1 (early).** Interfaces may still change before 1.0. Try it on a sandbox repo
> before you point it at one that matters.

agentic-sdlc runs software delivery with agents. You put work on a board. A scheduled agent run,
the cycle, shapes each ticket, builds it, reviews it and merges it. CI gates decide what may merge,
and no agent can skip them. You act only when the factory asks you.

It is a skill pack (the process), a binding (your project's values) and the `agentic-sdlc` CLI (the
board, forge and Git verbs, and the gates). It runs on Claude Code, Codex, Cursor or any agent with
a shell, on your subscription or on API keys, in the cloud, in CI or on your own machine.

**Read the guide online:** [dmitriywind.github.io/agentic-sdlc](https://dmitriywind.github.io/agentic-sdlc/guide.html):
step through a ticket in six scenarios, and get your setup command.

## Quick start

```bash
npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v0.1.0 init --profile individual --harness claude --board github-issues
.agents/bin/agentic-sdlc doctor
```

Needs Node 22.18 or later. The first command runs the package once: `init` writes the pin
`.agents/cli.json` and the launcher `.agents/bin/agentic-sdlc`, and adds `.agents/.cli/` to `.gitignore`. From then on
everything runs through the launcher, which installs the pinned CLI on first use. `init` writes nothing into your
`package.json` or `.npmrc`, and a product that is not a Node project needs neither. To upgrade, run the new
package's `init --upgrade`: it rewrites `.agents/cli.json` and the templates in one factory change. npm 12 refuses
Git dependencies without `--allow-git`; older npm versions that do not know the flag can drop it. The CLI installs
from Git only. Warning: the npm package `agentic-sdlc` is a different project; do not install it. Before `doctor` passes, set `heartbeat.ticket` in `.agents/binding.yml` (and the board options for Jira,
Linear or a GitHub Project; `init` reads the repo from `git remote origin`). `.agents/bin/agentic-sdlc` lists
every group and `.agents/bin/agentic-sdlc <group> --help` its verbs; `.agents/bin/agentic-sdlc --version` prints the version. The board, forge, vcs and gate verbs print JSON; `init`, `validate` and `doctor` print text. Exit 0 is
success, 1 is a refused or failed action, 2 is a usage error.

On Claude Code, also install the plugin (skills, the guard hook, the MCP server):
`/plugin marketplace add dmitriywind/agentic-sdlc`, then `/plugin install agentic-sdlc@agentic-sdlc`.

## Read the guide

| | Chapter | You learn |
|---|---|---|
| 1 | [What it is](docs/guide/1-what-it-is.md) | What it does, what it guarantees, whether it fits you. |
| 2 | [A ticket's journey](docs/guide/2-a-ticket.md) | Step through a ticket in six scenarios; every status. |
| 3 | [Your part](docs/guide/3-your-part.md) | Holds, every ask you can get, your role, a week with it. |
| 4 | [The cycle](docs/guide/4-the-cycle.md) | What one scheduled run does, in order, and its safety rules. |
| 5 | [Review and merge](docs/guide/5-review-and-merge.md) | One identity or two, Fast or Full lane, the six checks. |
| 6 | [Shipping](docs/guide/6-shipping.md) | Continuous delivery or release lines, and failed deploys. |
| 7 | [Choose your setup](docs/guide/7-choose.md) | Answer the questions; get your init command and settings. |
| 8 | [Install](docs/guide/8-install.md) | Try it in five minutes, then install on a real repo. |
| 9 | [Run it](docs/guide/9-run-it.md) | Watch it, upgrade it, keep the repo and board healthy. |
| 10 | [Learning](docs/guide/10-learning.md) | How the factory improves its own skills (optional). |
| 11 | [The parts](docs/guide/11-parts.md) | Layers, the seven phase skills and their steps, executors, trust boundaries, installed files. |
| 12 | [Glossary](docs/guide/12-glossary.md) | Every term the guide uses. |

The same guide, with every diagram drawn, as one page: [docs/guide.html](docs/guide.html).
Reference: [the contract](references/architecture.md), [the behaviour as executable features](features/) (`npm test`),
[GitHub setup](docs/forges.md), per-vendor setup in [docs/ecosystems](docs/ecosystems/claude-code.md),
[the binding template](templates/binding.yml), [the roadmap](docs/roadmap.md).

## This repository

This repo does not run its own factory yet: it has no `.agents/`, no board and no factory gates
(`.github/workflows/ci.yml` only builds and tests). The gates have to be proved on sandbox repos
first, and a broken factory gating its own repo could not be fixed through itself.
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md).

## License

Apache-2.0

# agentic-sdlc

> **Alpha (2.0.0-alpha).** The interfaces still change between alphas. Try it on a sandbox repo
> before you point it at one that matters.

agentic-sdlc runs software delivery with agents. You put work on a board. A scheduled agent run,
the cycle, shapes each ticket, builds it, reviews it and merges it. CI gates decide what may merge,
and no agent can skip them. You act only when the factory asks you.

It is a skill pack (the process), a binding (your project's values) and the `agentic-sdlc` CLI (the
board, forge and Git verbs, and the gates). It runs on Claude Code, Codex, Cursor or any agent with
a shell, on your subscription or on API keys, in the cloud, in CI or on your own machine.

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
| 11 | [The parts](docs/guide/11-parts.md) | Layers, skills, executors, trust boundaries, installed files. |
| 12 | [Glossary](docs/guide/12-glossary.md) | Every term the guide uses. |

The same guide, with every diagram drawn, as one page: [docs/guide.html](docs/guide.html).
Reference: [the contract](references/architecture.md), [behaviour specs](docs/behaviour/README.md),
[GitHub setup](docs/forges.md), per-vendor setup in [docs/ecosystems](docs/ecosystems/claude-code.md),
[the binding template](templates/binding.yml), [the roadmap](docs/roadmap.md).

## Quick start

```bash
npm i -D --allow-git=root github:dmitriywind/agentic-sdlc#v2.0.0-alpha.5
npx --no agentic-sdlc init --profile individual --harness claude --board github-issues
npx --no agentic-sdlc doctor
```

The CLI installs from Git only. Warning: the npm package `agentic-sdlc` is a different project; do
not install it. `npx --no agentic-sdlc --help` lists every verb; every verb prints JSON. Exit 0 is
success, 1 is a refused or failed action, 2 is a usage error.

## This repository

This repo does not run its own factory yet: it has no `.agents/`, no board and no factory gates
(`.github/workflows/ci.yml` only builds and tests). The gates have to be proved on sandbox repos
first, and a broken factory gating its own repo could not be fixed through itself.
Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md).

## License

Apache-2.0

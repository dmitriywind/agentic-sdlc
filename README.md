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
| 1 | [What it is](docs/guide/1-what-it-is.md) | The idea in one picture, the three layers, the eleven skills, the words. |
| 2 | [Choose your setup](docs/guide/2-choose.md) | Who pays, one identity or two, one repo or many, where the cycle runs. |
| 3 | [Install](docs/guide/3-install.md) | Try it with no accounts, install on a repo, schedule it, upgrade. |
| 4 | [A ticket's journey](docs/guide/4-a-ticket.md) | Every status, who moves the ticket, the ways back. |
| 5 | [The cycle](docs/guide/5-the-cycle.md) | What one scheduled run does, in order. |
| 6 | [Review and merge](docs/guide/6-review-and-merge.md) | The checks, the classes, one identity and two. |
| 7 | [Shipping](docs/guide/7-shipping.md) | Continuous delivery, release lines, failures. |
| 8 | [When you are needed](docs/guide/8-when-you-are-needed.md) | Holds and every other ask. |
| 9 | [Learning](docs/guide/9-learning.md) | How the factory improves its own skills (optional). |
| 10 | [The parts](docs/guide/10-parts.md) | Ports, executors, trust boundaries, installed files. |

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

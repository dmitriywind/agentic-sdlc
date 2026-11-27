# Contributing

Read [AGENTS.md](AGENTS.md) first; it holds the rules for agents and people working here.

## Build and test

Node 22.18 or later.

```bash
npm install
npm run typecheck
npm test
```

`npm test` builds first, then runs every feature (`features/**/*.feature`). Features only:
`npm run test:features`. Narrow a run with environment variables: `FEATURE=gates/approval` (path contains),
`SCENARIO='Fast-lane'` (title matches), `TAGS=@gate:approval` (any tag). A scenario tagged `@only` runs alone.
The `@dist` scenario runs the built CLI and fails when `dist/bin.js` is missing: run `npm run build`.
Tests use fakes and no network. They run on Linux, macOS and Windows; the launcher scenarios run the POSIX launcher
with `/bin/sh`, or on Windows with the `sh` of Git for Windows. `.gitattributes` checks every file out with LF.

## Behaviour: executable features

Behaviour is specified once, as Gherkin features that run. A scenario is the test; there is no second
description of it. The runner (`features/support/run.ts`, no dependency) maps each Feature to a `describe`
and each Scenario, and each row of an Examples table, to an `it` on `node:test`.

Layout:

- `features/<area>/<thing>.feature`. Areas: board, forge, vcs, gates, dispatch, ledger, bench, install,
  cli, mcp, binding, plugin, guard, skills, comments.
- `features/steps/<area>.ts` holds the step definitions of that area; `features/steps/common.ts` holds the
  vocabulary every area reuses. All steps are global: a step phrase means one thing everywhere.
- `features/support/` is the machinery: `gherkin.ts` (parser), `steps.ts` (`Given`, `When`, `Then`),
  `world.ts` (the per-scenario World), `fakes.ts` (in-memory board and forge for gates), `run.ts`.

Rules:

1. Every behaviour a user or the cycle relies on, and every security boundary, has a scenario; every scenario has
   executable steps. No prose-only scenario. A scenario exercises the product on fixtures: none reads this repo's own
   files (docs, templates, manifests, the hash list) to check their text. A release invariant of those files is a
   build step that CI checks, not a test.
2. One behaviour per scenario. Two outcomes of one action are two `Then` lines; two actions are two scenarios.
3. The title states the rule in domain words: "A Full-lane CR waits for a human", never a function name or
   "test that ...". Group scenarios under `Rule:` lines; give the Feature a one-paragraph description.
4. `Given` is state, `When` is one action (one CLI verb, one hook call or one gate run), `Then` is what a
   user observes: exit code, output field, status posted, call made to the forge or board, file written.
   A `Given` never asserts. A `Then` never acts.
5. Prefer a `Scenario Outline` with an Examples table over copy-paste. A row is a distinct rule or a distinct way past a
   boundary, never one more flag, one more spelling or one more error message of a rule already shown.
6. Reuse steps. Add a step only when no phrase says it; put it in the area file, or in `common.ts` when a
   second area needs it. Delete a step, and any fake only it used, with its last scenario.
7. Binding values appear as keys (`forge.human_approval`), so a scenario holds for every project.
8. Tags: `@gate:<name>`, `@cli:<verb>`, `@board:<adapter>`, `@skill:<name>` on the Feature. `@skip` skips a
   scenario: put a comment above it that names the reason and the owner of the fix. `@only` is for a local run.
9. The first comment of a feature names its source files (`# Source: src/gates.ts "approval"`). The source
   holds the rule; the feature states the behaviour and fails when they differ.
10. A change to what a skill, gate, hook or `init` does changes its feature in the same change.

The World (`features/support/world.ts`), fresh per scenario and cleaned up after it:

- `w.root`, `w.path(..)`, `w.write(rel, text)`, `w.read(rel)`, `w.exists(rel)`: a temp project. `w.git([..], cwd)`.
- `w.binding({..})`: deep-merges into the binding the scenario builds. The CLI reads it as the project's
  binding file; `w.gateDeps()` merges it onto the gate base binding.
- `w.cli(...args)` and `w.cliLine("board list --status Ready")`: run the real CLI as a process in the project.
  `w.spawn([script, ..], stdin, cwd)` runs any node script (a hook). Both set `w.last`
  (`code`, `stdout`, `stderr`, `output`, `json()`).
- `w.gate`: in-memory board and forge for gates (`ticket`, `cr`, `diffs`, `reviews`, `files`, `statuses`).
  Run a gate in-process: `await approval(w.gateDeps(), '1')`.
- `w.adapterContext(options)`, `w.answer(/regex/, response)`, `w.calls`: a fake exec and http that record calls
  and answer from programmed rules, for an adapter run in-process.
- `w.useFakeSleep()`, `w.sleeps`: the retry sleeps of `src/exec.ts` do not wait and are recorded.
- `w.state`: scratch for one area's steps; document its keys at the top of the steps file.

Core vocabulary (`features/steps/common.ts`):

- `the binding sets "<key>" to "<value>"`, `... to the list "a, b"`, `... to the account "<b>" on the board and
  "<f>" on the forge`, `the binding has no "<key>"`
- `a file "<name>" with "<text>"`
- `I run "<cli words>"` (single quotes group a word, double quotes are the step's own)
- `the exit code is <n>`, `the output says "<text>"`, `the output matches "<regex>"`

A step takes `{string}` ("double" or 'single' quoted; `\"` is a quote), `{int}`, `{word}`, or a regular
expression whose groups are its arguments; a data table or a doc string arrives as the last argument.
An undefined step fails its scenario with a snippet to paste; an ambiguous step names both definitions.

## The contract rule

[`references/architecture.md`](references/architecture.md) is the contract. A change to a port,
gate, binding key, CLI verb or skill interface changes the contract in the same CR, and the
contract changes the code, templates, skills and docs in that CR too. Process rules live only in
`skills/`, project values only in `templates/binding.yml`, mechanism only in `src/`. One rule, one
home; elsewhere a pointer.

## Adding an adapter

1. Implement the port interface from `src/ports.ts` in `src/board/<name>.ts` or
   `src/forge/<name>.ts`, running processes only through the `exec` helper so tests can fake them.
2. Register it in that folder's `index.ts`, and list its options in `templates/binding.yml` so
   `validate` can check them. Credentials come only from env var names.
3. Add `features/<area>/<name>.feature` with its steps: every verb, its JSON output and its exit codes, against the
   fake exec (`w.adapterContext`).
4. A forge adapter also needs gate templates in `templates/gates/<name>/` and a section in
   [docs/forges.md](docs/forges.md) saying what is native, gated or approximated.
5. Update the adapter lists in the contract (section 3) and the README.

## Releases and `dist/`

The package ships from Git only, never npm. `dist/` is committed: run `npm run build` and commit
`dist/` with every `src/` change. The build also regenerates `docs/guide.html` from `docs/guide/*.md` and
`scripts/guide/`, and appends the hash of every installable file (the trunk's history, the tags and the working tree)
to `templates/known-hashes.json`, so `init --upgrade` can tell an old package file from a local edit: commit all
three. CI fails when any is stale. A release bumps `package.json` and `.claude-plugin/plugin.json`, commits, then
tags `v<version>` on `master`.

## Changes

External contributors: fork the repo and open a pull request against `master`. Maintainers commit
small changes to `master` (the trunk) directly. Small and focused, with tests. Describe the change and why. Security issues go through
[SECURITY.md](SECURITY.md), not a public issue.

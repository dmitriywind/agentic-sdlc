# Contributing

Read [AGENTS.md](AGENTS.md) first; it holds the rules for agents and people working here.

## Build and test

Node 22.18 or later.

```bash
npm install
npm run typecheck
npm test
```

`npm test` builds first, then runs every `test/*.test.ts`. One file: `node --test
test/<name>.test.ts` (run `npm run build` first for `dist-smoke`). Tests use a fake process runner
and no network.

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
3. Add `test/<name>.test.ts` with the fake exec: every verb, its JSON output and its exit codes.
4. A forge adapter also needs gate templates in `templates/gates/<name>/` and a section in
   [docs/forges.md](docs/forges.md) saying what is native, gated or approximated.
5. Update the adapter lists in the contract (section 3) and the README.

## Releases and `dist/`

The package ships from Git only, never npm. `dist/` is committed: run `npm run build` and commit
`dist/` with every `src/` change (CI fails on a stale `dist/`). A release bumps `package.json` and
`.claude-plugin/plugin.json`, then tags `v<version>` on `master`.

## Changes

Trunk-based: commit small changes to `master` (the trunk), or use a short-lived branch and a PR. Small and focused, with tests. Describe the change and why. Security issues go through
[SECURITY.md](SECURITY.md), not a public issue.

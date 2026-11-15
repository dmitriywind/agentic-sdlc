# 9. Run it
<!-- group: Operate -->

What you do after the first cycle: watch it, upgrade it, and keep the repo and the board healthy.

## Watch it

```bash
npx --no agentic-sdlc ledger summary
npx --no agentic-sdlc ledger stale --max-hours 3
```

`ledger summary` reads the heartbeats: runs, outcomes and failures by cluster. `ledger stale` fails
when no heartbeat arrived in time; schedule it where a failure alerts you.

`ledger measures` prints deploy frequency, lead time, change failure rate, time to restore and
rework rate over the last 30 days (`--days <n>`), computed from the board and the forge. A measure
the data cannot give is `null` with a reason. Set `product.slo` (`change_failure_rate_max` and
`window_days`) to give the factory an error budget: when the failure rate passes it, or the window has failures and no shipped change, the cycle starts
no new feature ticket and works only bugs, Signals and reviews in flight, and the heartbeat says
`budget: exhausted`.

## Send it to your telemetry

Nothing leaves the project unless the binding's `telemetry` block names where. Each key names an
environment variable, never a URL or a token: `otlp_endpoint_env` (an OTLP/HTTP base URL),
`cdevents_sink_env` (a CDEvents sink URL) and `headers_env` (request headers as `name=value,name2=value2`).

```bash
npx --no agentic-sdlc ledger export --format otlp --since 7            # print one OTLP/HTTP JSON document
npx --no agentic-sdlc ledger export --format otlp --send               # post it to <endpoint>/v1/traces
npx --no agentic-sdlc ledger export --format cdevents --out events.jsonl
```

`--since` takes a number of days or an ISO time; `--run <id>` exports one run. OTLP has one trace
per heartbeat: an `invoke_workflow` span for the cycle and an `invoke_agent` span per run, with the
skill as `gen_ai.agent.name`, the model, the outcome as span status and `error.type`, and the ticket,
CR, tier, executor, tokens and scores as `agentic_sdlc.*` attributes and evaluation events. Ids are
hashes of the heartbeat and run ids, so exporting twice gives the same document. The GenAI
conventions are still in `development`, so their names can change; they live in one table in
`src/telemetry.ts`. With `cdevents_sink_env` set, the `merged` gate posts a `change.merged` event and
the `shipped` gate a `service.deployed` or `service.rolledback` event. A failed send writes one line to
stderr and never fails the gate.

If the delivery workflow fails on a merge, start it by hand with the commit's sha: it runs the
`merged` check again and moves the ticket to Done.

## Upgrade

1. Read `git log v<yours>..v<new>` and the contract diff.
2. Run `npm uninstall agentic-sdlc`, then the `npm i` line with the new tag. npm 12 refuses to change
   a Git dependency in place (`EALLOWGIT`).
3. Run `init --upgrade`. `init` records the hash of every file it installs from the package in
   `.agents/install.lock.json`. A file still at its recorded hash is updated, a file you edited is kept
   (the line names the package file with the new version), a new file is written, and a file the
   package dropped is reported as `stale` and left in place. A file with no lock entry, or a lock entry
   that does not match, counts as edited unless it equals the package's or has the hash of a released
   version (`templates/known-hashes.json`, built by `npm run hashes`); a kept file's line says it
   `differs from every released version`. `init` writes the delivery workflow's trunk, release prefix and
   delivery, and the verify workflow's install and verify commands, from the binding; a workflow that differs from
   a released version only in those values is updated. A kept pre-push hook keeps its mode. `--force` overwrites your edits to those files. No flag rewrites
   `.agents/binding.yml`: to regenerate it, delete it. `init` and `validate` list the binding keys the
   template has and yours lacks. When nothing changed, `init` ends with `install: up to date`, or `install: nothing to update; N kept (differ from every released version)` when it kept files.
4. Run `npm install`, merge the kept files by hand, then run `validate` and `doctor` and one cycle by hand.

With many repos, each repo pins its own version: upgrade one at a time.

## Move from a hand-made process

1. List what the old process does that the skills do not. Each item becomes a setting, a doc that
   `paths.importance_doc` points to, or a gap to report upstream.
2. Copy the old values into the binding.
3. Delete the old copies of the skills. A project replaces the binding, never the skills.

## Recommended around the factory

The factory enforces only its checks and the binding. These help it:

- **Repo:** rulesets as code, secret scanning with push protection, Actions pinned by commit SHA
  (the installed workflows are; Dependabot's `github-actions` ecosystem keeps them fresh and `doctor` warns on one that is
  not a SHA) and dependencies pinned, signed release tags, a `SECURITY.md` with a contact.
- **Board:** limits on In progress and In review, a view of held tickets (`needs-human`), an aging
  view, a time limit for triaging Signals.
- **Operations:** service-level objectives beyond the change failure budget, release evidence
  (`product.evidence`: SBOM, provenance, signatures), blameless postmortems whose actions return to
  the Backlog.

Next: [10. Learning](10-learning.md).

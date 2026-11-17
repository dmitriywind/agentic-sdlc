# 9. Run it
<!-- group: Operate -->

What you do after the first cycle: watch it, upgrade it, and keep the repo and the board healthy.

## Watch it

```bash
.agents/bin/agentic-sdlc ledger summary
.agents/bin/agentic-sdlc ledger stale --max-hours 3
```

`ledger summary` reads the heartbeats: runs, outcomes and failures by cluster. `ledger stale` fails
when no heartbeat arrived in time; schedule it where a failure alerts you.

`init` installs that check as its own workflow, `agentic-sdlc-dead-man.yml`, for every runtime: it runs every 3 hours outside the cycle and fails when no heartbeat landed for `--max-hours` (set it above your cycle cadence). It catches what stops silently: a cloud task whose runs are rejected at the usage limit, a task switched off after 72 hours without a GitHub connection, a run that shows Succeeded and did nothing.

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
.agents/bin/agentic-sdlc ledger export --format otlp --since 7   # print one OTLP/HTTP JSON document
.agents/bin/agentic-sdlc ledger export --format otlp --send      # post it to <endpoint>/v1/traces
.agents/bin/agentic-sdlc ledger export --format cdevents --out events.jsonl
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

An upgrade is one factory change: the new package's `init --upgrade` rewrites the pin and the
installed files together.

1. Read `git log v<yours>..v<new>` and the contract diff.
2. On a factory change line, run the new package once:
   `npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v<new> init --upgrade`. It moves the
   `ref` in `.agents/cli.json` to the new tag, unless you pinned a commit sha that `init` did not
   write (`--ref <sha>` or `--force` moves it anyway). A tag can move; a sha cannot, and
   `doctor` warns on a tag.
3. `init` records the hash of every file it installs from the package in
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
4. Merge the kept files by hand, run `.agents/bin/agentic-sdlc validate` and `doctor` (the launcher
   installs the new pin on first use), then one cycle by hand. Open the change as a factory pull
   request: it goes through the checks like any other.

With many repos, each repo pins its own version: upgrade one at a time.

## Move from a hand-made process

1. List what the old process does that the skills do not. Each item becomes a setting, a doc that
   `paths.importance_doc` points to, or a gap to report upstream.
2. Copy the old values into the binding.
3. Delete your own copies of the process. A project replaces the binding, never the skills.

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

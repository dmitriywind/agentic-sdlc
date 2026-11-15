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
`window_days`) to give the factory an error budget: when the failure rate passes it, the cycle starts
no new feature ticket and works only bugs, Signals and reviews in flight, and the heartbeat says
`budget: exhausted`.

If the delivery workflow fails on a merge, start it by hand with the commit's sha: it runs the
`merged` check again and moves the ticket to Done.

## Upgrade

1. Read `git log v<yours>..v<new>` and the contract diff.
2. Run `npm uninstall agentic-sdlc`, then the `npm i` line with the new tag. npm 12 refuses to change
   a Git dependency in place (`EALLOWGIT`).
3. Run `init --upgrade`. `init` records the hash of every file it installs from the package in
   `.agents/install.lock.json`. A file still at its recorded hash is updated, a file you edited is kept
   (the line names the package file with the new version), a new file is written, and a file the
   package dropped is reported as `stale` and left in place. A file with no lock entry counts as edited
   unless it equals the package's. `--force` overwrites your edits to those files. No flag rewrites
   `.agents/binding.yml`: to regenerate it, delete it. `init` and `validate` list the binding keys the
   template has and yours lacks.
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

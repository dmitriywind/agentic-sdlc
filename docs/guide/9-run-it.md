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

If the delivery workflow fails on a merge, start it by hand with the commit's sha: it runs the
`merged` check again and moves the ticket to Done.

## Upgrade

1. Read `git log v<yours>..v<new>` and the contract diff.
2. Run `npm uninstall agentic-sdlc`, then the `npm i` line with the new tag. npm 12 refuses to change
   a Git dependency in place (`EALLOWGIT`).
3. Run `init` again without `--force`. It keeps your files and lists what it skipped. `--force`
   also overwrites the binding.
4. Run `validate` and `doctor`, then one cycle by hand.

With many repos, each repo pins its own version: upgrade one at a time.

## Move from a hand-made process

1. List what the old process does that the skills do not. Each item becomes a setting, a doc that
   `paths.importance_doc` points to, or a gap to report upstream.
2. Copy the old values into the binding.
3. Delete the old copies of the skills. A project replaces the binding, never the skills.

## Recommended around the factory

The factory enforces only its checks and the binding. These help it:

- **Repo:** rulesets as code, secret scanning with push protection, Actions and dependencies pinned
  by digest, signed release tags, a `SECURITY.md` with a contact.
- **Board:** limits on In progress and In review, a view of held tickets (`needs-human`), an aging
  view, a time limit for triaging Signals.
- **Operations:** service-level objectives with an error budget, release evidence
  (`product.evidence`: SBOM, provenance, signatures), blameless postmortems whose actions return to
  the Backlog.

Next: [10. Learning](10-learning.md).

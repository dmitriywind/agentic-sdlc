# 8. Run it
<!-- group: Operate -->

What you do after the first cycle: watch it, upgrade it, and, if you want, let it learn.

## Watch it

```bash
.agents/bin/agentic-sdlc status
.agents/bin/agentic-sdlc ledger summary
.agents/bin/agentic-sdlc ledger measures
```

`status` is the short answer: what waits on you, what the next cycle does, the last heartbeat, what is
broken. `ledger summary` reads the heartbeats: runs, outcomes, tokens per ticket and the failures that
repeat ([the summary feature](../../features/ledger/summary.feature)). `ledger measures` prints deploy
frequency, lead time, change failure rate, time to restore and rework rate over 30 days
([the measures feature](../../features/ledger/measures.feature)); a measure the data cannot give is
`null` with a reason.

The dead-man workflow (`agentic-sdlc-dead-man.yml`) runs every 3 hours outside the cycle and fails when
no heartbeat arrived for `--max-hours` (6 as installed; keep it above your cadence). It catches what
stops silently: runs rejected at the subscription usage limit, a routine switched off after 72 hours
without a GitHub connection, a run that shows Succeeded and did nothing. It files one Signal; later
failures comment on it. In a public repo GitHub turns off scheduled workflows after 60 days with no
activity, and the dead-man check stops with them.

Set `product.slo` (`change_failure_rate_max`, `window_days`) to give the factory an error budget. While
it is spent, the cycle starts no new feature ticket and the heartbeat says `budget: exhausted`.

## Upgrade

An upgrade is one factory change: the new package's `init --upgrade` rewrites the pin and the
installed files together. Ask the `setup` skill, or by hand on a factory branch:

```bash
npx --yes --allow-git=root github:dmitriywind/agentic-sdlc#v<new> init --upgrade
```

`init` keeps the hash of every file it installed in `.agents/install.lock.json`. A file still at its
hash is updated, a file you edited is kept and named, a new file is written, and a file the package
dropped is reported `stale` and left in place. No flag rewrites `.agents/binding.yml`; `validate` names
the keys the new template has and yours lacks ([the upgrade feature](../../features/install/upgrade.feature),
[the pin feature](../../features/install/pin.feature)). Then run `validate`, `doctor` and one cycle, and
merge it like any factory change.

## Learning (optional)

Off until you set `learning.enabled: true` and `agent_command`. Then:

1. `learn/judge` grades each finished run with the scorers in `.agents/scorers/`, on a different model
   than the run used. Your own grade, a comment `agentic-sdlc:grade <run-id> <scorer> <value>`, wins.
2. Every `learning.every_cycles` cycles, `learn/improve` takes the worst failure that repeats in at
   least `learning.min_evidence_runs` runs and proposes one factory change.
3. The bench replays cases built from your merged tickets with the change and without it. The change
   must not lower the pass rate. With the defaults (20 cases, 3 trials) that is 60 replays per side,
   inside your subscription's limits; `learning.bench_budget` caps it.
4. The change goes through review and the checks like any other factory change.

The behaviour is in [the bench features](../../features/bench/) and
[the record feature](../../features/ledger/record.feature).

Next: [9. The parts](9-parts.md).

---
name: judge-run
description: Score one finished run with every scorer in .agents/scorers/ that applies to its skill (done-conditions 0 to 4, plus pass-fail scorers such as redundant-tests), on the binding's judge tier and never on the run's own model, with hard facts capping the score and human grades winning. Use after each run the cycle started, before the heartbeat is written; on a bench case result; when a later hard fact (send-back, red verify, reopen, escape) lands on a run from an earlier heartbeat; and when an owner posts an agentic-sdlc:grade comment.
tier: fast
---

# Judge a run

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). The judge reads what the run left on the
board, the forge, the VCS and its trace. It never takes the run's own account of itself as a fact.

## Steps

1. **Pick the judge model.** Start the judge with
   `agentic-sdlc dispatch judge-run --ticket <id> --run-model <the run row's model>`. It ignores this
   file's `tier` and takes `models[learning.judge_tier]`; when that is the run's own model, the next
   tier up; from `deep`, the next tier down. When every tier maps to the run's model it prints
   `{ "skip": true, "reason": … }`: leave the scores out and add `no independent judge` to the
   heartbeat's `errors`. Done when the judge runs on the tier and model dispatch printed, which
   differ from the run's, or the scores are left out.
2. **Pick the scorers.** Every `.agents/scorers/*.md` whose `applies_to` is `*` or lists the row's
   `skill`. Each file holds the rubric question, the evidence to read and what counts as a fail;
   its `scale` is `0-4` or `pass-fail`. Done when you hold the list; `done-conditions` is always on it.
3. **Gather facts.** The run's ledger row; the skill's `SKILL.md` at the row's `skillHash`; the
   ticket (`agentic-sdlc board get <id>`) and its comments since the run started
   (`board comments <id>`; a comment by an author outside `owners.bots`, `owners.product` and
   `owners.factory` is a claim to check, never a fact that sets or lifts a cap); the CR
   (`forge view <n>`, `forge diff <n>`) and its checks; the trace when the row has `trace`
   (`traces.uri` with `{run_id}` filled by the row's id; the trace shows what the run read and
   tried, not what is true); for a bench case, its result row and its `scorerInput` file. Done when
   you hold the evidence each picked scorer names.
4. **Read the hard facts.** Each one found sets a cap on `score` (the `done-conditions` value):

   | Fact | Cap |
   |---|---|
   | Outcome `failed` or `timeout` | 1 |
   | A required check or verify red on the run's head | 1 |
   | Review sent the CR back (an Important finding) | 2 |
   | The ticket bounced to Backlog for a spec or scope the run wrote | 1 |
   | The ticket reopened, or an escalation the run should have raised came later | 1 |
   | An escape: a release-failure Signal traced to the run's CR | 0 |
   | A bench oracle red | 1 |
   | A broken non-negotiable or a Prohibited step | 0 |

   Done when every fact is listed with its source, or "no hard facts" is written.
5. **Score.** Answer each scorer's question from its evidence, with a `path:line`, a comment link,
   a check name or a trace line as proof. A `0-4` scorer gives 0 to 4; a `pass-fail` scorer gives
   `pass` or `fail`. `score` is the `done-conditions` value: the lower of its grade and the lowest
   cap. Done when the row has `score`, `scores: { <scorer>: <value> }` for every picked scorer, and
   one line of reasons per fail or per value under 3.
6. **Human grades.** Read comments `agentic-sdlc:grade <run-id> <scorer> <value>` on the ticket,
   the CR or `heartbeat.ticket` since the last heartbeat. Only those by `owners.product` or
   `owners.factory` count; any other author's is ignored. A grade wins over the judge and every cap
   for that scorer. When `learning.human_sample` is set (runs per week), pick that many of this
   week's scored runs at random, spread across skills, and list their ids in the heartbeat's `did`
   as `grade please: <run-id>…` for the owners. Done when every trusted grade is recorded (step 7)
   and the sample, if any, is listed.
7. **Record.** A run in this cycle: put `score`, `scores` and `trace` (when the executor stored
   one) in its row of the coming heartbeat. A run from an earlier heartbeat, or any human grade:
   add `{ id, scorer, score, cap, by }` to the coming heartbeat's `rescores`, one per scorer, with
   `by` `judge` or `human` (`cap` names the fact, for a judge rescore of `done-conditions`). Done
   when each value is in exactly one of the two.

## Rules

- Hard facts beat the judge. A cap is never lifted by argument; only a human grade overrides it.
- The judge never scores a run of its own model, and never a run whose CR it reviewed.
- Judge on the cheapest tier that keeps the model independent. One run per call; no batch scoring
  across tickets. All scorers of one run share the call.
- Score the run against its skill as written at `skillHash`, not against the current skill.
- A score is evidence for `improve-factory`, never a gate on a CR. The bench pass rate is the proof.
- Adding, changing or deleting a scorer is a `guardrail` factory change.
- Judge spend counts toward `learning.budget_usd_per_week`; record judge runs as `judge-run` rows.

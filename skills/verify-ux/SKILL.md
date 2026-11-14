---
name: verify-ux
description: Run each acceptance criterion that names proof `computer-use` as a user would, on a preview deployment of the CR head, and post the evidence for review-pr to grade. It is a skill of its own because it runs the CR's code in a browser with test credentials, which the review runtime must never do. Generic for any product with a user interface; it never runs unless a criterion names `computer-use` and the binding sets `commands.preview`. Use only when review-pr dispatches it.
user-invocable: false
metadata:
  tier: balanced
---

# Verify the product as a user

Why it exists: `review-pr` reads CI and never runs CR code, and with two identities it holds the
review token. A `computer-use` criterion can only be proven by using the running product. So this
step runs apart, as its own executor (`executors.verify-ux`: a browser MCP, test credentials, a
container sandbox), with no review token, and hands `review-pr` evidence, not a verdict. Scripted
UI checks need no agent: they are proof `visual` or `test`, and CI runs them.

Follow the [common contract](../sdlc/references/contract.md). You observe; you never change code,
the ticket or the board, except through `escalate-to-human`. [`review-pr`](../review-pr/SKILL.md) grades what you post. Scripted UI
checks are proof `visual` or `test` and run in CI; this skill covers only agent-driven paths.

## Steps

1. **Criteria.** `agentic-sdlc forge view <n>` and the ticket's spec comment. List every
   criterion whose proof is `computer-use`. Done when you hold each as a user path with its
   expected outcome.
2. **Target.** The deployment of the CR head that `commands.preview` makes; it prints where the
   head runs. Never use an environment of `product.environments`: those run the trunk, not the
   CR. Wait until the head's checks settle (none pending), at most `stall_minutes`. Done when you
   can open the preview of this exact head. With no `commands.preview`, or no reachable preview of
   the head after `stall_minutes`, call [`escalate-to-human`](../escalate-to-human/SKILL.md)
   (Access) and stop.
3. **Drive.** For each criterion, perform the path as a user would, through the product's own
   interface. Use only test credentials the binding names. Done when each path ran to its
   expected end or to the point it broke.
4. **Evidence.** Per criterion record the steps taken, the paths of screenshots or a recording,
   and observed against expected. Done when every row has evidence a reviewer can open.
5. **Post.** One CR comment (`forge comment <n> --body-file <f>`) starting with
   `<!-- verify-ux -->` and the head sha: a table with a row per criterion, PASS or FAIL, and the
   evidence links. Done when the comment is posted by an account in `owners.bots`.

## Rules

- Never change code, config or data in the product beyond what the path itself does.
- No real credentials; use only test ones the binding names, and never write one in a comment.
- A path you could not run is FAIL, never PASS.
- One comment per run; a new head gets a new run.

# Verify as a user

Follow the [contract](../../sdlc/references/contract.md). This step proves `computer-use` criteria
by using the running product, apart from `review/review`, which never runs the CR. You observe and
post evidence, not a verdict. You change no code, no ticket field and no board state, except
through `escalate` and the done line.

1. **Criteria.** `forge view <n>` and the spec (`board comments <id> --kind spec --last 1
   --trusted`). Done when you hold every `computer-use` criterion as a user path with its expected
   outcome.
2. **Target.** The deployment of the head that `commands.preview` makes; it prints where the head
   runs. Never use an environment of `product.environments`: those run the trunk. With no
   `commands.preview`, or no reachable preview of this head within its wait in the contract,
   escalate (Access) and stop. Done when you can open the preview of this exact head.
3. **Drive.** Perform each path as a user would, through the product's own interface, with only the
   test credentials the binding names. Done when each path ran to its expected end or to the point
   it broke.
4. **Evidence.** Per criterion: the steps taken, the paths of screenshots or a recording, observed
   against expected. Done when every row has evidence a reviewer can open.
5. **Post.** One `forge comment <n> --kind verify --ref <head sha> --body-file <f>`: a row per
   criterion, PASS or FAIL, and the evidence links. Done when it is posted by an account in
   `owners.bots`.

## Rules

- Change nothing in the product beyond what the path itself does.
- No real credentials; never write a credential in a comment.
- A path you could not run is FAIL, never PASS.
- One `verify` comment per run; a new head gets a new run.

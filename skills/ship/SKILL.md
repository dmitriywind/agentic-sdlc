---
name: ship
description: Decide whether the trunk is ready for the last environment, choose what ships, set Release Version and cut the release line, with the Product owner's go-ahead. Only for product.delivery release-line. Use on a release request (a Backlog ticket labelled board.labels.release) or a Done P0 fix that is On the environment before the last.
disable-model-invocation: true
metadata:
  tier: balanced
---

# Ship

Follow the [contract](../sdlc/references/contract.md). It works on a release request: a Backlog
ticket labelled `board.labels.release`, opened by the Product owner, or by this step for a P0 fix
(title `Release for P0 #<id>`). Every comment of this step goes on the request, so a later run
resumes from what it shows. The request is never release content. The Product owner approves the
last environment; this step never does. With `product.delivery: continuous` there is no release
line and this step never runs.

1. **Request.** Dispatched for a Done P0 ticket instead of a request: `board list --label
   <board.labels.release> --search "Release for P0 #<id>"`; when none is open, `board create` it at Backlog with that
   label and title. Continue on that request. Done when the request exists.
2. **Resume.** `board comments <request> --kind release-proposal --last 1 --trusted`. With a
   proposal and no go-ahead after it (the contract's Trust), stop with only the done line. A reply that approves goes to
   step 7, or to step 8 when a `release-cut` comment follows it; one that changes contents to step
   4; one asking to refresh to step 3. Done when the run stopped or knows its entry step.
3. **Gather.** The last release (`vcs tags --prefix <vcs.tag_prefix>`, first row); the tickets at
   Done with Shipped On <env before last> and their merge revisions (`mergeSha` from `forge view
   <n>`; `forge view --sha <sha>` finds a CR from a revision); open held and P0 tickets; the open
   signals of each `board.env_labels` label; the latest runs of the environment before the last and
   of CI (`forge runs`). Done when each ticket in range has its revision and each environment its
   open signals.
4. **Revision.** The newest trunk revision whose every ticket at or before it is Done with Shipped
   On <env before last>; a ticket in range that is not means an earlier revision, or waiting. For a
   P0, the newest revision holding the fix. Done when the revision and its tickets are fixed.
5. **Ready check.** All hold: every included ticket is Done with Shipped On <env before last> and
   not held; no P0 is open; no Signal of a failed deploy or release is open; no signal with a `board.env_labels`
   label sits at Signals; the environment before the last and CI are green on the revision;
   `commands.rollback` is named and a green rollback run in the environment before the last since
   the last release tag is shown by `forge runs` or linked in a trusted comment on the request; when
   `product.evidence` lists kinds, `agentic-sdlc gate evidence --sha <revision>` exits 0. Done when
   each holds, or the failing ones are named and the run stopped.
6. **Version and proposal.** The version per `vcs.version_scheme` (CalVer `YYYY.MM.N`, `N` counting
   that month's releases from 1; semver bumps from the last release), never reused, even a failed
   one. Then `board comment <request> --kind release-proposal --ref <revision> --body-file <f>` to
   the primary Product owner: contents, version, revision, and the open signals per environment
   with each one's Status. For a P0 it names the P0 and the commits before it that are not ready,
   if any. Stop. Done when posted.
7. **Mark.** After the go-ahead, run step 5 again on the same revision: anything that appeared since
   the proposal stops the cut. Then, on each selected ticket still On <env before last>, `board set
   <id> release_version <version>` and `board set <id> shipped "In release"`, before the cut. Done
   when every ticket shows both.
8. **Cut.** A tag of this version (`vcs tags --prefix <vcs.tag_prefix>`) or a run on
   `<vcs.release_prefix><version>` (`forge runs --ref <vcs.release_prefix><version>`) means the cut
   was made: read that run. Otherwise `forge cut <revision> <version>`, which starts the release
   run; the Product owner approves its environment. Read the run once a minute within its wait in
   the contract; still running or awaiting approval then, post `board comment <request> --kind
   release-cut --ref <version> --body-file <f>` naming the run, and stop. A failed or rejected cut
   sets the tickets back to On <env before last> and clears their version. Once the line exists,
   `board close <request> --reason completed` and report progress per milestone. Done when the
   request is closed, or the `release-cut` comment is posted.

## Rules

- A cut takes one trunk revision: never commit to a release line or pick commits. When the trunk
  before a P0 fix holds changes not ready to ship, the proposal names them and the Product owner
  decides; a revert on the trunk drops one.
- After a failed release, leave the failed line untouched; cut the next version once the fix is Done
  with Shipped On <env before last>.
- A P0 fix skips no check; only its start is expedited.
- Escalate when the ready check fails and a person must decide, or the proposal changes what the
  Product owner expects to ship.

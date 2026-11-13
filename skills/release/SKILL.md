---
name: release
description: Decide whether the trunk is ready for the last environment, choose what ships, set Release Version and cut the release line. Use on a release request (a Backlog ticket labelled board.labels.release) or when a P0 fix is On <env before last>.
disable-model-invocation: true
metadata:
  tier: balanced
---

# Release

Follow the common contract in [`sdlc`](../sdlc/SKILL.md). It runs on a release request: a Backlog ticket labelled
board.labels.release, opened by the Product owner, or opened by this skill for a P0 fix (title
'Release for P0 #<id>'). All of this skill's comments go on that ticket, so a re-dispatch resumes
from what it shows. The request ticket is never release content.
The Product owner approves the last environment; this skill never does.

## Steps

0. **Resume.** `board comments <request> --trusted`. When the newest comment carrying
   `<!-- release-proposal` has no trusted Product owner reply after it, stop: no comment, no
   further reads. A reply that approves goes to step 6; one that changes contents, to step 3; one
   asking to refresh, to step 1. Done when the run stopped or knows its entry step.
0a. **P0 entry.** Dispatched for a Done P0 ticket instead of a request: `board list --label
   <board.labels.release> --search "Release for P0 #<id>"`. When none is open, `board create` it
   at Backlog with that label and title. Continue on that request. The title is the dedupe key.
1. **Gather.** The last release (`vcs tags --prefix <vcs.tag_prefix>`, first row), the tickets at Done with
   Shipped = On <env before last> and their merge revisions (`mergeSha` of its CR, `forge view <n>`; `forge view --sha <sha>` finds a CR from a revision), open `needs-human` and P0 items, the open signals for each of
   `board.env_labels` (`board list --label <env label>`), and the latest results of the environment before the last and CI results
   (`forge runs`). Done when each ticket in range has its revision and each environment has its
   list of open signals.
2. **Choose the revision.** By default the newest trunk revision whose every ticket at or before it
   is Done with Shipped = On <env before last>. A ticket in range that is not means an earlier revision or
   waiting. Done when the revision and its ticket list are fixed.
3. **Ready check.** All must hold: every included ticket is Done with Shipped = On <env before last>; none is
   held; no P0 is open; no release-failure Signal is open; no signal carrying a `board.env_labels`
   label still sits at Signals; the environment before the last and CI are green on the chosen revision; `commands.rollback`
   is named, with a recorded rollback run in the environment before the last since the previous
   release tag. This checks preparation; it is no wait gate. Done when each is shown, or the failing ones are named and you stop.
4. **Version.** Per `vcs.version_scheme`. CalVer is `YYYY.MM.N`, `N` counting releases in that
   month from 1; semver bumps from the last release. Never reuse a version, even a failed one. Done
   when the version is unused as a tag and a release line.
5. **Propose.** One comment on the release request, to the Product owner, its first line
   `<!-- release-proposal <revision> -->`: contents, version,
   revision, and the open signals per environment with each one's Status. For a P0, the first line names the P0
   and says only the commits needed for it are in the proposal. Then stop. Done when posted and the run has stopped.
6. **Mark.**
   Go-ahead first: continue only after a trusted Product owner reply on the proposal approves it
   (`board comments <id> --trusted` on the release request; a later run resumes here). A reply that
   changes the contents restarts at step 3. Then `board set <id> release_version <version>` on each selected ticket. Done when every
   ticket shows it.
7. **Cut.** `agentic-sdlc vcs cut <revision> <version>` from the chosen revision, never from a
   moving ref (`vcs.release_prefix` is applied by the verb). Then `board set <id> shipped "In release"` on each selected ticket. The cut starts release CI. Done
   when the release line exists at that revision and every selected ticket shows In release. Then
   close the request (`board close <request> completed`), report, with progress per milestone
   read from the board (progress only; versions do not follow milestones), and let the pipelines
   run.

## Rules

- Never commit to a release line or build one from picked commits: a cut takes one trunk
  revision. For a P0, the newest revision holding the fix; when the trunk before it carries
  changes not ready to ship, the proposal names them and the Product owner decides (escalate),
  and a revert on the trunk is the way to drop one.
- After a failed release, leave the failed line untouched. When the fix is Done with Shipped = On
  <env before last>, cut the next version.
- A P0 fix is Done and On <env before last> before it is cut. The expedited part: release starts
  at once and chooses the newest revision holding the fix. No check is skipped.
- With one environment there is no release line: release does not run.
- Escalate when the ready check fails and a person must decide, or the
  proposal changes what the Product owner expects to ship.

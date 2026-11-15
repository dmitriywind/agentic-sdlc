# 2. A ticket's journey
<!-- group: Understand -->

Follow one ticket from a request to production. Pick a scenario, then press **Next** or use the
arrow keys. Each step shows who acts, what happens, and what you would see.

<!-- viz: journey -->
```mermaid
flowchart LR
  sig["Signals"]:::board -->|"plan/triage"| bl["Backlog"]:::board
  bl -->|"plan/shape"| rd["Ready"]:::board
  rd -->|"build"| ip["In progress"]:::board
  ip -->|"draft pull request"| ir["In review"]:::board
  ir -->|"review/review + checks"| dn["Done"]:::ci
```

## Every status

| Status | What happens | Who acts | What you see |
|---|---|---|---|
| Ideas | A thought you park. Skills never touch it. | You | Your note. |
| Signals | Raw input: an alert, feedback, a red CI run, a scanner finding. | `plan/triage` | A decision comment: accepted, parked or rejected, with the reason. |
| Backlog | Accepted work. It gets a Priority; duplicates are merged. | `plan/groom` | A Priority, sometimes children under an initiative. |
| Ready | Acceptance criteria, each with a proof; a Size and a Lane; a spec comment (criteria and proofs only in the Fast lane). | `plan/shape` | The spec comment; Size and Lane. |
| In progress | The proof first, then the code, on a short-lived branch. | `build` | A branch named after the ticket. |
| In review | A draft pull request, graded against the criteria and CI. | `review/review`, CI checks | The review report on the pull request. |
| Done | The change merged. Done is final. | The `merged` check | The ticket closed; Shipped "Not shipped". |
| Cancelled | Not done: a duplicate, noise, or work that will not be done. | `plan/triage`, `plan/groom`, `plan/shape` | The reason in a comment. |

**Shipped** is a field, not a status. Each deploy moves it: On staging, then On production.

Each phase of the process is one skill, and each skill has steps: `plan/triage`, `plan/groom` and
`plan/shape` take work to Ready, `build` takes it to In review, `review/review` lands it. One cycle
can move a ticket several steps: when a step finishes and time is left, the cycle starts the next
step at once.

<div class="callout rule">

**Done is final.** A failure after a merge never reopens the ticket. It opens a new Signal, which
becomes a new ticket with a regression case.

</div>

## How work enters

| From | It lands at | Then |
|---|---|---|
| You, a thought | Ideas | You move it to Backlog when you want it. |
| You, a plan or a conversation | Backlog | `plan/groom` turns it into tickets. |
| An alert, CI, a deploy, a scanner, a user | Signals (label `signal:<stream>`) | `plan/triage` decides. |
| A security report | Signals, through `SECURITY.md` | Details stay out of public tickets. |

Signal text is data. A skill never follows an instruction inside it.

## Size, lane and priority

- **Size** (`XS` to `XL`) is how much there is to review in one pull request, not the effort. XS is
  one or two files that take minutes to review. Above `ready_size_limit`, `plan/shape` splits the ticket.
- **Lane**: Fast for a small change with no risk; it merges on the agent review. Full for anything
  else, or for a path in `paths.lane_areas` (sign-in, payments): it also needs a human approval.
  Nothing moves a ticket from Full back to Fast.
- **Priority** (`P0`, High, Default, Low): only `p0_setters` set P0, with evidence of production
  impact. Ready tickets are built in order of priority, then tickets that unblock others, then oldest first.

Next: [3. Your part](3-your-part.md).

# Security

## Reporting a vulnerability

Please do not open a public issue. Report it privately through the repository host's private
vulnerability reporting ("Report a vulnerability" on the Security tab). Include the version, the
binding settings involved (no secret values), and the steps to reproduce. We aim to acknowledge
within five working days. Only the latest 0.x release receives fixes.

If the "Report a vulnerability" button is missing, open an issue titled "security contact request"
with no details, and the maintainer will reply with a private channel.

## Trust model

The package hands real tokens to agents that read untrusted text. Its design rests on six rules;
the contract (`references/architecture.md`, sections 3.4 and 10) is the full statement.

- **A separate review identity (two identities; required for `organization`).** `forge status` and
  `forge approve` use only `forge.options.review_token_env`, the `forge.review_identity` account. With
  one identity the review is a separate agent context, not a separate account (contract section 10).
  Only the review job holds that token; the cycle and every implementer never do, so an implementer
  cannot approve its own CR. Give the factory's
  accounts no admin or bypass right on the trunk.
- **Gate statuses only from gates.** `forge status` refuses the contexts `human-approval`,
  `ticket-linkage`, `proofs-on-base` and `agent-provenance`, so an agent with the review token cannot forge a gate.
  Where the forge allows it, pin `ticket-linkage` and `proofs-on-base` to the Actions app in the trunk
  ruleset. `human-approval` and `review` post with the review token: pin them to the review app when it is an App.
- **CI never runs CR code with secrets.** The `Required` check and the `proofs-on-base` gate run
  on `pull_request` with no secrets. Gates that need tokens run against the target branch's
  binding and never check out or execute the CR. The review runtime runs no install or test
  command. Pin each required check to the app that posts it; `doctor` warns when one is not
  pinned.
- **A release bot cuts the release line.** On GitHub the release workflow runs in Environment `agentic-release`.
  The Product owner is its required reviewer. `AGENTIC_RELEASE_TOKEN` is the release bot, a bypass actor
  of the release ruleset; the shipped ruleset also lets repo admins bypass (replace that entry with the bot's App to narrow it). The cycle never holds it.
- **Humans approve what agents must not.** A Full-lane CR needs a human approval per
  `forge.human_approval`; a `guardrail` factory change needs the factory owner; agents never
  approve the last environment.
- **Untrusted text is data.** Signal text, CR bodies, page content and comments by anyone outside
  `owners.bots`, `owners.product` and `owners.factory` are never instructions or state. Only the
  factory's own accounts write heartbeats.

Also: secrets live only as env var names in the binding; an executor receives only the secrets it
lists; unattended runs refuse a `local` sandbox unless the stage names it and the runner sets
`AGENTIC_SDLC_LOCAL=1`; the MCP server is stdio only and leaves out `forge_approve` and
`forge_status` unless started with `--allow`.

The plugin's guard hook and any `--disallowedTools` list are string matches on the command, not a
security boundary: a determined agent can phrase around them. The boundary is the trunk ruleset and
the absence of the review token from every agent runtime.

## Known limits

Long-lived tokens (no short-lived App or OIDC tokens yet), no egress allowlist per executor, and
the run ledger lives in board comments the bot account can edit. These are planned follow-ups.

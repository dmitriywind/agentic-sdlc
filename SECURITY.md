# Security

## Reporting a vulnerability

Please do not open a public issue. Report it privately through the repository host's private
vulnerability reporting ("Report a vulnerability" on the Security tab). Include the version, the
binding settings involved (no secret values), and the steps to reproduce. We aim to acknowledge
within five working days. Only the latest alpha receives fixes while v2 is in alpha.

## Trust model

The package hands real tokens to agents that read untrusted text. Its design rests on four rules;
the contract (`references/architecture.md`, sections 3.4 and 10) is the full statement.

- **A separate review identity.** `forge status` and `forge approve` use only
  `forge.options.review_token_env`, the `forge.review_identity` account. With
  `forge.review_runtime: separate` (the default) only the review job holds that token; the cycle
  and every implementer never do, so an implementer cannot approve its own CR. Give the factory's
  accounts no admin or bypass right on the trunk.
- **CI never runs CR code with secrets.** The `Required` check and the `proofs-on-base` gate run
  on `pull_request` with no secrets. Gates that need tokens run against the target branch's
  binding and never check out or execute the CR. The review runtime runs no install or test
  command. Pin each required check to the app that posts it; `doctor` warns when one is not
  pinned.
- **Humans approve what agents must not.** A Full-lane CR needs a human approval per
  `forge.human_approval`; a `guardrail` factory change needs the factory owner; agents never
  approve the last environment.
- **Untrusted text is data.** Signal text, CR bodies, page content and comments by anyone outside
  `owners.bots`, `owners.product` and `owners.factory` are never instructions or state. Only the
  factory's own accounts write heartbeats.

Also: secrets live only as env var names in the binding; an executor receives only the secrets it
lists; unattended runs refuse a `local` sandbox; the hosted MCP endpoint needs a bearer token and
leaves out `forge_approve` and `forge_status` unless started with `--allow`.

## Known limits

Long-lived tokens (no short-lived App or OIDC tokens yet), no egress allowlist per executor, and
the run ledger lives in board comments the bot account can edit. These are planned follow-ups.

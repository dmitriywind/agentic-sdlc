# Source: src/dispatch.ts "cli" (the sandbox check); templates/runner/local.md
@cli:dispatch
Feature: An unattended run uses local execution only when both opt-ins are set
  A stage runs on the machine of the cycle when it names sandbox local, and an unattended run refuses that unless the
  runner also sets AGENTIC_SDLC_LOCAL=1. A stage with no sandbox of its own takes the default stage's sandbox.

  Background:
    Given the installed skill pack
    And the runner sets "U" to "https://h/x"

  Rule: Local execution is opt-in twice

  Rule: A stage with no sandbox of its own takes the default stage's

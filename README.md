# agentic-sdlc

> Governed agentic software-delivery loop with Git worktree sandboxing, durable tracker truth, and TypeScript SDK & CLI.

---

## Overview

`agentic-sdlc` is an installable developer tool and TypeScript library (`agentic-sdlc`) designed to run AI coding agents (Claude Code, Gemini CLI, etc.) in a governed, reproducible delivery loop.

Unlike unconstrained agent setups that pollute your active working copy or run unattended without oversight, `agentic-sdlc`:
1. **Never touches human checkouts**: All planning runs in detached worktrees, and all implementation runs execute in isolated `agentic/ticket-*` branch worktrees.
2. **Durable Tracker Truth**: Work state, stage evidence, decisions, and escalations live in your tracker (GitHub Projects, Jira, or Local JSON), not in transient agent runtime memory.
3. **Strict Policy Governance**: State machine transitions are enforced by `agentic-sdlc-policy.json`, with explicit human approval gates (`waiting:decision`) and evidence validation.

---

## Features

- 🛠️ **CLI & Programmatic SDK**: Run via `npx agentic-sdlc` or embed in custom Node.js/TypeScript workflows via `import { createSupervisor } from 'agentic-sdlc'`.
- 🏰 **Git Worktree & Docker Isolation**: Automated git worktree creation, containerized Docker runner environments (`createDockerSandbox`), branch management, commit/push handling, and teardown.
- 📋 **Tracker Adapters**: Built-in support for GitHub Projects, Jira (REST API), and local JSON trackers.
- 🤖 **Multi-Model Routing**: Map semantic lanes (`triage`, `planning`, `execution`, `review`) to specialized model profiles with automatic fallback chains.
- 🎯 **Stage-Scoped Goal Mode**: Bounded continuations and retry safety nets.
- 🛡️ **Fail-Closed Security**: Protected paths validation prevents unauthorized edits to sensitive repository files.

---

## Installation

Add `agentic-sdlc` to your TypeScript or JavaScript repository:

```bash
npm install -D agentic-sdlc
# or
pnpm add -D agentic-sdlc
# or
yarn add -D agentic-sdlc
```

---

## Quickstart CLI Commands

### 1. Initialize Project Policy & Rules Pointer
Initialize `agentic-sdlc-policy.json` and inject the project rule pointer into `AGENTS.md` / `.cursorrules`:

```bash
npx agentic-sdlc init
```

### 2. Validate Policy Configuration
Check your policy file against normative specification rules:

```bash
npx agentic-sdlc validate
```

### 3. Run Supervisor Loop
- **Single Read-Only Dry Run**:
  ```bash
  npx agentic-sdlc supervise --once --read-only
  ```
- **Single Mutating Tick**:
  ```bash
  npx agentic-sdlc supervise --once
  ```
- **Continuous Daemon Mode**:
  ```bash
  npx agentic-sdlc supervise
  ```

---

## Programmatic TypeScript SDK Usage

You can orchestrate `agentic-sdlc` programmatically within your CI/CD pipelines, custom CLI tools, or serverless workers:

```typescript
import { createSupervisor, validatePolicy, createLocalTracker, createProcessRunner, Policy } from 'agentic-sdlc';
import { readFile } from 'node:fs/promises';

// Load and validate policy
const policyRaw = await readFile('./agentic-sdlc-policy.json', 'utf8');
const policy: Policy = validatePolicy(JSON.parse(policyRaw));

// Instantiate adapters
const tracker = createLocalTracker({ options: policy.tracker.options });
const runner = createProcessRunner({ policy });

// Create supervisor instance
const supervisor = createSupervisor(policy, { tracker, runner });

// Execute one tick
const result = await supervisor.tick({ readOnly: false });

console.log(`Executed ${result.actions.length} action(s). Results: ${result.results.length}`);
```

---

## Architecture & Schemas

### Component Architecture

```mermaid
flowchart TD
    subgraph HostRepo ["Host Repository (Any Codebase)"]
        PolicyConfig["agentic-sdlc-policy.json\n(Project Policy)"]
        RulesPointer["AGENTS.md / .cursorrules\n(Concise 1-Line Pointer)"]
        HumanDev["Human Governor / Developer"]
    end

    subgraph Package ["agentic-sdlc (Installed NPM Tool & SDK)"]
        CLI["dist/bin.js\n(npx agentic-sdlc)"]
        SDK["src/index.ts\n(Programmatic TS API)"]
        
        subgraph Engine ["Core Engine"]
            Supervisor["src/supervisor.ts\n(Supervisor State Machine)"]
            Validator["src/policy.ts\n(Policy Validator)"]
        end

        subgraph Sandbox ["Git Worktree Sandbox Primitive"]
            WorktreeMgr["src/sandbox/worktree.ts\n(Git Worktree Lifecycle)"]
            DockerMgr["src/sandbox/docker.ts\n(Docker Container Sandbox)"]
            DetachedTree["Detached Planning Worktree"]
            BranchTree["Agentic Branch Worktree"]
        end

        subgraph Adapters ["Decoupled Adapters"]
            TrackerAdapter["Tracker Adapters\n(GitHub Projects, Jira, Local JSON)"]
            RunnerAdapter["Runner Adapters\n(Claude Code, Gemini CLI, etc.)"]
        end
    end

    HumanDev -->|Configures| PolicyConfig
    HumanDev -->|Govern / Answer| TrackerAdapter
    CLI --> SDK
    SDK --> Supervisor
    Supervisor --> Validator
    Supervisor --> TrackerAdapter
    Supervisor --> WorktreeMgr
    WorktreeMgr --> DetachedTree
    WorktreeMgr --> BranchTree
    WorktreeMgr --> RunnerAdapter
```

### Git Worktree Execution Flow

```mermaid
sequenceDiagram
    autonumber
    participant T as Tracker (GitHub / Jira / Local JSON)
    participant S as agentic-sdlc Supervisor
    participant W as Git Worktree Sandbox Manager
    participant R as Runner Adapter
    participant C as Agent CLI (Claude / Gemini)

    S->>T: Read ticket snapshot (revision R1)
    S->>S: Derive actionable stage rule (e.g. Implementation)
    S->>W: createSandbox({ baseRef: 'main', ticketId: '42' })
    W->>W: git worktree add -b agentic/ticket-42 ./worktree-42 main
    S->>R: dispatch({ purpose: 'build', workspace: './worktree-42' })
    R->>C: Execute bounded CLI inside isolated worktree
    C-->>W: Commit changes & push branch
    C-->>R: Return RunResult (outcome: completed, PR #10, evidence)
    W->>W: Teardown worktree & clean temporary directory
    R-->>S: Return normalized RunResult
    S->>T: Publish evidence & pull request reference
    S->>T: Advance stage (Implementation -> Review)
```

---

## Operating Guide

### Developer Workflow
1. **Admit Work**: Move a card on your tracker to `Backlog`.
2. **Review Plans**: In `Planning`, `agentic-sdlc` attaches a detailed Markdown plan to the governing ticket for human review.
3. **Answer Escalations (`waiting:decision`)**: If an agent needs product decisions or authorization, `agentic-sdlc` pauses the ticket and sets `waiting:decision`. Post an answer on the ticket to resume.
4. **Review & Merge PRs**: Completed implementation runs generate pull requests from `agentic/ticket-*` branches.

### AI Agent Operating Pointer
AI agents operating in host repositories only need a single pointer in `AGENTS.md`:

```markdown
<!-- agentic-sdlc:start -->
## Agentic SDLC

Work and delivery evidence live in the tracker configured by `agentic-sdlc-policy.json`. Use `npx agentic-sdlc` for installation, validation, or supervision; its specification is the portable authority. Keep project rules as a pointer—do not duplicate the workflow here.
<!-- agentic-sdlc:end -->
```

---

## License

[Apache-2.0](LICENSE)

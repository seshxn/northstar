# ADR-0006: Filesystem-based workspace isolation per issue

## Status
Accepted

## Date
2025-04-01

## Context
Each agent run works on a specific issue. To prevent one agent from inadvertently reading or writing another issue's working files, we need some form of isolation between concurrent runs.

Options:
- Filesystem directories (one directory tree per issue under a configurable root).
- Containers (Docker or similar, one container per issue).
- In-process sandboxing (virtual filesystem or chroot).

Northstar targets high-trust local development where the operator trusts the agent. The primary goal of isolation is accidental cross-contamination, not security containment.

## Decision
Create a dedicated directory per issue under a configurable `workspace.root` path (defaulting to `<tmpdir>/northstar_workspaces`). The directory is named after the issue identifier. The workspace path is passed to the runtime as `workspacePath`; runtimes that support sandboxing (Codex, Claude Code with `approval_policy: auto`) further restrict file operations to this path.

Lifecycle hooks (`after_create`, `before_run`, `after_run`, `before_remove`) allow the operator to run shell commands at each stage — for example, cloning a repository into the workspace before the run, or archiving results after.

## Alternatives Considered

### Container per issue
- Pros: Stronger isolation; reproducible environment.
- Cons: Requires Docker; significantly higher startup latency per issue (5–30 s vs. milliseconds for a directory); complex to pass credentials and tools into the container. Rejected for the initial implementation; noted as a roadmap item.

### Shared workspace (single directory for all issues)
- Pros: Simple; no per-issue setup.
- Cons: Concurrent runs can interfere with each other's files. Rejected; correctness at any concurrency level requires isolation.

### In-process virtual filesystem
- Pros: No disk overhead.
- Cons: Runtime processes (Codex, Claude Code) are external processes; they operate on the real filesystem. In-process abstraction cannot constrain external processes. Rejected; not applicable to the subprocess model.

## Consequences
- The workspace directory is the trust boundary for built-in file tools. Runtimes that support path sandboxing (e.g., Claude Code's `allowed_tools` path restrictions) enforce this boundary.
- Workspace cleanup is not automatic after run completion. The operator is responsible for removing stale workspaces or wiring a `before_remove` hook.
- The `workspace.root` path supports `~` expansion and `$ENV_VAR` references via `resolvePathValue` in `src/config/env.ts`.
- Workspace lifecycle events are synchronous shell-command hooks, not async plugin callbacks, to keep the implementation simple.

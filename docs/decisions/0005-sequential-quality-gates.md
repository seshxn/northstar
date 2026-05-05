# ADR-0005: Sequential quality gates in the same runtime session

## Status
Accepted

## Date
2025-04-01

## Context
After an agent completes an implementation turn, Northstar can run additional "quality gate" turns — for example, a test-runner turn, a code-review turn, or a security-review turn. We need to decide how to execute these gates.

Options:
1. Run gates as additional turns in the **same** session (same model, same thread context).
2. Spawn an **independent session** per gate (fresh context, potentially different model).
3. Run gates **in parallel** across independent sessions.

The core constraints at the time of this decision:
- The runtime interface exposes a single `Session` with a `runTurn()` method; it does not yet support spawning child sessions.
- The primary use case is local development with a single runtime (Claude Code or Codex), not multi-model pipelines.
- Quality gates are lightweight follow-up checks, not full independent agent runs.

## Decision
Run quality gates sequentially as additional `runTurn()` calls on the same session object created for the implementation turn. The gate prompt is constructed by `renderQualityGatePrompt` and injected as a new user turn. The accumulated output from preceding turns is included so later gates have full context.

## Alternatives Considered

### Independent sessions per gate
- Pros: Clean context; gates can use different models.
- Cons: Requires a session-spawning API that does not yet exist; increases latency; gates lose context about what was implemented without explicitly passing it. Deferred; worth revisiting once the runtime interface matures.

### Parallel gates
- Pros: Lower wall-clock latency for independent checks.
- Cons: Adds significant orchestration complexity (fan-out, result aggregation, partial-failure handling); gates may conflict if they both attempt to modify code. Rejected for the initial implementation.

### External CI hooks (post-run shell commands)
- Pros: Language-agnostic; reuses existing CI tooling.
- Cons: Cannot use the agent's reasoning or tool-use capabilities in the gate check; cannot easily pass prior context. Rejected; the agent-in-the-loop model is the point.

## Consequences
- A failed gate marks the entire run as failed and schedules retry via the normal retry policy.
- Gates share the implementation session's context window, which grows with each gate. Long implementation turns may leave limited context for gates.
- All gates use the same runtime and model as the implementation turn.
- The output of each gate is appended to `previousOutput` and passed to the next gate, so later gates can build on earlier ones.
- Parallel independent gate sessions remain a roadmap item; the runtime interface would need to expose session-spawning before this is feasible.

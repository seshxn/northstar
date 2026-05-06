# ADR-0007: Single-queue serialisation for orchestrator state mutations

## Status

Accepted

## Date

2025-04-01

## Context

The `Orchestrator` class holds mutable state (running issues, retry schedules, results, token totals) that is read and written by `tick()`, `stopIssue()`, `retryIssue()`, and HTTP API handlers. All of these can be called concurrently from the service loop and the HTTP server.

Without synchronisation, two concurrent `tick()` calls could double-dispatch the same issue, or a `stopIssue()` call could race with an in-progress dispatch.

Node.js is single-threaded, so concurrent async operations interleave at `await` points rather than truly running in parallel. We need to ensure that state-mutating operations do not interleave with each other.

## Decision

Serialise all state-mutating operations through a single `Promise` chain stored as `this.queue`. `enqueue(operation)` chains the new operation onto the tail of the queue, ensuring operations run one at a time in submission order.

Agent runs themselves are **not** queued — only the dispatch decision is. Once `dispatchCandidates` starts a run, the run executes concurrently with future ticks. The `activeRuns` `Set` tracks in-flight run promises for `waitForIdle()`.

## Alternatives Considered

### Mutex / lock primitive

- Pros: Explicit; well-understood concurrency pattern.
- Cons: No standard mutex in Node.js; requires a library or manual implementation. The `Promise` chain achieves the same result with zero dependencies.

### Immutable state + optimistic CAS

- Pros: Lock-free; composable.
- Cons: Significantly more complex; `Map` and `Set` mutations are not naturally expressed as CAS operations. Rejected; overengineered for single-threaded JS.

### No synchronisation (accept occasional races)

- Pros: Simpler code.
- Cons: Double-dispatch of the same issue is a real hazard when tick intervals are short or HTTP refresh calls overlap with the service loop. Rejected; the queue is small and cheap.

## Consequences

- `tick()` calls are strictly serialised; a slow tick (e.g., one that fetches many issues from a slow tracker) delays the next tick. In practice, ticks are infrequent and short.
- `stopIssue()` and `retryIssue()` called from the HTTP API are also serialised against ticks, ensuring consistent state.
- `waitForIdle()` polls `activeRuns` (not the queue) because the runs themselves are outside the queue.
- The queue is a private implementation detail; callers do not need to know about it.

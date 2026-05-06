# ADR-011: In-Memory Audit Trail and Per-Run Telemetry

## Status

Accepted

## Context

Operators need to understand what the orchestrator did, when, and with what outcomes. Questions like "why is ENG-99 still running?", "when was ENG-97's plan last revised?", and "how many tokens did last night's batch burn?" should be answerable from the dashboard without reading logs.

## Decision

Maintain an **in-memory audit log** (`state.auditLog: AuditEvent[]`) that records key lifecycle events with a monotonically increasing `id`, ISO timestamp, typed `kind`, optional `issueId`/`issueIdentifier`, and free-text `message`. The log is capped at 500 entries (oldest evicted). The last 100 entries are exposed via `GET /api/v1/state`.

Track per-run telemetry directly on `RunEntry` and `CompletedRun`:

- Token counts (`input`, `output`, `total`) from the runtime adapter's response.
- Tool names encountered during the run.
- Skill sequence resolved for the run.
- Individual events (type, message, timestamp).

Aggregate token totals in `state.tokenTotals` for the session lifetime.

The dashboard surfaces:

- An `AuditCard` on the dashboard overview showing the last 8 events.
- An audit timeline in the `IssueSheet` filtered by `issueId`.
- A `TelemetryPanel` in the `IssueSheet` showing tokens, tools, and events for completed runs.
- A token burn counter in the extended metrics row.

## Consequences

**Good:**

- Zero external dependencies — no time-series database, no log aggregator.
- Events are queryable in-process; no round-trips for audit display.
- The typed `AuditEventKind` union prevents misspelled event kinds at compile time.

**Bad:**

- All history is lost on process restart.
- The 500-event cap means high-throughput deployments will lose older events within a session.
- For persistent audit storage, operators should consume `/api/v1/state` periodically and write to an external store.

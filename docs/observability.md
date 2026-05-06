# Observability Guide

Northstar exposes operator visibility through four mechanisms: a structured audit log, per-run telemetry (token counts, tool names, event streams), a Kanban board snapshot, and an HTTP state API.

## Audit Trail

The orchestrator maintains an in-memory audit log (`state.auditLog`) that records key lifecycle events as they occur. The log is capped at 500 entries and the most recent 100 are exposed through `GET /api/v1/state`.

### Event Kinds

| Kind                  | When emitted                                                 |
| --------------------- | ------------------------------------------------------------ |
| `issue_dispatched`    | An issue is selected and queued for a run                    |
| `run_started`         | A runtime session begins (workspace created, agent launched) |
| `plan_created`        | A planning turn produces a plan and posts it to the tracker  |
| `approval_triggered`  | An operator approves a plan via the dashboard or tracker     |
| `feedback_triggered`  | An operator sends revision feedback on a plan                |
| `rejection_triggered` | An operator rejects a plan via the dashboard or tracker      |
| `run_completed`       | A runtime session exits with a successful status             |
| `run_failed`          | A runtime session exits with a failed status                 |
| `retry_scheduled`     | A failed run is queued for a future retry attempt            |
| `issue_stopped`       | An operator stops an in-progress run via the dashboard       |
| `dependency_detected` | The LLM sequencer identifies a cross-issue dependency        |

Each event carries:

```typescript
{
  id: number;          // monotonically increasing sequence number
  timestamp: string;   // ISO 8601
  kind: AuditEventKind;
  issueId?: string;
  issueIdentifier?: string;
  message: string;
  metadata?: Record<string, unknown>;
}
```

### Limitations

The audit log is in-memory only. Entries are lost on process restart. For persistent audit trails, consume the `/api/v1/state` endpoint periodically and write to an external store.

## Token Telemetry

Token counts are captured per-run and aggregated into `state.tokenTotals`. Both are exposed in `GET /api/v1/state`.

Per-run telemetry (in `state.results[*]`):

```json
{
  "tokens": { "input": 14200, "output": 3800, "total": 18000 },
  "eventCount": 22,
  "events": [{ "type": "tool_use", "message": "...", "timestamp": "..." }],
  "toolNames": ["bash", "read", "edit"]
}
```

For running sessions (`state.running[*]`), live telemetry includes `toolNames`, `skillSequence`, `eventCount`, and `lastEvent`.

The dashboard's token burn counter shows cumulative session totals. Per-issue token details appear in the IssueSheet telemetry panel.

## Board Snapshot

`GET /api/v1/board` returns a denormalised view that merges tracker state with runtime state. This is what the Kanban UI consumes.

```typescript
{
  columns: BoardColumn[];
  metrics: { running, awaitingReview, retrying, failed, completed, pullRequestsOpen };
  updatedAt: string;
}
```

Each `BoardCard` carries `runtimeStatus`, `lastEvent`, `lastActivityAt`, `workspacePath`, `pr`, and `detectedDependencies` so the board can show agent activity without the UI needing to correlate across multiple endpoints.

## HTTP Endpoints

| Method | Path                               | Description                                                   |
| ------ | ---------------------------------- | ------------------------------------------------------------- |
| `GET`  | `/api/v1/board`                    | Kanban board snapshot                                         |
| `GET`  | `/api/v1/state`                    | Full orchestrator state (running, results, audit log, tokens) |
| `GET`  | `/api/v1/settings`                 | Active runtime and tracker configuration                      |
| `POST` | `/api/v1/refresh`                  | Trigger an immediate tracker poll                             |
| `POST` | `/api/v1/issues/:id/plan/approve`  | Approve an awaiting-review plan                               |
| `POST` | `/api/v1/issues/:id/plan/feedback` | Send revision feedback on a plan                              |
| `POST` | `/api/v1/issues/:id/reject`        | Reject a plan                                                 |
| `POST` | `/api/v1/issues/:id/move`          | Move an issue to a tracker state                              |
| `POST` | `/api/v1/issues/:id/comment`       | Post a comment on a tracker issue                             |
| `POST` | `/api/v1/issues/:id/pr/create`     | Create or reuse a GitHub PR                                   |
| `POST` | `/api/v1/:id/stop`                 | Stop an in-progress run                                       |
| `POST` | `/api/v1/:id/retry`                | Retry a failed run immediately                                |
| `POST` | `/api/v1/dependencies/scan`        | Trigger LLM dependency analysis                               |
| `POST` | `/api/v1/settings`                 | Update runtime model or tracker JQL (in-memory only)          |

## Local Development

Run the mock API server alongside the Vite dev server for UI development without a real Northstar process:

```bash
# Terminal 1
npm run dev:mock

# Terminal 2
npm run dev:web
```

The mock server starts on `http://127.0.0.1:4000` and serves realistic fixture data including running agents, awaiting-review plans, completed and failed runs, and a populated audit log.

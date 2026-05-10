#!/usr/bin/env tsx
/**
 * Mock API server for local UI development.
 * Run: npx tsx scripts/mock-server.ts
 * Then: npm run dev:web
 */
import Fastify from "fastify";

const app = Fastify({ logger: false });

// ---- Mock data ----

const BOARD = {
  columns: [
    {
      id: "backlog",
      title: "Backlog",
      startsAgent: false,
      acceptsManualMoves: true,
      moveState: "Backlog",
      cards: [
        {
          issueId: "issue-10",
          identifier: "ENG-110",
          title: "Add dark mode support to dashboard",
          description: null,
          state: "Backlog",
          labels: ["frontend", "ui", "design"],
          priority: 3,
          url: "https://linear.app/team/issue/ENG-110",
          runtimeStatus: "idle",
          lastActivityAt: null,
          lastEvent: null,
          workspacePath: null,
          pr: null,
          detectedDependencies: []
        },
        {
          issueId: "issue-11",
          identifier: "ENG-111",
          title: "Implement webhook delivery retries",
          description: "When a webhook delivery fails with a 5xx, we should retry with exponential backoff.",
          state: "Backlog",
          labels: ["backend", "reliability"],
          priority: 2,
          url: "https://linear.app/team/issue/ENG-111",
          runtimeStatus: "idle",
          lastActivityAt: null,
          lastEvent: null,
          workspacePath: null,
          pr: null,
          detectedDependencies: []
        }
      ]
    },
    {
      id: "todo",
      title: "To Do",
      startsAgent: true,
      acceptsManualMoves: true,
      moveState: "Todo",
      cards: [
        {
          issueId: "issue-1",
          identifier: "ENG-101",
          title: "Implement OAuth2 login flow",
          description:
            "## Background\n\nWe need to support OAuth2 for the new enterprise SSO integration.\n\n### Acceptance Criteria\n- Users can log in via Google and GitHub\n- Tokens are stored securely with refresh logic\n- Logout invalidates all sessions",
          state: "Todo",
          labels: ["auth", "security", "backend"],
          priority: 1,
          url: "https://linear.app/team/issue/ENG-101",
          runtimeStatus: "idle",
          lastActivityAt: null,
          lastEvent: null,
          workspacePath: null,
          pr: null,
          detectedDependencies: []
        },
        {
          issueId: "issue-2",
          identifier: "ENG-102",
          title: "Add user profile page",
          description:
            "Build the user profile page with avatar upload and bio editing. **Blocked by ENG-101** — we need auth before we can show per-user data.",
          state: "Todo",
          labels: ["frontend", "ui"],
          priority: 2,
          url: "https://linear.app/team/issue/ENG-102",
          runtimeStatus: "idle",
          lastActivityAt: null,
          lastEvent: null,
          workspacePath: null,
          pr: null,
          detectedDependencies: ["ENG-101"]
        },
        {
          issueId: "issue-12",
          identifier: "ENG-112",
          title: "Add full-text search to issue list",
          description: "Users need to search across title and description fields. Use Postgres trigram index.",
          state: "Todo",
          labels: ["backend", "search", "database"],
          priority: 2,
          url: "https://linear.app/team/issue/ENG-112",
          runtimeStatus: "stalled",
          lastActivityAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          lastEvent: "Waiting for DB migration lock to clear",
          workspacePath: "/tmp/northstar_workspaces/ENG-112",
          pr: null,
          detectedDependencies: []
        }
      ]
    },
    {
      id: "in-progress",
      title: "In Progress",
      startsAgent: false,
      acceptsManualMoves: true,
      moveState: "In Progress",
      cards: [
        {
          issueId: "issue-3",
          identifier: "ENG-99",
          title: "Refactor database connection pooling",
          description: "The current DB pool is leaking connections under load. Profile and fix the connection lifecycle.",
          state: "In Progress",
          labels: ["backend", "performance", "database", "ops"],
          priority: 1,
          url: "https://linear.app/team/issue/ENG-99",
          runtimeStatus: "implementation",
          lastActivityAt: new Date().toISOString(),
          lastEvent: "Writing migration for connection_pool_config table",
          workspacePath: "/tmp/northstar_workspaces/ENG-99",
          pr: null,
          detectedDependencies: []
        },
        {
          issueId: "issue-13",
          identifier: "ENG-103",
          title: "Add audit log for admin actions",
          description: "Every admin mutation should produce a structured audit log entry with actor, action, target, and timestamp.",
          state: "In Progress",
          labels: ["backend", "security", "compliance"],
          priority: 1,
          url: "https://linear.app/team/issue/ENG-103",
          runtimeStatus: "planning",
          lastActivityAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
          lastEvent: "Analyzing existing admin routes for coverage",
          workspacePath: "/tmp/northstar_workspaces/ENG-103",
          pr: null,
          detectedDependencies: []
        }
      ]
    },
    {
      id: "awaiting-review",
      title: "Awaiting Review",
      startsAgent: false,
      acceptsManualMoves: false,
      moveState: null,
      cards: [
        {
          issueId: "issue-4",
          identifier: "ENG-97",
          title: "Add rate limiting to public API",
          description: "Implement token-bucket rate limiting on the `/api/v1` routes to prevent abuse.",
          state: "In Review",
          labels: ["api", "security"],
          priority: 2,
          url: "https://linear.app/team/issue/ENG-97",
          runtimeStatus: "awaiting_review",
          lastActivityAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
          lastEvent: "Plan posted for review",
          workspacePath: "/tmp/northstar_workspaces/ENG-97",
          pr: null,
          detectedDependencies: []
        }
      ]
    },
    {
      id: "done",
      title: "Done",
      startsAgent: false,
      acceptsManualMoves: true,
      moveState: "Done",
      cards: [
        {
          issueId: "issue-5",
          identifier: "ENG-91",
          title: "Set up CI pipeline with GitHub Actions",
          description: "Add a CI workflow that runs tests and typechecking on every PR.",
          state: "Done",
          labels: ["devops", "ci"],
          priority: 3,
          url: "https://linear.app/team/issue/ENG-91",
          runtimeStatus: "completed",
          lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          lastEvent: "Northstar completed ENG-91.",
          workspacePath: "/tmp/northstar_workspaces/ENG-91",
          pr: { url: "https://github.com/org/repo/pull/42", number: 42, state: "open" },
          detectedDependencies: []
        },
        {
          issueId: "issue-6",
          identifier: "ENG-88",
          title: "Migrate legacy API to TypeScript",
          description: null,
          state: "Done",
          labels: ["typescript", "refactor", "backend", "migration"],
          priority: 2,
          url: null,
          runtimeStatus: "completed",
          lastActivityAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          lastEvent: "Northstar completed ENG-88.",
          workspacePath: "/tmp/northstar_workspaces/ENG-88",
          pr: { url: "https://github.com/org/repo/pull/38", number: 38, state: "merged" },
          detectedDependencies: []
        },
        {
          issueId: "issue-7",
          identifier: "ENG-85",
          title: "Fix broken pagination on issues list",
          description: "The next-page cursor is off-by-one when total items is a multiple of the page size.",
          state: "Done",
          labels: ["bug"],
          priority: 1,
          url: null,
          runtimeStatus: "failed",
          lastActivityAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
          lastEvent: "Test suite failed: 3 tests still red after fix attempt.",
          workspacePath: "/tmp/northstar_workspaces/ENG-85",
          pr: null,
          detectedDependencies: []
        },
        {
          issueId: "issue-9",
          identifier: "ENG-94",
          title: "Optimise bundle size — tree-shake lodash",
          description: "Switch to per-function imports to eliminate ~40 kB from the production bundle.",
          state: "Done",
          labels: ["frontend", "performance"],
          priority: 3,
          url: null,
          runtimeStatus: "completed",
          lastActivityAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          lastEvent: "Northstar completed ENG-94.",
          workspacePath: "/tmp/northstar_workspaces/ENG-94",
          pr: { url: "https://github.com/org/repo/pull/40", number: 40, state: "merged" },
          detectedDependencies: []
        }
      ]
    }
  ],
  metrics: {
    running: 2,
    awaitingReview: 1,
    retrying: 1,
    failed: 1,
    completed: 3,
    pullRequestsOpen: 2
  },
  updatedAt: new Date().toISOString()
};

const STATE = {
  pollIntervalMs: 30000,
  maxConcurrentAgents: 10,
  running: [
    {
      issue: "ENG-99",
      issueId: "issue-3",
      threadId: "thread-abc123",
      mode: "implementation",
      eventCount: 14,
      lastEvent: "Writing migration for connection_pool_config table",
      workspacePath: "/tmp/northstar_workspaces/ENG-99",
      toolNames: ["bash", "read", "edit", "write"],
      skillSequence: ["research", "plan", "implement"],
      startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString()
    },
    {
      issue: "ENG-103",
      issueId: "issue-13",
      threadId: "thread-abc456",
      mode: "planning",
      eventCount: 6,
      lastEvent: "Analyzing existing admin routes for coverage",
      workspacePath: "/tmp/northstar_workspaces/ENG-103",
      toolNames: ["read", "bash"],
      skillSequence: ["research", "plan"],
      startedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
    },
    {
      issue: "ENG-107",
      issueId: "issue-ref-1",
      threadId: "thread-ref-001",
      mode: "refinement",
      eventCount: 4,
      lastEvent: "Drafting acceptance criteria for notification delivery guarantees",
      workspacePath: "/tmp/northstar_workspaces/ENG-107",
      toolNames: ["read"],
      skillSequence: [],
      startedAt: new Date(Date.now() - 90 * 1000).toISOString()
    },
    {
      issue: "ENG-108",
      issueId: "issue-ref-2",
      threadId: "thread-ref-002",
      mode: "refinement",
      eventCount: 2,
      lastEvent: "Reading related issues for context",
      workspacePath: "/tmp/northstar_workspaces/ENG-108",
      toolNames: ["read"],
      skillSequence: [],
      startedAt: new Date(Date.now() - 35 * 1000).toISOString()
    }
  ],
  awaitingReview: [
    {
      issueId: "issue-4",
      issue: "ENG-97",
      title: "Add rate limiting to public API",
      workspacePath: "/tmp/northstar_workspaces/ENG-97",
      planOutput: `## Plan: Rate Limiting for Public API

### Overview
Implement token-bucket rate limiting on all \`/api/v1\` routes.

### Implementation Steps

1. **Install \`@fastify/rate-limit\`** as a dependency
2. **Configure global rate limit** — 100 requests / 15 minutes per IP
3. **Add per-route overrides** for sensitive endpoints like \`/auth\` (10 req / 15 min)
4. **Return 429 responses** with \`Retry-After\` header when limit exceeded
5. **Add integration tests** covering the rate-limit threshold

### Files to change
- \`src/server/index.ts\` — register plugin
- \`src/server/routes/auth.ts\` — stricter limit
- \`test/rate-limit.test.ts\` — new test file

---
Reply with \`/approve\` to proceed, \`/revise <feedback>\` to request changes, or \`/reject\` to cancel.`,
      planCommentId: "comment-999",
      lastProcessedCommentId: null,
      createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      attempt: 1
    }
  ],
  retryAttempts: [{ issueId: "issue-7", attempt: 2, dueAt: new Date(Date.now() + 4 * 60 * 1000).toISOString() }],
  completed: ["ENG-91", "ENG-88", "ENG-94", "ENG-105", "ENG-106"],
  claimed: ["issue-3", "issue-4", "issue-13", "issue-ref-1", "issue-ref-2"],
  results: [
    // ── Refinement results ────────────────────────────────────────────────
    {
      issueId: "issue-ref-3",
      issue: "ENG-105",
      threadId: "thread-ref-003",
      workspacePath: "/tmp/northstar_workspaces/ENG-105",
      status: "completed",
      output: `## Scheduled Notification Delivery

### Overview
Users need to schedule notifications to be sent at a future time. This supports use cases like "remind me about this issue in 2 hours" and digest-style emails that batch multiple events.

### Acceptance Criteria
- [ ] A user can schedule a notification with a target delivery time (ISO 8601 timestamp)
- [ ] Scheduled notifications are stored with status \`pending\` until their delivery window
- [ ] A background job polls every 30 seconds and delivers any \`pending\` notifications whose \`deliver_at\` has elapsed
- [ ] If delivery fails (downstream error), the notification transitions to \`failed\` and retries up to 3 times with exponential backoff (1m, 5m, 25m)
- [ ] After 3 failures the notification transitions to \`dead\` and an alert fires
- [ ] Delivered notifications transition to \`sent\` with a \`delivered_at\` timestamp
- [ ] The UI shows scheduled, sent, failed, and dead notifications in the notification history panel

### Technical Approach
- Add \`deliver_at\`, \`status\`, \`retry_count\`, \`delivered_at\` columns to the \`notifications\` table (new migration)
- Introduce a \`NotificationScheduler\` service that wraps the existing \`NotificationSender\`
- The scheduler reads \`WHERE status = 'pending' AND deliver_at <= NOW()\` in batches of 50
- Use a Postgres advisory lock to prevent duplicate delivery across instances
- Expose \`POST /api/v1/notifications\` with optional \`deliver_at\` field (defaults to immediate)

### Out of Scope
- Recurring / cron-based notifications (separate ticket)
- Push notifications (only email/in-app for now)
- User-facing timezone conversion (always store UTC)`,
      tokens: { input: 8200, output: 4100, total: 12300 },
      eventCount: 9,
      events: [
        { type: "tool_use", message: "read: src/notifications/sender.ts", timestamp: new Date(Date.now() - 4 * 3600 * 1000 + 1000).toISOString() },
        { type: "tool_use", message: "read: src/notifications/types.ts", timestamp: new Date(Date.now() - 4 * 3600 * 1000 + 3000).toISOString() },
        { type: "result", message: "Refinement complete.", timestamp: new Date(Date.now() - 4 * 3600 * 1000 + 30000).toISOString() }
      ],
      startedAt: new Date(Date.now() - 4 * 3600 * 1000 - 120000).toISOString(),
      completedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      attempt: 1,
      gateResults: [],
      mode: "refinement"
    },
    {
      issueId: "issue-ref-4",
      issue: "ENG-106",
      threadId: "thread-ref-004",
      workspacePath: "/tmp/northstar_workspaces/ENG-106",
      status: "completed",
      output: `## Multi-Tenant Data Isolation

### Overview
The platform must ensure that data from one tenant is never visible to users of another tenant. This is a foundational security requirement for the enterprise tier.

### Acceptance Criteria
- [ ] Every database query that touches tenant-owned data includes a \`WHERE tenant_id = $current_tenant\` clause
- [ ] A middleware layer injects \`current_tenant\` from the authenticated session before each request handler runs
- [ ] Integration tests verify that a request authenticated as Tenant A cannot read or modify Tenant B's data
- [ ] The audit log captures any query that omits the tenant filter (detectable via query plan introspection)
- [ ] Existing single-tenant test fixtures are updated to include \`tenant_id\`

### Technical Approach
- Introduce a \`TenantContext\` that is set by \`AuthMiddleware\` and consumed by all repository classes
- Repository base class gains a \`scopeToTenant(qb)\` helper that appends the \`WHERE\` clause automatically
- New \`TenantIsolationTest\` harness that spins up two tenants and runs cross-tenant read/write probes

### Edge Cases
- Super-admin routes (\`/admin/**\`) are exempt and must be explicitly labelled \`@BypassTenantScope\`
- Background jobs that process all tenants iterate via \`SELECT DISTINCT tenant_id\` and switch context per batch
- Row-level security (Postgres RLS) is considered but deferred — too much migration risk for now

### Out of Scope
- Cross-tenant sharing features (separate workstream)
- Tenant provisioning / deprovisioning flow`,
      tokens: { input: 11400, output: 5800, total: 17200 },
      eventCount: 12,
      events: [
        { type: "tool_use", message: "read: src/db/repository.ts", timestamp: new Date(Date.now() - 6 * 3600 * 1000 + 1000).toISOString() },
        { type: "tool_use", message: "read: src/auth/middleware.ts", timestamp: new Date(Date.now() - 6 * 3600 * 1000 + 4000).toISOString() },
        { type: "tool_use", message: "bash: grep -r 'tenant_id' src/ | wc -l", timestamp: new Date(Date.now() - 6 * 3600 * 1000 + 8000).toISOString() },
        { type: "result", message: "Refinement complete.", timestamp: new Date(Date.now() - 6 * 3600 * 1000 + 45000).toISOString() }
      ],
      startedAt: new Date(Date.now() - 6 * 3600 * 1000 - 180000).toISOString(),
      completedAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      attempt: 1,
      gateResults: [],
      mode: "refinement"
    },
    {
      issueId: "issue-ref-5",
      issue: "ENG-109",
      threadId: "thread-ref-005",
      workspacePath: "/tmp/northstar_workspaces/ENG-109",
      status: "failed",
      output: "Context window exceeded while reading large schema file. Could not produce refinement output.",
      tokens: { input: 42000, output: 180, total: 42180 },
      eventCount: 3,
      events: [
        { type: "tool_use", message: "read: db/schema.sql (32 000 lines)", timestamp: new Date(Date.now() - 1 * 3600 * 1000 + 1000).toISOString() },
        { type: "result", message: "Context limit reached.", timestamp: new Date(Date.now() - 1 * 3600 * 1000 + 5000).toISOString() }
      ],
      startedAt: new Date(Date.now() - 1 * 3600 * 1000 - 60000).toISOString(),
      completedAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      attempt: 1,
      error: "Context window exceeded while reading large schema file.",
      gateResults: [],
      mode: "refinement"
    },
    // ── Implementation results ────────────────────────────────────────────
    {
      issueId: "issue-5",
      issue: "ENG-91",
      threadId: "thread-xyz001",
      workspacePath: "/tmp/northstar_workspaces/ENG-91",
      status: "completed",
      output: "CI workflow created at .github/workflows/ci.yml. Tests pass on push and pull_request events.",
      tokens: { input: 14200, output: 3800, total: 18000 },
      eventCount: 22,
      events: [
        { type: "tool_use", message: "bash: ls .github/", timestamp: new Date(Date.now() - 2 * 3600 * 1000 + 0).toISOString() },
        { type: "tool_use", message: "write: .github/workflows/ci.yml", timestamp: new Date(Date.now() - 2 * 3600 * 1000 + 5000).toISOString() },
        { type: "tool_use", message: "bash: git add .github/workflows/ci.yml", timestamp: new Date(Date.now() - 2 * 3600 * 1000 + 10000).toISOString() },
        { type: "result", message: "All checks pass. CI pipeline is live.", timestamp: new Date(Date.now() - 2 * 3600 * 1000 + 15000).toISOString() }
      ],
      startedAt: new Date(Date.now() - 2 * 3600 * 1000 - 600000).toISOString(),
      completedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      attempt: 1,
      gateResults: []
    },
    {
      issueId: "issue-6",
      issue: "ENG-88",
      threadId: "thread-xyz002",
      workspacePath: "/tmp/northstar_workspaces/ENG-88",
      status: "completed",
      output: "Migrated 18 files to TypeScript. 0 type errors.",
      tokens: { input: 38400, output: 12200, total: 50600 },
      eventCount: 47,
      events: [
        { type: "tool_use", message: "bash: find src -name '*.js' | wc -l", timestamp: new Date(Date.now() - 5 * 3600 * 1000 + 0).toISOString() },
        { type: "tool_use", message: "edit: src/index.js → src/index.ts", timestamp: new Date(Date.now() - 5 * 3600 * 1000 + 3000).toISOString() },
        { type: "result", message: "Migration complete. tsc --noEmit passes.", timestamp: new Date(Date.now() - 5 * 3600 * 1000 + 60000).toISOString() }
      ],
      startedAt: new Date(Date.now() - 5 * 3600 * 1000 - 900000).toISOString(),
      completedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      attempt: 1,
      gateResults: []
    },
    {
      issueId: "issue-9",
      issue: "ENG-94",
      threadId: "thread-xyz004",
      workspacePath: "/tmp/northstar_workspaces/ENG-94",
      status: "completed",
      output: "Replaced 14 full lodash imports with per-function imports. Bundle reduced by 41 kB (gzip: -18 kB).",
      tokens: { input: 9800, output: 2900, total: 12700 },
      eventCount: 19,
      events: [
        { type: "tool_use", message: "bash: grep -r \"from 'lodash'\" src/ | wc -l", timestamp: new Date(Date.now() - 3 * 3600 * 1000 + 0).toISOString() },
        { type: "tool_use", message: "edit: 14 files — per-function lodash imports", timestamp: new Date(Date.now() - 3 * 3600 * 1000 + 8000).toISOString() },
        { type: "result", message: "Bundle size reduced. All tests pass.", timestamp: new Date(Date.now() - 3 * 3600 * 1000 + 30000).toISOString() }
      ],
      startedAt: new Date(Date.now() - 3 * 3600 * 1000 - 480000).toISOString(),
      completedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      attempt: 1,
      gateResults: [
        { gate: "lint", status: "completed", output: "0 errors, 0 warnings" },
        { gate: "test", status: "completed", output: "112 tests passed" }
      ]
    },
    {
      issueId: "issue-7",
      issue: "ENG-85",
      threadId: "thread-xyz003",
      workspacePath: "/tmp/northstar_workspaces/ENG-85",
      status: "failed",
      output: "Test suite failed: 3 tests still red after fix attempt.",
      tokens: { input: 9100, output: 2300, total: 11400 },
      eventCount: 18,
      events: [
        { type: "tool_use", message: "read: src/pagination.ts", timestamp: new Date(Date.now() - 8 * 3600 * 1000 + 0).toISOString() },
        { type: "tool_use", message: "edit: src/pagination.ts (off-by-one fix)", timestamp: new Date(Date.now() - 8 * 3600 * 1000 + 2000).toISOString() },
        { type: "tool_use", message: "bash: npm test -- --grep pagination", timestamp: new Date(Date.now() - 8 * 3600 * 1000 + 5000).toISOString() },
        { type: "result", message: "3 tests still failing — cursor math is wrong for edge case.", timestamp: new Date(Date.now() - 8 * 3600 * 1000 + 8000).toISOString() }
      ],
      startedAt: new Date(Date.now() - 8 * 3600 * 1000 - 300000).toISOString(),
      completedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      attempt: 1,
      error: "Test suite failed: 3 tests still red after fix attempt.",
      gateResults: []
    }
  ],
  tokenTotals: { input: 133100, output: 29280, total: 162380 },
  auditLog: [
    {
      id: 1,
      timestamp: new Date(Date.now() - 8 * 3600 * 1000 - 310000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-7",
      issueIdentifier: "ENG-85",
      message: "ENG-85 dispatched to claude_code runtime (attempt 1)"
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 8 * 3600 * 1000 - 305000).toISOString(),
      kind: "run_started",
      issueId: "issue-7",
      issueIdentifier: "ENG-85",
      message: "Run started for ENG-85",
      metadata: { workspacePath: "/tmp/northstar_workspaces/ENG-85" }
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      kind: "run_failed",
      issueId: "issue-7",
      issueIdentifier: "ENG-85",
      message: "ENG-85 failed after 18 events: Test suite failed: 3 tests still red after fix attempt.",
      metadata: { tokens: { input: 9100, output: 2300, total: 11400 }, eventCount: 18 }
    },
    {
      id: 4,
      timestamp: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
      kind: "refinement_started",
      issueId: "issue-ref-4",
      issueIdentifier: "ENG-106",
      message: "Refinement started for ENG-106"
    },
    {
      id: 5,
      timestamp: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      kind: "refinement_completed",
      issueId: "issue-ref-4",
      issueIdentifier: "ENG-106",
      message: "Refinement completed for ENG-106",
      metadata: { tokens: { input: 11400, output: 5800, total: 17200 } }
    },
    {
      id: 6,
      timestamp: new Date(Date.now() - 5 * 3600 * 1000 - 910000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-6",
      issueIdentifier: "ENG-88",
      message: "ENG-88 dispatched to claude_code runtime (attempt 1)"
    },
    {
      id: 7,
      timestamp: new Date(Date.now() - 5 * 3600 * 1000 - 900000).toISOString(),
      kind: "run_started",
      issueId: "issue-6",
      issueIdentifier: "ENG-88",
      message: "Run started for ENG-88",
      metadata: { workspacePath: "/tmp/northstar_workspaces/ENG-88" }
    },
    {
      id: 8,
      timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      kind: "run_completed",
      issueId: "issue-6",
      issueIdentifier: "ENG-88",
      message: "ENG-88 completed after 47 events",
      metadata: { tokens: { input: 38400, output: 12200, total: 50600 }, eventCount: 47 }
    },
    {
      id: 9,
      timestamp: new Date(Date.now() - 4 * 3600 * 1000 - 120000).toISOString(),
      kind: "refinement_started",
      issueId: "issue-ref-3",
      issueIdentifier: "ENG-105",
      message: "Refinement started for ENG-105"
    },
    {
      id: 10,
      timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      kind: "refinement_completed",
      issueId: "issue-ref-3",
      issueIdentifier: "ENG-105",
      message: "Refinement completed for ENG-105",
      metadata: { tokens: { input: 8200, output: 4100, total: 12300 } }
    },
    {
      id: 11,
      timestamp: new Date(Date.now() - 3 * 3600 * 1000 - 480000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-9",
      issueIdentifier: "ENG-94",
      message: "ENG-94 dispatched to claude_code runtime (attempt 1)"
    },
    {
      id: 12,
      timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      kind: "run_completed",
      issueId: "issue-9",
      issueIdentifier: "ENG-94",
      message: "ENG-94 completed after 19 events",
      metadata: { tokens: { input: 9800, output: 2900, total: 12700 } }
    },
    {
      id: 13,
      timestamp: new Date(Date.now() - 2 * 3600 * 1000 - 610000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-5",
      issueIdentifier: "ENG-91",
      message: "ENG-91 dispatched to claude_code runtime (attempt 1)"
    },
    {
      id: 14,
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      kind: "run_completed",
      issueId: "issue-5",
      issueIdentifier: "ENG-91",
      message: "ENG-91 completed after 22 events",
      metadata: { tokens: { input: 14200, output: 3800, total: 18000 } }
    },
    {
      id: 15,
      timestamp: new Date(Date.now() - 1 * 3600 * 1000 - 60000).toISOString(),
      kind: "refinement_started",
      issueId: "issue-ref-5",
      issueIdentifier: "ENG-109",
      message: "Refinement started for ENG-109"
    },
    {
      id: 16,
      timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      kind: "run_failed",
      issueId: "issue-ref-5",
      issueIdentifier: "ENG-109",
      message: "Refinement failed for ENG-109: Context window exceeded while reading large schema file.",
      metadata: { tokens: { input: 42000, output: 180, total: 42180 } }
    },
    {
      id: 17,
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "ENG-97 dispatched to claude_code runtime — approval gate active (attempt 1)"
    },
    {
      id: 18,
      timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      kind: "plan_created",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "Plan created for ENG-97 — awaiting review"
    },
    {
      id: 19,
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      kind: "feedback_triggered",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "Feedback received for ENG-97: 'Add per-endpoint override docs to the plan'",
      metadata: { message: "Add per-endpoint override docs to the plan", author: "seshxn" }
    },
    {
      id: 20,
      timestamp: new Date(Date.now() - 13 * 60 * 1000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-3",
      issueIdentifier: "ENG-99",
      message: "ENG-99 dispatched to claude_code runtime (attempt 1)"
    },
    {
      id: 21,
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      kind: "run_started",
      issueId: "issue-3",
      issueIdentifier: "ENG-99",
      message: "Run started for ENG-99",
      metadata: { workspacePath: "/tmp/northstar_workspaces/ENG-99" }
    },
    {
      id: 22,
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      kind: "dependency_detected",
      issueId: "issue-2",
      issueIdentifier: "ENG-102",
      message: "Dependency detected: ENG-102 is blocked by ENG-101",
      metadata: { blockedBy: ["ENG-101"] }
    },
    {
      id: 23,
      timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      kind: "run_started",
      issueId: "issue-13",
      issueIdentifier: "ENG-103",
      message: "Planning run started for ENG-103",
      metadata: { mode: "planning" }
    },
    {
      id: 24,
      timestamp: new Date(Date.now() - 90 * 1000).toISOString(),
      kind: "refinement_started",
      issueId: "issue-ref-1",
      issueIdentifier: "ENG-107",
      message: "Refinement started for ENG-107"
    },
    {
      id: 25,
      timestamp: new Date(Date.now() - 35 * 1000).toISOString(),
      kind: "refinement_started",
      issueId: "issue-ref-2",
      issueIdentifier: "ENG-108",
      message: "Refinement started for ENG-108"
    }
  ]
};

const SETTINGS: {
  runtime: { kind: string; executionModel: string; planningModel: string };
  tracker: { kind: string; jql: string | null; project_key: string | null; active_states: string[]; backlog_states: string[] };
} = {
  runtime: {
    kind: "claude_code",
    executionModel: "claude-sonnet-4-6",
    planningModel: "claude-opus-4-7"
  },
  tracker: {
    kind: "linear",
    jql: null,
    project_key: null,
    active_states: ["Todo", "In Progress"],
    backlog_states: ["Backlog"]
  }
};

// ---- Routes ----

app.get("/api/v1/board", async () => {
  BOARD.updatedAt = new Date().toISOString();
  return BOARD;
});

app.get("/api/v1/state", async () => STATE);

app.get("/api/v1/settings", async () => SETTINGS);

app.post<{ Params: { identifier: string } }>("/api/v1/issues/:identifier/plan/approve", async (_request, reply) => {
  return reply.code(202).send({ ok: true });
});

app.post<{ Params: { identifier: string }; Body: { message?: string } }>(
  "/api/v1/issues/:identifier/plan/feedback",
  async (_request, reply) => {
    return reply.code(202).send({ ok: true });
  }
);

app.post<{ Params: { identifier: string }; Body: { message?: string } }>("/api/v1/issues/:identifier/reject", async (_request, reply) => {
  return reply.code(202).send({ ok: true });
});

app.post<{ Params: { identifier: string }; Body: { state: string } }>("/api/v1/issues/:identifier/move", async (_request, reply) => {
  return reply.code(202).send({ ok: true });
});

app.post<{ Params: { identifier: string }; Body: { body: string } }>("/api/v1/issues/:identifier/comment", async (request, reply) => {
  console.log(`[mock] Comment on ${request.params.identifier}:`, request.body?.body);
  return reply.code(202).send({ ok: true });
});

app.post<{ Params: { identifier: string }; Body: { head: string } }>("/api/v1/issues/:identifier/pr/create", async (request, reply) => {
  console.log(`[mock] Create PR for ${request.params.identifier}, branch: ${request.body?.head}`);
  return reply.code(202).send({ ok: true, pr: { url: "https://github.com/org/repo/pull/99", number: 99, state: "open" } });
});

app.post<{ Params: { identifier: string } }>("/api/v1/:identifier/stop", async (_request, reply) => {
  return reply.code(202).send({ ok: true });
});

app.post<{ Params: { identifier: string } }>("/api/v1/:identifier/retry", async (_request, reply) => {
  return reply.code(202).send({ ok: true });
});

app.post("/api/v1/refresh", async (_request, reply) => {
  return reply.code(202).send({ ok: true });
});

app.post("/api/v1/dependencies/scan", async (_request, reply) => {
  console.log("[mock] Dependency scan triggered — injecting ENG-102 blocked-by ENG-101");
  const card = BOARD.columns[1].cards.find((c) => c.issueId === "issue-2");
  if (card) card.detectedDependencies = ["ENG-101"];
  return reply.code(202).send({ ok: true });
});

app.post<{ Body: { runtime?: Record<string, string>; tracker?: Record<string, unknown> } }>("/api/v1/settings", async (request, reply) => {
  const { runtime, tracker } = request.body ?? {};
  if (runtime?.executionModel) SETTINGS.runtime.executionModel = runtime.executionModel;
  if (runtime?.planningModel) SETTINGS.runtime.planningModel = runtime.planningModel;
  if (tracker?.jql && typeof tracker.jql === "string") SETTINGS.tracker.jql = tracker.jql;
  if (Array.isArray(tracker?.backlog_states)) SETTINGS.tracker.backlog_states = tracker.backlog_states as string[];
  console.log("[mock] Settings updated:", request.body);
  return reply.code(200).send({ ok: true });
});

await app.listen({ host: "127.0.0.1", port: 4000 });
console.log("Mock Northstar API running on http://127.0.0.1:4000");
console.log("Now run:  npm run dev:web");

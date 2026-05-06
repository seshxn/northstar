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
          pr: null,
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
        }
      ]
    }
  ],
  metrics: {
    running: 1,
    awaitingReview: 1,
    retrying: 0,
    failed: 1,
    completed: 2,
    pullRequestsOpen: 1
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
      eventCount: 14,
      lastEvent: "Writing migration for connection_pool_config table",
      workspacePath: "/tmp/northstar_workspaces/ENG-99",
      toolNames: ["bash", "read", "edit", "write"],
      skillSequence: ["research", "plan", "implement"],
      startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString()
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
  completed: ["ENG-91", "ENG-88"],
  claimed: ["issue-3", "issue-4"],
  results: [
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
        {
          type: "tool_use",
          message: "write: .github/workflows/ci.yml",
          timestamp: new Date(Date.now() - 2 * 3600 * 1000 + 5000).toISOString()
        },
        {
          type: "tool_use",
          message: "bash: git add .github/workflows/ci.yml",
          timestamp: new Date(Date.now() - 2 * 3600 * 1000 + 10000).toISOString()
        },
        {
          type: "result",
          message: "All checks pass. CI pipeline is live.",
          timestamp: new Date(Date.now() - 2 * 3600 * 1000 + 15000).toISOString()
        }
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
        {
          type: "tool_use",
          message: "bash: find src -name '*.js' | wc -l",
          timestamp: new Date(Date.now() - 5 * 3600 * 1000 + 0).toISOString()
        },
        {
          type: "tool_use",
          message: "edit: src/index.js → src/index.ts",
          timestamp: new Date(Date.now() - 5 * 3600 * 1000 + 3000).toISOString()
        },
        {
          type: "result",
          message: "Migration complete. tsc --noEmit passes.",
          timestamp: new Date(Date.now() - 5 * 3600 * 1000 + 60000).toISOString()
        }
      ],
      startedAt: new Date(Date.now() - 5 * 3600 * 1000 - 900000).toISOString(),
      completedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      attempt: 1,
      gateResults: []
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
        {
          type: "tool_use",
          message: "edit: src/pagination.ts (off-by-one fix)",
          timestamp: new Date(Date.now() - 8 * 3600 * 1000 + 2000).toISOString()
        },
        {
          type: "tool_use",
          message: "bash: npm test -- --grep pagination",
          timestamp: new Date(Date.now() - 8 * 3600 * 1000 + 5000).toISOString()
        },
        {
          type: "result",
          message: "3 tests still failing — cursor math is wrong for edge case.",
          timestamp: new Date(Date.now() - 8 * 3600 * 1000 + 8000).toISOString()
        }
      ],
      startedAt: new Date(Date.now() - 8 * 3600 * 1000 - 300000).toISOString(),
      completedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      attempt: 1,
      error: "Test suite failed: 3 tests still red after fix attempt.",
      gateResults: []
    }
  ],
  tokenTotals: { input: 61700, output: 18300, total: 80000 },
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
      timestamp: new Date(Date.now() - 5 * 3600 * 1000 - 910000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-6",
      issueIdentifier: "ENG-88",
      message: "ENG-88 dispatched to claude_code runtime (attempt 1)"
    },
    {
      id: 5,
      timestamp: new Date(Date.now() - 5 * 3600 * 1000 - 900000).toISOString(),
      kind: "run_started",
      issueId: "issue-6",
      issueIdentifier: "ENG-88",
      message: "Run started for ENG-88",
      metadata: { workspacePath: "/tmp/northstar_workspaces/ENG-88" }
    },
    {
      id: 6,
      timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      kind: "run_completed",
      issueId: "issue-6",
      issueIdentifier: "ENG-88",
      message: "ENG-88 completed after 47 events",
      metadata: { tokens: { input: 38400, output: 12200, total: 50600 }, eventCount: 47 }
    },
    {
      id: 7,
      timestamp: new Date(Date.now() - 2 * 3600 * 1000 - 610000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-5",
      issueIdentifier: "ENG-91",
      message: "ENG-91 dispatched to claude_code runtime (attempt 1)"
    },
    {
      id: 8,
      timestamp: new Date(Date.now() - 2 * 3600 * 1000 - 600000).toISOString(),
      kind: "run_started",
      issueId: "issue-5",
      issueIdentifier: "ENG-91",
      message: "Run started for ENG-91",
      metadata: { workspacePath: "/tmp/northstar_workspaces/ENG-91" }
    },
    {
      id: 9,
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      kind: "run_completed",
      issueId: "issue-5",
      issueIdentifier: "ENG-91",
      message: "ENG-91 completed after 22 events",
      metadata: { tokens: { input: 14200, output: 3800, total: 18000 }, eventCount: 22 }
    },
    {
      id: 10,
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "ENG-97 dispatched to claude_code runtime — approval gate active (attempt 1)"
    },
    {
      id: 11,
      timestamp: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
      kind: "run_started",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "Planning run started for ENG-97",
      metadata: { workspacePath: "/tmp/northstar_workspaces/ENG-97", gate: "approval" }
    },
    {
      id: 12,
      timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      kind: "plan_created",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "Plan created for ENG-97 and posted to tracker for review"
    },
    {
      id: 13,
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      kind: "feedback_triggered",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "Feedback received for ENG-97: 'Add per-endpoint override docs to the plan'",
      metadata: { message: "Add per-endpoint override docs to the plan", author: "seshxn" }
    },
    {
      id: 14,
      timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
      kind: "plan_created",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "Revised plan created for ENG-97 and posted to tracker for review (attempt 2)"
    },
    {
      id: 15,
      timestamp: new Date(Date.now() - 14 * 60 * 1000 + 30000).toISOString(),
      kind: "approval_triggered",
      issueId: "issue-4",
      issueIdentifier: "ENG-97",
      message: "Plan approved for ENG-97 — implementation run queued",
      metadata: { author: "seshxn" }
    },
    {
      id: 16,
      timestamp: new Date(Date.now() - 13 * 60 * 1000).toISOString(),
      kind: "issue_dispatched",
      issueId: "issue-3",
      issueIdentifier: "ENG-99",
      message: "ENG-99 dispatched to claude_code runtime (attempt 1)"
    },
    {
      id: 17,
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      kind: "run_started",
      issueId: "issue-3",
      issueIdentifier: "ENG-99",
      message: "Run started for ENG-99",
      metadata: { workspacePath: "/tmp/northstar_workspaces/ENG-99" }
    },
    {
      id: 18,
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      kind: "dependency_detected",
      issueId: "issue-2",
      issueIdentifier: "ENG-102",
      message: "Dependency detected: ENG-102 is blocked by ENG-101",
      metadata: { blockedBy: ["ENG-101"] }
    }
  ]
};

const SETTINGS = {
  runtime: {
    kind: "claude_code",
    executionModel: "claude-sonnet-4-6",
    planningModel: "claude-opus-4-7"
  },
  tracker: {
    kind: "jira",
    jql: "project = ENG AND status in ('To Do', 'In Progress') ORDER BY priority ASC",
    project_key: "ENG",
    active_states: ["To Do", "In Progress"]
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
  const card = BOARD.columns[0].cards.find((c) => c.issueId === "issue-2");
  if (card) card.detectedDependencies = ["ENG-101"];
  return reply.code(202).send({ ok: true });
});

app.post<{ Body: { runtime?: Record<string, string>; tracker?: Record<string, string> } }>("/api/v1/settings", async (request, reply) => {
  const { runtime, tracker } = request.body ?? {};
  if (runtime?.executionModel) SETTINGS.runtime.executionModel = runtime.executionModel;
  if (runtime?.planningModel) SETTINGS.runtime.planningModel = runtime.planningModel;
  if (tracker?.jql) SETTINGS.tracker.jql = tracker.jql;
  console.log("[mock] Settings updated:", request.body);
  return reply.code(200).send({ ok: true });
});

await app.listen({ host: "127.0.0.1", port: 4000 });
console.log("Mock Northstar API running on http://127.0.0.1:4000");
console.log("Now run:  npm run dev:web");

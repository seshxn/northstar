import { describe, expect, test } from "vitest";
import { boardColumnsForConfig, trackerStatesForBoard } from "../../src/board/columns.js";
import { buildBoardSnapshot } from "../../src/board/snapshot.js";
import { createInitialState } from "../../src/orchestrator/state.js";
import type { Issue } from "../../src/tracker/issue.js";
import { parseWorkflowConfig } from "../../src/workflow/schema.js";

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: overrides.id ?? "issue-1",
    identifier: overrides.identifier ?? "SYM-1",
    title: overrides.title ?? "Add board",
    description: overrides.description ?? null,
    priority: overrides.priority ?? 2,
    state: overrides.state ?? "Ready",
    branch_name: overrides.branch_name ?? null,
    url: overrides.url ?? "https://tracker.local/SYM-1",
    labels: overrides.labels ?? ["frontend"],
    blocked_by: overrides.blocked_by ?? [],
    created_at: overrides.created_at ?? null,
    updated_at: overrides.updated_at ?? null
  };
}

describe("board columns", () => {
  test("normalizes configured columns and manual move defaults", () => {
    const config = parseWorkflowConfig({
      board: {
        columns: [
          { id: "ready", title: "Ready", tracker_states: ["Ready"], starts_agent: true },
          { id: "planning", title: "Planning", runtime_states: ["planning"] },
          {
            id: "review",
            title: "Review",
            tracker_states: ["Human Review"],
            runtime_states: ["awaiting_review"],
            accepts_manual_moves: false
          }
        ]
      }
    });

    expect(boardColumnsForConfig(config)).toEqual([
      {
        id: "ready",
        title: "Ready",
        trackerStates: ["Ready"],
        normalizedTrackerStates: ["ready"],
        runtimeStates: [],
        startsAgent: true,
        acceptsManualMoves: true
      },
      {
        id: "planning",
        title: "Planning",
        trackerStates: [],
        normalizedTrackerStates: [],
        runtimeStates: ["planning"],
        startsAgent: false,
        acceptsManualMoves: false
      },
      {
        id: "review",
        title: "Review",
        trackerStates: ["Human Review"],
        normalizedTrackerStates: ["human review"],
        runtimeStates: ["awaiting_review"],
        startsAgent: false,
        acceptsManualMoves: false
      }
    ]);
  });

  test("derives useful default columns from workflow states", () => {
    const config = parseWorkflowConfig({
      tracker: {
        kind: "jira",
        endpoint: "https://acme.atlassian.net",
        email: "dev@example.com",
        api_token: "jira-token",
        project_key: "SYM",
        active_states: ["Ready for Agent"]
      },
      approval_gates: {
        enabled: true,
        awaiting_state: "Human Review"
      },
      feedback: {
        transitions: {
          completed_state: "PR Open",
          failed_state: "Blocked"
        }
      }
    });

    const columns = boardColumnsForConfig(config);

    expect(columns.map((column) => column.id)).toEqual([
      "ready-for-agent",
      "planning",
      "human-review",
      "implementing",
      "retrying",
      "pr-open",
      "blocked"
    ]);
    expect(trackerStatesForBoard(columns)).toEqual(["Ready for Agent", "Human Review", "PR Open", "Blocked"]);
  });

  test("dedupes tracker states by normalized value in column order", () => {
    const config = parseWorkflowConfig({
      board: {
        columns: [
          { id: "ready", title: "Ready", tracker_states: ["Ready"] },
          { id: "ready-duplicate", title: "Ready Duplicate", tracker_states: ["ready"] },
          { id: "review", title: "Review", tracker_states: ["Review"] }
        ]
      }
    });

    expect(trackerStatesForBoard(boardColumnsForConfig(config))).toEqual(["Ready", "Review"]);
  });
});

describe("board snapshot", () => {
  test("places idle tracker issues into tracker-backed columns", () => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Ready"], terminalStates: ["Done"] });
    const columns = boardColumnsForConfig(
      parseWorkflowConfig({
        board: {
          columns: [
            { id: "ready", title: "Ready", tracker_states: ["Ready"] },
            { id: "review", title: "Review", runtime_states: ["awaiting_review"] }
          ]
        }
      })
    );

    const snapshot = buildBoardSnapshot({
      columns,
      issues: [issue()],
      state,
      now: new Date("2026-05-05T10:00:00.000Z")
    });

    expect(snapshot.updatedAt).toBe("2026-05-05T10:00:00.000Z");
    expect(snapshot.columns[0].cards).toMatchObject([
      {
        issueId: "issue-1",
        identifier: "SYM-1",
        runtimeStatus: "idle",
        state: "Ready"
      }
    ]);
    expect(snapshot.columns[1].cards).toEqual([]);
  });

  test("runtime state takes precedence over tracker state", () => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Ready"], terminalStates: ["Done"] });
    state.awaitingReview.set("issue-1", {
      issueId: "issue-1",
      issue: "SYM-1",
      title: "Add board",
      workspacePath: "/tmp/ws",
      planOutput: "Plan body",
      planCommentId: "comment-1",
      lastProcessedCommentId: "comment-1",
      createdAt: new Date("2026-05-05T09:00:00.000Z"),
      updatedAt: new Date("2026-05-05T09:30:00.000Z"),
      attempt: 1
    });
    const columns = boardColumnsForConfig(
      parseWorkflowConfig({
        board: {
          columns: [
            { id: "ready", title: "Ready", tracker_states: ["Ready"] },
            { id: "review", title: "Review", runtime_states: ["awaiting_review"] }
          ]
        }
      })
    );

    const snapshot = buildBoardSnapshot({
      columns,
      issues: [issue()],
      state,
      now: new Date("2026-05-05T10:00:00.000Z")
    });

    expect(snapshot.columns[0].cards).toEqual([]);
    expect(snapshot.columns[1].cards).toMatchObject([
      {
        issueId: "issue-1",
        identifier: "SYM-1",
        runtimeStatus: "awaiting_review",
        workspacePath: "/tmp/ws",
        lastActivityAt: "2026-05-05T09:30:00.000Z"
      }
    ]);
  });

  test("includes running, retrying, completed, and failed metrics", () => {
    const state = createInitialState({ maxConcurrentAgents: 2, activeStates: ["Ready"], terminalStates: ["Done"] });
    state.running.set("issue-1", {
      issue: issue(),
      threadId: "thread-1",
      mode: "planning",
      startedAt: new Date("2026-05-05T09:00:00.000Z"),
      lastActivityAt: new Date("2026-05-05T09:01:00.000Z"),
      stop: async () => undefined,
      workspacePath: "/tmp/ws1",
      events: [{ type: "runtime_message", timestamp: "2026-05-05T09:01:00.000Z", message: "writing plan" }]
    });
    state.retryAttempts.set("issue-2", {
      issueId: "issue-2",
      attempt: 2,
      dueAt: new Date("2026-05-05T09:10:00.000Z"),
      metadata: { issue: "SYM-2" }
    });
    state.results.set("issue-3", {
      issueId: "issue-3",
      issue: "SYM-3",
      threadId: "thread-3",
      workspacePath: "/tmp/ws3",
      status: "completed",
      output: "done",
      events: [],
      startedAt: new Date("2026-05-05T08:00:00.000Z"),
      completedAt: new Date("2026-05-05T08:30:00.000Z"),
      attempt: 1,
      gateResults: []
    });
    state.results.set("issue-4", {
      issueId: "issue-4",
      issue: "SYM-4",
      threadId: "thread-4",
      workspacePath: "/tmp/ws4",
      status: "failed",
      output: "failed",
      events: [],
      startedAt: new Date("2026-05-05T08:00:00.000Z"),
      completedAt: new Date("2026-05-05T08:30:00.000Z"),
      attempt: 1,
      gateResults: []
    });
    const columns = boardColumnsForConfig(
      parseWorkflowConfig({
        board: {
          columns: [
            { id: "planning", title: "Planning", runtime_states: ["planning"] },
            { id: "retrying", title: "Retrying", runtime_states: ["retrying"] },
            { id: "done", title: "Done", runtime_states: ["completed"] },
            { id: "failed", title: "Failed", runtime_states: ["failed"] }
          ]
        }
      })
    );

    const snapshot = buildBoardSnapshot({
      columns,
      issues: [
        issue(),
        issue({ id: "issue-2", identifier: "SYM-2", title: "Retry me" }),
        issue({ id: "issue-3", identifier: "SYM-3", title: "Done", state: "Done" }),
        issue({ id: "issue-4", identifier: "SYM-4", title: "Failed", state: "Ready" })
      ],
      state,
      now: new Date("2026-05-05T10:00:00.000Z")
    });

    expect(snapshot.metrics).toEqual({
      running: 1,
      awaitingReview: 0,
      retrying: 1,
      failed: 1,
      completed: 1,
      pullRequestsOpen: 0
    });
    expect(snapshot.columns.map((column) => column.cards.map((card) => card.runtimeStatus))).toEqual([
      ["planning"],
      ["retrying"],
      ["completed"],
      ["failed"]
    ]);
  });

  test.each([
    { mode: "planning" as const, expectedRuntimeStatus: "planning" },
    { mode: "execution" as const, expectedRuntimeStatus: "execution" },
    { mode: undefined, expectedRuntimeStatus: "implementation" }
  ])("keeps running $expectedRuntimeStatus card out of retrying column when retry is also queued", ({ mode, expectedRuntimeStatus }) => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Ready"], terminalStates: ["Done"] });
    state.running.set("issue-1", {
      issue: issue(),
      threadId: "thread-1",
      mode,
      startedAt: new Date("2026-05-05T09:00:00.000Z"),
      lastActivityAt: new Date("2026-05-05T09:01:00.000Z"),
      stop: async () => undefined,
      workspacePath: "/tmp/ws1",
      events: []
    });
    state.retryAttempts.set("issue-1", {
      issueId: "issue-1",
      attempt: 2,
      dueAt: new Date("2026-05-05T09:10:00.000Z"),
      metadata: { issue: "SYM-1" }
    });
    const columns = boardColumnsForConfig(
      parseWorkflowConfig({
        board: {
          columns: [
            { id: "planning", title: "Planning", runtime_states: ["planning"] },
            { id: "implementation", title: "Implementation", runtime_states: ["implementation"] },
            { id: "execution", title: "Execution", runtime_states: ["execution"] },
            { id: "retrying", title: "Retrying", runtime_states: ["retrying"] }
          ]
        }
      })
    );

    const snapshot = buildBoardSnapshot({
      columns,
      issues: [issue()],
      state,
      now: new Date("2026-05-05T10:00:00.000Z")
    });

    expect(snapshot.columns.map((column) => column.cards.map((card) => card.runtimeStatus))).toEqual([
      expectedRuntimeStatus === "planning" ? ["planning"] : [],
      expectedRuntimeStatus === "implementation" ? ["implementation"] : [],
      expectedRuntimeStatus === "execution" ? ["execution"] : [],
      []
    ]);
  });

  test("keeps awaiting review card out of retrying column when retry is also queued", () => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Ready"], terminalStates: ["Done"] });
    state.awaitingReview.set("issue-1", {
      issueId: "issue-1",
      issue: "SYM-1",
      title: "Add board",
      workspacePath: "/tmp/ws",
      planOutput: "Plan body",
      planCommentId: "comment-1",
      lastProcessedCommentId: "comment-1",
      createdAt: new Date("2026-05-05T09:00:00.000Z"),
      updatedAt: new Date("2026-05-05T09:30:00.000Z"),
      attempt: 1
    });
    state.retryAttempts.set("issue-1", {
      issueId: "issue-1",
      attempt: 2,
      dueAt: new Date("2026-05-05T09:10:00.000Z"),
      metadata: { issue: "SYM-1" }
    });
    const columns = boardColumnsForConfig(
      parseWorkflowConfig({
        board: {
          columns: [
            { id: "review", title: "Review", runtime_states: ["awaiting_review"] },
            { id: "retrying", title: "Retrying", runtime_states: ["retrying"] }
          ]
        }
      })
    );

    const snapshot = buildBoardSnapshot({
      columns,
      issues: [issue()],
      state,
      now: new Date("2026-05-05T10:00:00.000Z")
    });

    expect(snapshot.columns.map((column) => column.cards.map((card) => card.runtimeStatus))).toEqual([["awaiting_review"], []]);
  });

  test.each(["timeout", "cancelled"] as const)("%s result appears as failed when no retry is queued", (status) => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Ready"], terminalStates: ["Done"] });
    state.results.set("issue-1", {
      issueId: "issue-1",
      issue: "SYM-1",
      threadId: "thread-1",
      workspacePath: "/tmp/ws1",
      status,
      output: status,
      events: [],
      startedAt: new Date("2026-05-05T08:00:00.000Z"),
      completedAt: new Date("2026-05-05T08:30:00.000Z"),
      attempt: 1,
      gateResults: []
    });
    const columns = boardColumnsForConfig(
      parseWorkflowConfig({
        board: {
          columns: [
            { id: "ready", title: "Ready", tracker_states: ["Ready"] },
            { id: "failed", title: "Failed", runtime_states: ["failed"] }
          ]
        }
      })
    );

    const snapshot = buildBoardSnapshot({
      columns,
      issues: [issue()],
      state,
      now: new Date("2026-05-05T10:00:00.000Z")
    });

    expect(snapshot.metrics.failed).toBe(1);
    expect(snapshot.columns[0].cards).toEqual([]);
    expect(snapshot.columns[1].cards).toMatchObject([{ issueId: "issue-1", runtimeStatus: "failed" }]);
  });

  test("clones issue labels for snapshot cards", () => {
    const sourceIssue = issue({ labels: ["frontend"] });
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Ready"], terminalStates: ["Done"] });
    const columns = boardColumnsForConfig(
      parseWorkflowConfig({
        board: {
          columns: [{ id: "ready", title: "Ready", tracker_states: ["Ready"] }]
        }
      })
    );

    const snapshot = buildBoardSnapshot({
      columns,
      issues: [sourceIssue],
      state,
      now: new Date("2026-05-05T10:00:00.000Z")
    });
    sourceIssue.labels.push("mutated");

    expect(snapshot.columns[0].cards[0].labels).toEqual(["frontend"]);
    expect(snapshot.columns[0].cards[0].labels).not.toBe(sourceIssue.labels);
  });
});

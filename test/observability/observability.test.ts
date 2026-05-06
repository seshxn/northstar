import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createInitialState } from "../../src/orchestrator/state.js";
import { snapshotState } from "../../src/observability/snapshot.js";
import { createHttpServer } from "../../src/observability/http.js";

describe("SPEC 17.6 observability", () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
  });

  test("snapshot exposes running, retry, claimed, and token totals without secrets", () => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Todo"], terminalStates: ["Done"] });
    state.claimed.add("secret-issue");
    state.tokenTotals = { input: 1, output: 2, total: 3 };
    state.results.set("issue-1", {
      issueId: "issue-1",
      issue: "SYM-1",
      threadId: "thread-1",
      workspacePath: "/tmp/ws",
      status: "completed",
      output: "ok",
      events: [{ type: "runtime_message", timestamp: "2026-01-01T00:00:00.000Z" }],
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      completedAt: new Date("2026-01-01T00:01:00.000Z"),
      attempt: 1,
      gateResults: []
    });
    state.awaitingReview.set("issue-2", {
      issueId: "issue-2",
      issue: "SYM-2",
      title: "Review me",
      workspacePath: "/tmp/ws2",
      planOutput: "plan body",
      planCommentId: "comment-1",
      lastProcessedCommentId: "comment-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:02:00.000Z"),
      attempt: 1
    });

    const snapshot = snapshotState(state);

    expect(snapshot.claimed).toEqual(["secret-issue"]);
    expect(snapshot.awaitingReview[0]).toMatchObject({ issue: "SYM-2", title: "Review me", planOutput: "plan body" });
    expect(snapshot.results[0]).toMatchObject({ issue: "SYM-1", status: "completed", eventCount: 1 });
    expect(JSON.stringify(snapshot)).not.toContain("token-secret");
  });

  test("HTTP server exposes state, issue detail, and refresh endpoint", async () => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Todo"], terminalStates: ["Done"] });
    state.completed.add("SYM-1");
    let refreshes = 0;
    const stopped: string[] = [];
    const retried: string[] = [];
    const approvals: string[] = [];
    const feedback: Array<{ identifier: string; message: string }> = [];
    const rejections: Array<{ identifier: string; message?: string }> = [];
    const moves: Array<{ identifier: string; state: string }> = [];
    const pullRequests: Array<{ identifier: string; head: string }> = [];
    const app = createHttpServer({
      getState: () => state,
      getBoardSnapshot: async () => ({
        columns: [
          {
            id: "ready",
            title: "Ready",
            startsAgent: true,
            acceptsManualMoves: true,
            moveState: "Todo",
            cards: []
          }
        ],
        metrics: {
          running: 0,
          awaitingReview: 0,
          retrying: 0,
          failed: 0,
          completed: 1,
          pullRequestsOpen: 0
        },
        updatedAt: "2026-05-05T10:00:00.000Z"
      }),
      getSettings: () => ({
        runtime: {
          kind: "claude_code",
          executionModel: "claude-sonnet-exec",
          planningModel: "claude-opus-plan"
        },
        tracker: {
          kind: "linear",
          jql: null,
          project_key: null,
          active_states: ["Todo", "In Progress"]
        }
      }),
      refresh: async () => {
        refreshes += 1;
      },
      stopIssue: async (identifier) => {
        stopped.push(identifier);
        return true;
      },
      retryIssue: async (identifier) => {
        retried.push(identifier);
        return true;
      },
      approveIssue: async (identifier) => {
        approvals.push(identifier);
        return true;
      },
      feedbackIssue: async (identifier, message) => {
        feedback.push({ identifier, message });
        return true;
      },
      rejectIssue: async (identifier, message) => {
        rejections.push({ identifier, message });
        return true;
      },
      moveIssue: async (identifier, stateName) => {
        moves.push({ identifier, state: stateName });
        return true;
      },
      createPullRequest: async (identifier, input) => {
        pullRequests.push({ identifier, head: input.head });
        return { url: "https://github.com/owner/repo/pull/1", number: 1, state: "open" };
      }
    });

    const root = await app.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain("Northstar");
    expect((await app.inject({ method: "GET", url: "/api/v1/state" })).statusCode).toBe(200);
    const board = await app.inject({ method: "GET", url: "/api/v1/board" });
    expect(board.statusCode).toBe(200);
    expect(board.json()).toMatchObject({
      columns: [{ id: "ready", title: "Ready" }],
      metrics: { completed: 1 }
    });
    const settings = await app.inject({ method: "GET", url: "/api/v1/settings" });
    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toEqual({
      runtime: {
        kind: "claude_code",
        executionModel: "claude-sonnet-exec",
        planningModel: "claude-opus-plan"
      },
      tracker: {
        kind: "linear",
        jql: null,
        project_key: null,
        active_states: ["Todo", "In Progress"]
      }
    });
    expect((await app.inject({ method: "GET", url: "/api/v1/SYM-1" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/refresh" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/SYM-1/stop" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/SYM-1/retry" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/SYM-1/approve" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/issues/SYM-1/plan/approve" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/SYM-1/feedback", payload: { message: "add rollback" } })).statusCode).toBe(
      202
    );
    expect(
      (await app.inject({ method: "POST", url: "/api/v1/issues/SYM-1/plan/feedback", payload: { message: "tighten scope" } })).statusCode
    ).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/issues/SYM-1/reject", payload: { message: "not safe" } })).statusCode).toBe(
      202
    );
    expect((await app.inject({ method: "POST", url: "/api/v1/issues/SYM-1/move", payload: { state: "In Progress" } })).statusCode).toBe(
      202
    );
    expect((await app.inject({ method: "POST", url: "/api/v1/issues/SYM-1/move", payload: {} })).statusCode).toBe(400);
    const pr = await app.inject({ method: "POST", url: "/api/v1/issues/SYM-1/pr/create", payload: { head: "feature/sym-1" } });
    expect(pr.statusCode).toBe(202);
    expect(pr.json()).toMatchObject({ pr: { number: 1, state: "open" } });
    expect((await app.inject({ method: "POST", url: "/api/v1/issues/SYM-1/pr/create", payload: {} })).statusCode).toBe(400);
    expect(refreshes).toBe(9);
    expect(stopped).toEqual(["SYM-1"]);
    expect(retried).toEqual(["SYM-1"]);
    expect(approvals).toEqual(["SYM-1", "SYM-1"]);
    expect(feedback).toEqual([
      { identifier: "SYM-1", message: "add rollback" },
      { identifier: "SYM-1", message: "tighten scope" }
    ]);
    expect(rejections).toEqual([{ identifier: "SYM-1", message: "not safe" }]);
    expect(moves).toEqual([{ identifier: "SYM-1", state: "In Progress" }]);
    expect(pullRequests).toEqual([{ identifier: "SYM-1", head: "feature/sym-1" }]);
    await app.close();
  });

  test("HTTP root reports missing React dashboard build instead of serving legacy HTML", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "northstar-observability-"));
    process.chdir(tempDir);
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Todo"], terminalStates: ["Done"] });
    const app = createHttpServer({
      getState: () => state,
      refresh: async () => {}
    });

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Northstar dashboard build missing");
    expect(response.body).toContain("npm run build:web");
    expect(response.body).not.toContain("Northstar dashboard</h1>");
    await app.close();
  });
});

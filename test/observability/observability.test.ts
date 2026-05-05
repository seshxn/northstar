import { describe, expect, test } from "vitest";
import { createInitialState } from "../../src/orchestrator/state.js";
import { snapshotState } from "../../src/observability/snapshot.js";
import { createHttpServer } from "../../src/observability/http.js";

describe("SPEC 17.6 observability", () => {
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
    const app = createHttpServer({
      getState: () => state,
      refresh: async () => { refreshes += 1; },
      stopIssue: async (identifier) => { stopped.push(identifier); return true; },
      retryIssue: async (identifier) => { retried.push(identifier); return true; },
      approveIssue: async (identifier) => { approvals.push(identifier); return true; },
      feedbackIssue: async (identifier, message) => { feedback.push({ identifier, message }); return true; }
    });

    const root = await app.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain("Northstar dashboard");
    expect(root.body).toContain("/api/v1/state");
    expect((await app.inject({ method: "GET", url: "/api/v1/state" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/SYM-1" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/refresh" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/SYM-1/stop" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/SYM-1/retry" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/SYM-1/approve" })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/v1/SYM-1/feedback", payload: { message: "add rollback" } })).statusCode).toBe(202);
    expect(refreshes).toBe(4);
    expect(stopped).toEqual(["SYM-1"]);
    expect(retried).toEqual(["SYM-1"]);
    expect(approvals).toEqual(["SYM-1"]);
    expect(feedback).toEqual([{ identifier: "SYM-1", message: "add rollback" }]);
    await app.close();
  });
});

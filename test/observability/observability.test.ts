import { describe, expect, test } from "vitest";
import { createInitialState } from "../../src/orchestrator/state.js";
import { snapshotState } from "../../src/observability/snapshot.js";
import { createHttpServer } from "../../src/observability/http.js";

describe("SPEC 17.6 observability", () => {
  test("snapshot exposes running, retry, claimed, and token totals without secrets", () => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Todo"], terminalStates: ["Done"] });
    state.claimed.add("secret-issue");
    state.tokenTotals = { input: 1, output: 2, total: 3 };

    const snapshot = snapshotState(state);

    expect(snapshot.claimed).toEqual(["secret-issue"]);
    expect(JSON.stringify(snapshot)).not.toContain("token-secret");
  });

  test("HTTP server exposes state, issue detail, and refresh endpoint", async () => {
    const state = createInitialState({ maxConcurrentAgents: 1, activeStates: ["Todo"], terminalStates: ["Done"] });
    state.completed.add("SYM-1");
    let refreshes = 0;
    const app = createHttpServer({ getState: () => state, refresh: async () => { refreshes += 1; } });

    expect((await app.inject({ method: "GET", url: "/api/v1/state" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/SYM-1" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/refresh" })).statusCode).toBe(202);
    expect(refreshes).toBe(1);
    await app.close();
  });
});

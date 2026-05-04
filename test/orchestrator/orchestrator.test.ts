import { describe, expect, test, vi } from "vitest";
import { createInitialState } from "../../src/orchestrator/state.js";
import { dispatchCandidates } from "../../src/orchestrator/tick.js";
import { retryDelayMs } from "../../src/orchestrator/retry.js";
import { reconcileRunningIssues } from "../../src/orchestrator/reconcile.js";
import type { Issue } from "../../src/tracker/issue.js";

const issue = (overrides: Partial<Issue>): Issue => ({
  id: overrides.id ?? "id",
  identifier: overrides.identifier ?? "SYM-1",
  title: overrides.title ?? "Issue",
  description: null,
  priority: overrides.priority ?? null,
  state: overrides.state ?? "Todo",
  branch_name: null,
  url: null,
  labels: overrides.labels ?? [],
  blocked_by: overrides.blocked_by ?? [],
  created_at: overrides.created_at ?? null,
  updated_at: null
});

describe("SPEC 17.4 orchestrator dispatch, retry, and reconcile", () => {
  test("dispatches eligible issues by priority then creation time and respects concurrency", async () => {
    const state = createInitialState({ maxConcurrentAgents: 2, activeStates: ["Todo"], terminalStates: ["Done"] });
    const dispatched: string[] = [];

    await dispatchCandidates({
      state,
      issues: [
        issue({ id: "b", identifier: "SYM-2", priority: 3, created_at: "2026-02-01T00:00:00.000Z" }),
        issue({ id: "a", identifier: "SYM-1", priority: 1, created_at: "2026-03-01T00:00:00.000Z" }),
        issue({ id: "c", identifier: "SYM-3", priority: 1, created_at: "2026-01-01T00:00:00.000Z" })
      ],
      startRun: async (candidate) => {
        dispatched.push(candidate.identifier);
        return { threadId: `thread-${candidate.id}`, stop: vi.fn(async () => undefined) };
      }
    });

    expect(dispatched).toEqual(["SYM-3", "SYM-1"]);
    expect(state.claimed.has("a")).toBe(true);
    expect(state.claimed.has("c")).toBe(true);
  });

  test("does not dispatch Todo issues blocked by non-terminal blockers", async () => {
    const state = createInitialState({ maxConcurrentAgents: 5, activeStates: ["Todo"], terminalStates: ["Done"] });
    const dispatched: string[] = [];

    await dispatchCandidates({
      state,
      issues: [
        issue({
          id: "blocked",
          blocked_by: [{ id: "dep", identifier: "SYM-0", state: "In Progress" }]
        })
      ],
      startRun: async (candidate) => {
        dispatched.push(candidate.id);
        return { threadId: "thread", stop: vi.fn(async () => undefined) };
      }
    });

    expect(dispatched).toEqual([]);
  });

  test("uses capped exponential retry backoff", () => {
    expect(retryDelayMs(1, 300_000)).toBe(10_000);
    expect(retryDelayMs(2, 300_000)).toBe(20_000);
    expect(retryDelayMs(10, 300_000)).toBe(300_000);
  });

  test("stops and releases running issues that become terminal or disappear", async () => {
    const stop = vi.fn(async () => undefined);
    const state = createInitialState({ maxConcurrentAgents: 2, activeStates: ["Todo"], terminalStates: ["Done"] });
    state.running.set("a", { issue: issue({ id: "a" }), threadId: "t-a", startedAt: new Date(), lastActivityAt: new Date(), stop });
    state.claimed.add("a");
    state.running.set("b", { issue: issue({ id: "b" }), threadId: "t-b", startedAt: new Date(), lastActivityAt: new Date(), stop });
    state.claimed.add("b");

    await reconcileRunningIssues(state, [issue({ id: "a", state: "Done" })]);

    expect(stop).toHaveBeenCalledTimes(2);
    expect(state.running.size).toBe(0);
    expect(state.claimed.size).toBe(0);
  });
});

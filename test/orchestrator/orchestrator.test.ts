import { describe, expect, test, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import { createInitialState } from "../../src/orchestrator/state.js";
import { dispatchCandidates, shouldDispatchIssue } from "../../src/orchestrator/tick.js";
import { retryDelayMs } from "../../src/orchestrator/retry.js";
import { reconcileRunningIssues } from "../../src/orchestrator/reconcile.js";
import { parseWorkflowConfig } from "../../src/workflow/schema.js";
import type { Issue } from "../../src/tracker/issue.js";
import type { Runtime, RunTurnOpts } from "../../src/runtime/types.js";
import type { StartSessionOpts } from "../../src/runtime/types.js";
import type { Tracker } from "../../src/tracker/types.js";

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

  test("uses explicit dispatch states instead of all tracker active states", () => {
    const state = createInitialState({
      maxConcurrentAgents: 1,
      activeStates: ["To Do", "In Progress"],
      terminalStates: ["Done"],
      dispatchStates: ["In Progress"]
    });

    expect(shouldDispatchIssue(issue({ state: "To Do" }), state)).toBe(false);
    expect(shouldDispatchIssue(issue({ state: "In Progress" }), state)).toBe(true);
  });

  test("applies dispatch ready labels, blocked labels, and blocker checks", () => {
    const state = createInitialState({
      maxConcurrentAgents: 5,
      activeStates: ["Ready"],
      terminalStates: ["Done"],
      dispatchStates: ["Ready"],
      requireReadyLabel: true,
      requireUnblocked: true,
      readyLabels: ["ready-for-agent"],
      blockedLabels: ["blocked"]
    });

    expect(shouldDispatchIssue(issue({ state: "Ready", labels: ["ready-for-agent"] }), state)).toBe(true);
    expect(shouldDispatchIssue(issue({ state: "Ready", labels: [] }), state)).toBe(false);
    expect(shouldDispatchIssue(issue({ state: "Ready", labels: ["ready-for-agent", "blocked"] }), state)).toBe(false);
    expect(
      shouldDispatchIssue(
        issue({
          state: "Ready",
          labels: ["ready-for-agent"],
          blocked_by: [{ id: "dep", identifier: "SYM-0", state: "In Progress" }]
        }),
        state
      )
    ).toBe(false);
  });

  test("blocks dispatch when detected dependencies are enforced", () => {
    const state = createInitialState({
      maxConcurrentAgents: 1,
      activeStates: ["Ready"],
      terminalStates: ["Done"],
      dispatchStates: ["Ready"],
      blockDetectedDependencies: true
    });
    state.detectedDependencies.set("id", ["SYM-0"]);

    expect(shouldDispatchIssue(issue({ id: "id", state: "Ready" }), state)).toBe(false);
  });

  test("uses capped exponential retry backoff", () => {
    expect(retryDelayMs(1, 300_000)).toBe(10_000);
    expect(retryDelayMs(2, 300_000)).toBe(20_000);
    expect(retryDelayMs(10, 300_000)).toBe(300_000);
  });

  test("stops and releases running issues that become terminal or disappear", async () => {
    const stop = vi.fn(async () => undefined);
    const state = createInitialState({ maxConcurrentAgents: 2, activeStates: ["Todo"], terminalStates: ["Done"] });
    state.running.set("a", {
      issue: issue({ id: "a" }),
      threadId: "t-a",
      startedAt: new Date(),
      lastActivityAt: new Date(),
      stop,
      events: []
    });
    state.claimed.add("a");
    state.running.set("b", {
      issue: issue({ id: "b" }),
      threadId: "t-b",
      startedAt: new Date(),
      lastActivityAt: new Date(),
      stop,
      events: []
    });
    state.claimed.add("b");

    await reconcileRunningIssues(state, [issue({ id: "a", state: "Done" })]);

    expect(stop).toHaveBeenCalledTimes(2);
    expect(state.running.size).toBe(0);
    expect(state.claimed.size).toBe(0);
  });

  test("runs an issue end to end with workspace hooks, rendered prompt, tools, and result state", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-e2e-"));
    const candidate = issue({
      id: "issue-1",
      identifier: "SYM-1",
      title: "Ship orchestration",
      labels: ["backend"],
      priority: 1
    });
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate]),
      createComment: vi.fn(async () => undefined)
    };
    let receivedRunOpts: RunTurnOpts | null = null;
    let receivedWorkspace = "";
    let receivedStartToolNames: string[] = [];
    const runTurn = vi.fn(async (opts: RunTurnOpts) => {
      receivedRunOpts = opts;
      opts.onEvent({ type: "test_event", timestamp: new Date().toISOString(), message: "agent is working" });
      return { status: "completed" as const, output: "completed output", tokens: { input: 7, output: 11, total: 18 } };
    });
    const stop = vi.fn(async () => undefined);
    const runtime: Runtime = {
      kind: "test",
      startSession: vi.fn(async (opts: StartSessionOpts) => {
        receivedWorkspace = opts.workspacePath;
        receivedStartToolNames = opts.tools.map((tool) => tool.name);
        return { threadId: "thread-1", runTurn, stop };
      })
    };
    const config = parseWorkflowConfig({
      tracker: { kind: "linear", api_key: "linear-token", active_states: ["Todo"], terminal_states: ["Done"] },
      runtime: { kind: "codex_app_server" },
      workspace: { root },
      hooks: {
        after_create: 'printf "$NORTHSTAR_ISSUE_IDENTIFIER" > created.txt',
        before_run: "printf before > before.txt",
        after_run: "printf after > after.txt"
      },
      integrations: {
        github: { enabled: true, token: "github-token", default_repo: "openai/northstar" }
      }
    } as never);
    const orchestrator = new Orchestrator(
      config,
      tracker,
      runtime,
      "Implement {{ issue.identifier }}: {{ issue.title }} / {{ issue.labels[0] }}"
    );

    await orchestrator.tick();
    await orchestrator.waitForIdle();

    expect(runtime.startSession).toHaveBeenCalledTimes(1);
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(receivedWorkspace).toBe(join(root, "SYM-1"));
    expect(receivedStartToolNames.sort()).toEqual(["github", "linear_graphql"]);
    const capturedRunOpts = receivedRunOpts as unknown as RunTurnOpts;
    expect(capturedRunOpts.prompt).toContain("Implement SYM-1: Ship orchestration / backend");
    expect(capturedRunOpts.tools.map((tool) => tool.name).sort()).toEqual(["github", "linear_graphql"]);
    expect(await readFile(join(root, "SYM-1", "created.txt"), "utf8")).toBe("SYM-1");
    expect(await readFile(join(root, "SYM-1", "before.txt"), "utf8")).toBe("before");
    expect(await readFile(join(root, "SYM-1", "after.txt"), "utf8")).toBe("after");
    expect(orchestrator.state.running.size).toBe(0);
    expect(orchestrator.state.completed.has("SYM-1")).toBe(true);
    expect(orchestrator.state.tokenTotals).toEqual({ input: 7, output: 11, total: 18 });
    expect(orchestrator.state.results.get("issue-1")).toMatchObject({
      issueId: "issue-1",
      issue: "SYM-1",
      status: "completed",
      output: "completed output",
      threadId: "thread-1",
      workspacePath: join(root, "SYM-1")
    });
    expect(orchestrator.state.results.get("issue-1")?.events.map((event) => event.type)).toContain("test_event");
    expect(tracker.createComment).toHaveBeenCalledWith("issue-1", expect.stringContaining("Northstar started"));
    expect(tracker.createComment).toHaveBeenCalledWith("issue-1", expect.stringContaining("Northstar completed"));
    // Exactly two comments: one on first start, one on completion.
    expect(tracker.createComment).toHaveBeenCalledTimes(2);
  });

  test("schedules failed runs for retry and only dispatches them when due", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-retry-"));
    const candidate = issue({ id: "issue-retry", identifier: "SYM-7", title: "Retry work" });
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate]),
      createComment: vi.fn(async () => undefined)
    };
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed" as const, output: "first failure" })
      .mockResolvedValueOnce({ status: "completed" as const, output: "second success", tokens: { input: 1, output: 2, total: 3 } });
    const runtime: Runtime = {
      kind: "test",
      startSession: vi.fn(async () => ({
        threadId: `thread-${runTurn.mock.calls.length + 1}`,
        runTurn,
        stop: vi.fn(async () => undefined)
      }))
    };
    const config = parseWorkflowConfig({
      tracker: { kind: "linear", api_key: "linear-token", active_states: ["Todo"], terminal_states: ["Done"] },
      runtime: { kind: "codex_app_server" },
      workspace: { root },
      agent: { max_retry_backoff_ms: 300_000 }
    } as never);
    const orchestrator = new Orchestrator(config, tracker, runtime, "Implement {{ issue.identifier }}");

    await orchestrator.tick();
    await orchestrator.waitForIdle();

    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(orchestrator.state.retryAttempts.get("issue-retry")).toMatchObject({ issueId: "issue-retry", attempt: 2 });

    await orchestrator.tick();
    await orchestrator.waitForIdle();

    expect(runTurn).toHaveBeenCalledTimes(1);
    const retry = orchestrator.state.retryAttempts.get("issue-retry");
    if (!retry) throw new Error("expected retry entry");
    retry.dueAt = new Date(Date.now() - 1);

    await orchestrator.tick();
    await orchestrator.waitForIdle();

    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(orchestrator.state.retryAttempts.has("issue-retry")).toBe(false);
    expect(orchestrator.state.completed.has("SYM-7")).toBe(true);
    // Only 2 comments: one on first start, one on eventual completion. No comments during retries.
    expect(tracker.createComment).toHaveBeenCalledTimes(2);
    expect(tracker.createComment).toHaveBeenCalledWith("issue-retry", expect.stringContaining("Northstar started"));
    expect(tracker.createComment).toHaveBeenCalledWith("issue-retry", expect.stringContaining("Northstar completed"));
  });

  test("applies tool policy and tracker state transitions during a run", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-policy-"));
    const candidate = issue({ id: "issue-policy", identifier: "SYM-8", title: "Policy work", labels: ["security"] });
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate]),
      updateIssueState: vi.fn(async () => undefined)
    };
    const runTurn = vi.fn(async () => ({ status: "completed" as const, output: "ok" }));
    let toolNames: string[] = [];
    const runtime: Runtime = {
      kind: "test",
      startSession: vi.fn(async (opts: StartSessionOpts) => {
        toolNames = opts.tools.map((tool) => tool.name);
        return { threadId: "thread-policy", runTurn, stop: vi.fn(async () => undefined) };
      })
    };
    const config = parseWorkflowConfig({
      tracker: { kind: "linear", api_key: "linear-token", active_states: ["Todo"], terminal_states: ["Done"] },
      runtime: { kind: "codex_app_server" },
      workspace: { root },
      integrations: {
        github: { enabled: true, token: "github-token" },
        slack: { enabled: true, token: "slack-token" }
      },
      policy: {
        allowed_tools_by_label: {
          security: ["linear_graphql"]
        }
      },
      feedback: {
        transitions: {
          started_state: "In Progress",
          completed_state: "Review"
        }
      }
    } as never);
    const orchestrator = new Orchestrator(config, tracker, runtime, "Implement {{ issue.identifier }}");

    await orchestrator.tick();
    await orchestrator.waitForIdle();

    expect(toolNames).toEqual(["linear_graphql"]);
    expect(tracker.updateIssueState).toHaveBeenCalledWith("issue-policy", "In Progress");
    expect(tracker.updateIssueState).toHaveBeenCalledWith("issue-policy", "Review");
  });

  test("runs configured sequential quality gates after implementation succeeds", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-gates-"));
    const candidate = issue({ id: "issue-gates", identifier: "SYM-9", title: "Gate work", labels: ["security"] });
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate])
    };
    const prompts: string[] = [];
    const runTurn = vi.fn(async (opts: RunTurnOpts) => {
      prompts.push(opts.prompt);
      return { status: "completed" as const, output: `ok-${prompts.length}` };
    });
    const runtime: Runtime = {
      kind: "test",
      startSession: vi.fn(async () => ({ threadId: "thread-gates", runTurn, stop: vi.fn(async () => undefined) }))
    };
    const config = parseWorkflowConfig({
      tracker: { kind: "linear", api_key: "linear-token", active_states: ["Todo"], terminal_states: ["Done"] },
      runtime: { kind: "codex_app_server" },
      workspace: { root },
      quality_gates: {
        enabled: true,
        default_sequence: ["test", "review"],
        label_sequences: {
          security: ["security_review"]
        }
      }
    } as never);
    const orchestrator = new Orchestrator(config, tracker, runtime, "Implement {{ issue.identifier }}");

    await orchestrator.tick();
    await orchestrator.waitForIdle();

    expect(runTurn).toHaveBeenCalledTimes(4);
    expect(prompts[1]).toContain("Quality gate: test");
    expect(prompts[2]).toContain("Quality gate: review");
    expect(prompts[3]).toContain("Quality gate: security_review");
    expect(orchestrator.state.results.get("issue-gates")?.gateResults).toEqual([
      { gate: "test", status: "completed", output: "ok-2" },
      { gate: "review", status: "completed", output: "ok-3" },
      { gate: "security_review", status: "completed", output: "ok-4" }
    ]);
  });

  test("stale stalled-run completion does not remove a restarted run", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-stale-"));
    const candidate = issue({ id: "issue-stale", identifier: "SYM-10", title: "Stale work" });
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate])
    };
    let resolveFirst: (value: { status: "failed"; output: string }) => void = () => undefined;
    let resolveSecond: (value: { status: "completed"; output: string }) => void = () => undefined;
    const first = new Promise<{ status: "failed"; output: string }>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<{ status: "completed"; output: string }>((resolve) => {
      resolveSecond = resolve;
    });
    const runTurn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    let session = 0;
    const runtime: Runtime = {
      kind: "test",
      startSession: vi.fn(async () => {
        session += 1;
        return { threadId: `thread-${session}`, runTurn, stop: vi.fn(async () => undefined) };
      })
    };
    const config = parseWorkflowConfig({
      tracker: { kind: "linear", api_key: "linear-token", active_states: ["Todo"], terminal_states: ["Done"] },
      runtime: { kind: "codex_app_server", stall_timeout_ms: 1 },
      workspace: { root }
    } as never);
    const orchestrator = new Orchestrator(config, tracker, runtime, "Implement {{ issue.identifier }}");

    await orchestrator.tick();
    const firstRunning = orchestrator.state.running.get("issue-stale");
    if (!firstRunning) throw new Error("expected first running entry");
    firstRunning.lastActivityAt = new Date(0);

    await orchestrator.tick();

    expect(orchestrator.state.running.get("issue-stale")?.threadId).toBe("thread-2");

    resolveFirst({ status: "failed", output: "old failure" });
    await first;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(orchestrator.state.running.get("issue-stale")?.threadId).toBe("thread-2");

    resolveSecond({ status: "completed", output: "new success" });
    await orchestrator.waitForIdle();

    expect(orchestrator.state.completed.has("SYM-10")).toBe(true);
  });
});

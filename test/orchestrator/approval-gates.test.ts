import { describe, expect, test, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import { parseApprovalCommand } from "../../src/orchestrator/approval-gates.js";
import { parseWorkflowConfig } from "../../src/workflow/schema.js";
import type { Issue } from "../../src/tracker/issue.js";
import type { Runtime, RunTurnOpts, StartSessionOpts } from "../../src/runtime/types.js";
import type { Tracker, TrackerComment } from "../../src/tracker/types.js";

const issue = (overrides: Partial<Issue> = {}): Issue => ({
  id: overrides.id ?? "issue-hitl",
  identifier: overrides.identifier ?? "SYM-42",
  title: overrides.title ?? "Risky change",
  description: overrides.description ?? null,
  priority: overrides.priority ?? null,
  state: overrides.state ?? "Todo",
  branch_name: overrides.branch_name ?? null,
  url: overrides.url ?? null,
  labels: overrides.labels ?? ["high-risk"],
  blocked_by: overrides.blocked_by ?? [],
  created_at: overrides.created_at ?? null,
  updated_at: overrides.updated_at ?? null
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("approval gate orchestration", () => {
  test("parses explicit approval commands and ignores quoted commands", () => {
    expect(
      parseApprovalCommand("/approve", { approvalTrigger: "/approve", rejectionTrigger: "/reject", revisionTrigger: "/revise" })
    ).toEqual({ kind: "approve" });
    expect(
      parseApprovalCommand("/reject not safe", { approvalTrigger: "/approve", rejectionTrigger: "/reject", revisionTrigger: "/revise" })
    ).toEqual({ kind: "reject", message: "not safe" });
    expect(
      parseApprovalCommand("/revise add tests", { approvalTrigger: "/approve", rejectionTrigger: "/reject", revisionTrigger: "/revise" })
    ).toEqual({ kind: "revise", message: "add tests" });
    expect(
      parseApprovalCommand("> /approve\nlooks good", {
        approvalTrigger: "/approve",
        rejectionTrigger: "/reject",
        revisionTrigger: "/revise"
      })
    ).toBeNull();
  });

  test("planning turn posts and persists an awaiting review entry instead of executing", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-hitl-plan-"));
    const candidate = issue();
    const comments: TrackerComment[] = [];
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate]),
      createComment: vi.fn(async (_issueId, body) => {
        comments.push({ id: `comment-${comments.length + 1}`, body, created_at: new Date().toISOString(), author: "northstar" });
      }),
      fetchComments: vi.fn(async () => comments),
      updateIssueState: vi.fn(async () => undefined)
    };
    const prompts: string[] = [];
    const planningTurn = deferred<{ status: "completed"; output: string }>();
    const runTurn = vi.fn(async (opts: RunTurnOpts) => {
      prompts.push(opts.prompt);
      return planningTurn.promise;
    });
    const runtime: Runtime = {
      kind: "test",
      startSession: vi.fn(async () => ({ threadId: "planning-thread", runTurn, stop: vi.fn(async () => undefined) }))
    };
    const config = parseWorkflowConfig({
      tracker: { kind: "linear", api_key: "linear-token", active_states: ["Todo"], terminal_states: ["Done"] },
      runtime: { kind: "codex_app_server" },
      workspace: { root },
      approval_gates: {
        enabled: true,
        labels: ["high-risk"],
        awaiting_state: "Awaiting Review"
      }
    } as never);
    const orchestrator = new Orchestrator(config, tracker, runtime, "Implement {{ issue.identifier }}");

    await orchestrator.tick();
    expect(orchestrator.state.running.get("issue-hitl")?.mode).toBe("planning");
    planningTurn.resolve({ status: "completed", output: "Plan:\n1. Add tests\n2. Implement" });
    await orchestrator.waitForIdle();

    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(prompts[0]).toContain("write a concrete implementation plan");
    expect(orchestrator.state.awaitingReview.get("issue-hitl")).toMatchObject({
      issueId: "issue-hitl",
      issue: "SYM-42",
      planOutput: "Plan:\n1. Add tests\n2. Implement",
      planCommentId: "comment-1"
    });
    expect(orchestrator.state.completed.has("SYM-42")).toBe(false);
    expect(tracker.updateIssueState).toHaveBeenCalledWith("issue-hitl", "Awaiting Review");
    const persisted = await readFile(join(root, ".northstar", "awaiting-review.json"), "utf8");
    expect(persisted).toContain("Plan:");
  });

  test("authorized approval starts a fresh execution session with the approved plan", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-hitl-approve-"));
    const candidate = issue();
    const comments: TrackerComment[] = [];
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate]),
      createComment: vi.fn(async (_issueId, body) => {
        comments.push({ id: `comment-${comments.length + 1}`, body, created_at: new Date().toISOString(), author: "northstar" });
      }),
      fetchComments: vi.fn(async () => comments),
      updateIssueState: vi.fn(async () => undefined)
    };
    const prompts: string[] = [];
    const executionTurn = deferred<{ status: "completed"; output: string; tokens: { input: number; output: number; total: number } }>();
    const runTurn = vi
      .fn()
      .mockImplementationOnce(async (opts: RunTurnOpts) => {
        prompts.push(opts.prompt);
        return { status: "completed" as const, output: "Approved plan body" };
      })
      .mockImplementationOnce(async (opts: RunTurnOpts) => {
        prompts.push(opts.prompt);
        return executionTurn.promise;
      });
    const runtime: Runtime = {
      kind: "test",
      startSession: vi.fn(async (opts: StartSessionOpts) => ({
        threadId: `thread-${opts.issue.identifier}-${runTurn.mock.calls.length + 1}`,
        runTurn,
        stop: vi.fn(async () => undefined)
      }))
    };
    const config = parseWorkflowConfig({
      tracker: { kind: "linear", api_key: "linear-token", active_states: ["Todo"], terminal_states: ["Done"] },
      runtime: { kind: "codex_app_server" },
      workspace: { root },
      approval_gates: {
        enabled: true,
        approvers: ["lead"]
      }
    } as never);
    const orchestrator = new Orchestrator(config, tracker, runtime, "Implement {{ issue.identifier }}");

    await orchestrator.tick();
    await orchestrator.waitForIdle();
    comments.push({ id: "human-1", body: "/approve", created_at: new Date().toISOString(), author: "lead" });
    await orchestrator.tick();
    expect(orchestrator.state.running.get("issue-hitl")?.mode).toBe("execution");
    executionTurn.resolve({ status: "completed", output: "implemented", tokens: { input: 1, output: 2, total: 3 } });
    await orchestrator.waitForIdle();

    expect(runtime.startSession).toHaveBeenCalledTimes(2);
    expect(prompts[1]).toContain("The human approved this plan");
    expect(prompts[1]).toContain("Approved plan body");
    expect(orchestrator.state.awaitingReview.has("issue-hitl")).toBe(false);
    expect(orchestrator.state.completed.has("SYM-42")).toBe(true);
    expect(orchestrator.state.results.get("issue-hitl")).toMatchObject({ status: "completed", output: "implemented" });
  });

  test("revision command posts a revised plan and stays awaiting review", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-hitl-revise-"));
    const candidate = issue();
    const comments: TrackerComment[] = [];
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate]),
      createComment: vi.fn(async (_issueId, body) => {
        comments.push({ id: `comment-${comments.length + 1}`, body, created_at: new Date().toISOString(), author: "northstar" });
      }),
      fetchComments: vi.fn(async () => comments)
    };
    const runTurn = vi
      .fn()
      .mockResolvedValueOnce({ status: "completed" as const, output: "initial plan" })
      .mockResolvedValueOnce({ status: "completed" as const, output: "revised plan" });
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
      approval_gates: { enabled: true }
    } as never);
    const orchestrator = new Orchestrator(config, tracker, runtime, "Implement {{ issue.identifier }}");

    await orchestrator.tick();
    await orchestrator.waitForIdle();
    comments.push({ id: "human-1", body: "/revise include rollback", created_at: new Date().toISOString(), author: "reviewer" });
    await orchestrator.tick();
    await orchestrator.waitForIdle();

    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(orchestrator.state.awaitingReview.get("issue-hitl")).toMatchObject({
      planOutput: "revised plan",
      planCommentId: "comment-3",
      lastProcessedCommentId: "human-1"
    });
    expect(orchestrator.state.completed.has("SYM-42")).toBe(false);
  });

  test("dashboard rejection clears awaiting review and transitions to failed state", async () => {
    const root = await mkdtemp(join(tmpdir(), "northstar-hitl-dashboard-reject-"));
    const candidate = issue();
    const comments: TrackerComment[] = [];
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [candidate]),
      fetchIssuesByStates: vi.fn(async () => [candidate]),
      fetchIssueStatesByIds: vi.fn(async () => [candidate]),
      createComment: vi.fn(async (_issueId, body) => {
        comments.push({ id: `comment-${comments.length + 1}`, body, created_at: new Date().toISOString(), author: "northstar" });
      }),
      fetchComments: vi.fn(async () => comments),
      updateIssueState: vi.fn(async () => undefined)
    };
    const runTurn = vi.fn(async () => ({ status: "completed" as const, output: "plan body" }));
    const runtime: Runtime = {
      kind: "test",
      startSession: vi.fn(async () => ({ threadId: "planning-thread", runTurn, stop: vi.fn(async () => undefined) }))
    };
    const config = parseWorkflowConfig({
      tracker: { kind: "linear", api_key: "linear-token", active_states: ["Todo"], terminal_states: ["Done"] },
      runtime: { kind: "codex_app_server" },
      workspace: { root },
      approval_gates: { enabled: true },
      feedback: {
        transitions: {
          failed_state: "Blocked"
        }
      }
    } as never);
    const orchestrator = new Orchestrator(config, tracker, runtime, "Implement {{ issue.identifier }}");

    await orchestrator.tick();
    await orchestrator.waitForIdle();

    await expect(orchestrator.rejectIssue("SYM-42", "too risky")).resolves.toBe(true);

    expect(orchestrator.state.awaitingReview.has("issue-hitl")).toBe(false);
    expect(tracker.updateIssueState).toHaveBeenCalledWith("issue-hitl", "Blocked");
    expect(comments.at(-1)?.body).toContain("too risky");
  });
});

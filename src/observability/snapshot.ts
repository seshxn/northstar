import type { OrchestratorState } from "../orchestrator/state.js";

export const snapshotState = (state: OrchestratorState) => ({
  pollIntervalMs: state.pollIntervalMs,
  maxConcurrentAgents: state.maxConcurrentAgents,
  running: [...state.running.values()].map((entry) => ({
    issue: entry.issue.identifier,
    issueId: entry.issue.id,
    threadId: entry.threadId,
    startedAt: entry.startedAt.toISOString(),
    lastActivityAt: entry.lastActivityAt.toISOString(),
    workspacePath: entry.workspacePath,
    branchName: entry.branchName ?? null,
    baseBranch: entry.baseBranch ?? null,
    changedFiles: entry.changedFiles ?? [],
    toolNames: entry.toolNames ?? [],
    skillSequence: entry.skillSequence ?? [],
    eventCount: entry.events.length,
    lastEvent: entry.events.at(-1)?.message ?? ""
  })),
  completed: [...state.completed],
  claimed: [...state.claimed],
  retryAttempts: [...state.retryAttempts.values()].map((entry) => ({
    issueId: entry.issueId,
    attempt: entry.attempt,
    dueAt: entry.dueAt.toISOString(),
    metadata: entry.metadata
  })),
  awaitingReview: [...state.awaitingReview.values()].map((entry) => ({
    issueId: entry.issueId,
    issue: entry.issue,
    title: entry.title,
    workspacePath: entry.workspacePath,
    planOutput: entry.planOutput,
    planCommentId: entry.planCommentId,
    lastProcessedCommentId: entry.lastProcessedCommentId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    attempt: entry.attempt
  })),
  tokenTotals: state.tokenTotals,
  auditLog: state.auditLog.slice(-100),
  results: [...state.results.values()].map((entry) => ({
    issueId: entry.issueId,
    issue: entry.issue,
    threadId: entry.threadId,
    workspacePath: entry.workspacePath,
    branchName: entry.branchName ?? null,
    baseBranch: entry.baseBranch ?? null,
    changedFiles: entry.changedFiles ?? [],
    status: entry.status,
    output: entry.output,
    tokens: entry.tokens,
    eventCount: entry.events.length,
    events: entry.events,
    startedAt: entry.startedAt.toISOString(),
    completedAt: entry.completedAt.toISOString(),
    attempt: entry.attempt,
    error: entry.error,
    gateResults: entry.gateResults
  })),
  pullRequests: [...state.pullRequests.values()]
});

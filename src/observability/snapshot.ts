import type { OrchestratorState } from "../orchestrator/state.js";

export function snapshotState(state: OrchestratorState) {
  return {
    pollIntervalMs: state.pollIntervalMs,
    maxConcurrentAgents: state.maxConcurrentAgents,
    running: [...state.running.values()].map((entry) => ({
      issue: entry.issue.identifier,
      issueId: entry.issue.id,
      threadId: entry.threadId,
      startedAt: entry.startedAt.toISOString(),
      lastActivityAt: entry.lastActivityAt.toISOString()
    })),
    completed: [...state.completed],
    claimed: [...state.claimed],
    retryAttempts: [...state.retryAttempts.values()].map((entry) => ({
      issueId: entry.issueId,
      attempt: entry.attempt,
      dueAt: entry.dueAt.toISOString(),
      metadata: entry.metadata
    })),
    tokenTotals: state.tokenTotals
  };
}

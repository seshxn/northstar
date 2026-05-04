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
      lastActivityAt: entry.lastActivityAt.toISOString(),
      workspacePath: entry.workspacePath,
      toolNames: entry.toolNames ?? [],
      skillSequence: entry.skillSequence ?? [],
      eventCount: entry.events.length
    })),
    completed: [...state.completed],
    claimed: [...state.claimed],
    retryAttempts: [...state.retryAttempts.values()].map((entry) => ({
      issueId: entry.issueId,
      attempt: entry.attempt,
      dueAt: entry.dueAt.toISOString(),
      metadata: entry.metadata
    })),
    tokenTotals: state.tokenTotals,
    results: [...state.results.values()].map((entry) => ({
      issueId: entry.issueId,
      issue: entry.issue,
      threadId: entry.threadId,
      workspacePath: entry.workspacePath,
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
    }))
  };
}

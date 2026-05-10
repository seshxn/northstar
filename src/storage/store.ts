import type { AwaitingReviewEntry } from "../orchestrator/approval-gates.js";
import type { AuditEvent, OrchestratorState, RetryEntry, RunResultEntry } from "../orchestrator/state.js";

export interface PersistedPullRequest {
  issueId: string;
  url: string;
  number: number;
  state: "open" | "closed" | "merged";
}

export interface PersistedNorthstarSnapshot {
  auditLog: AuditEvent[];
  auditSeq: number;
  tokenTotals: OrchestratorState["tokenTotals"];
  completed: string[];
  results: PersistedRunResult[];
  retryAttempts: PersistedRetryAttempt[];
  awaitingReview: PersistedAwaitingReview[];
  detectedDependencies: Array<{ issueId: string; blockedBy: string[] }>;
  pullRequests: PersistedPullRequest[];
}

export interface PersistedRunResult extends Omit<RunResultEntry, "startedAt" | "completedAt"> {
  startedAt: string;
  completedAt: string;
}

export interface PersistedRetryAttempt extends Omit<RetryEntry, "dueAt"> {
  dueAt: string;
}

export interface PersistedAwaitingReview extends Omit<AwaitingReviewEntry, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
}

export interface NorthstarStore {
  loadSnapshot(): Promise<PersistedNorthstarSnapshot | null>;
  saveSnapshot(snapshot: PersistedNorthstarSnapshot): Promise<void>;
}

export class MemoryNorthstarStore implements NorthstarStore {
  private snapshot: PersistedNorthstarSnapshot | null = null;

  async loadSnapshot(): Promise<PersistedNorthstarSnapshot | null> {
    return this.snapshot;
  }

  async saveSnapshot(snapshot: PersistedNorthstarSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }
}

export const snapshotFromState = (state: OrchestratorState): PersistedNorthstarSnapshot => ({
  auditLog: state.auditLog,
  auditSeq: state.auditSeq,
  tokenTotals: state.tokenTotals,
  completed: [...state.completed],
  results: [...state.results.values()].map((entry) => ({
    ...entry,
    startedAt: entry.startedAt.toISOString(),
    completedAt: entry.completedAt.toISOString()
  })),
  retryAttempts: [...state.retryAttempts.values()].map((entry) => ({ ...entry, dueAt: entry.dueAt.toISOString() })),
  awaitingReview: [...state.awaitingReview.values()].map((entry) => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  })),
  detectedDependencies: [...state.detectedDependencies.entries()].map(([issueId, blockedBy]) => ({ issueId, blockedBy })),
  pullRequests: [...state.pullRequests.values()]
});

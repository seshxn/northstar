import type { OrchestratorState } from "../orchestrator/state.js";
import type { PersistedNorthstarSnapshot } from "./store.js";

export const applyPersistedSnapshot = (state: OrchestratorState, snapshot: PersistedNorthstarSnapshot): void => {
  state.auditLog = [...snapshot.auditLog];
  state.auditSeq = snapshot.auditSeq;
  state.tokenTotals = snapshot.tokenTotals;
  state.completed = new Set(snapshot.completed);
  state.results = new Map(
    snapshot.results.map((entry) => [
      entry.issueId,
      {
        ...entry,
        startedAt: new Date(entry.startedAt),
        completedAt: new Date(entry.completedAt)
      }
    ])
  );
  state.retryAttempts = new Map(
    snapshot.retryAttempts.map((entry) => [
      entry.issueId,
      {
        ...entry,
        dueAt: new Date(entry.dueAt)
      }
    ])
  );
  state.awaitingReview = new Map(
    snapshot.awaitingReview.map((entry) => [
      entry.issueId,
      {
        ...entry,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt)
      }
    ])
  );
  state.detectedDependencies = new Map(snapshot.detectedDependencies.map((entry) => [entry.issueId, entry.blockedBy]));
  state.pullRequests = new Map(snapshot.pullRequests.map((entry) => [entry.issueId, entry]));
};

import type { Issue } from "../tracker/issue.js";
import type { OrchestratorState } from "./state.js";
import { normalizeState } from "./state.js";

export async function reconcileRunningIssues(state: OrchestratorState, refreshedIssues: Issue[]): Promise<OrchestratorState> {
  const visible = new Map(refreshedIssues.map((issue) => [issue.id, issue]));
  for (const [issueId, running] of [...state.running.entries()]) {
    const issue = visible.get(issueId);
    if (!issue || state.terminalStates.has(normalizeState(issue.state)) || !state.activeStates.has(normalizeState(issue.state))) {
      await running.stop();
      state.running.delete(issueId);
      state.claimed.delete(issueId);
      state.retryAttempts.delete(issueId);
    } else {
      state.running.set(issueId, { ...running, issue });
    }
  }
  return state;
}

export async function restartStalledIssues(state: OrchestratorState, now: Date, stallTimeoutMs: number): Promise<string[]> {
  const restarted: string[] = [];
  if (stallTimeoutMs <= 0) return restarted;
  for (const [issueId, running] of [...state.running.entries()]) {
    if (now.getTime() - running.lastActivityAt.getTime() > stallTimeoutMs) {
      await running.stop();
      state.running.delete(issueId);
      state.claimed.delete(issueId);
      restarted.push(issueId);
    }
  }
  return restarted;
}

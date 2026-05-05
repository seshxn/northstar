import type { Issue } from "../tracker/issue.js";
import type { Tool } from "../tools/types.js";
import type { TurnResult } from "../runtime/types.js";
import type { OrchestratorState } from "./state.js";
import { normalizeState } from "./state.js";

export interface StartedRun {
  threadId: string;
  stop: () => Promise<void>;
  workspacePath?: string;
  prompt?: string;
  tools?: Tool[];
  attempt?: number;
  skillSequence?: string[];
  run?: (prompt?: string) => Promise<TurnResult>;
}

export async function dispatchCandidates(opts: {
  state: OrchestratorState;
  issues: Issue[];
  startRun: (issue: Issue) => Promise<StartedRun>;
  onStarted?: (issue: Issue, started: StartedRun) => void;
}): Promise<OrchestratorState> {
  for (const issue of sortIssuesForDispatch(opts.issues)) {
    if (!shouldDispatchIssue(issue, opts.state)) continue;
    const started = await opts.startRun(issue);
    opts.state.running.set(issue.id, {
      issue,
      threadId: started.threadId,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      stop: started.stop,
      attempt: started.attempt,
      workspacePath: started.workspacePath,
      prompt: started.prompt,
      toolNames: started.tools?.map((tool) => tool.name) ?? [],
      events: [],
      skillSequence: started.skillSequence
    });
    opts.state.claimed.add(issue.id);
    opts.onStarted?.(issue, started);
  }
  return opts.state;
}

export function sortIssuesForDispatch(issues: Issue[]): Issue[] {
  return [...issues].sort((left, right) => {
    const leftKey = [priorityRank(left.priority), createdAtRank(left.created_at), left.identifier || left.id].join("|");
    const rightKey = [priorityRank(right.priority), createdAtRank(right.created_at), right.identifier || right.id].join("|");
    return leftKey.localeCompare(rightKey);
  });
}

export function shouldDispatchIssue(issue: Issue, state: OrchestratorState): boolean {
  const issueState = normalizeState(issue.state);
  return Boolean(issue.id && issue.identifier && issue.title) &&
    state.activeStates.has(issueState) &&
    !state.terminalStates.has(issueState) &&
    !todoIssueBlockedByNonTerminal(issue, state) &&
    retryWindowElapsed(issue, state) &&
    !state.claimed.has(issue.id) &&
    !state.running.has(issue.id) &&
    !state.awaitingReview.has(issue.id) &&
    state.running.size < state.maxConcurrentAgents &&
    stateSlotsAvailable(issue, state);
}

function retryWindowElapsed(issue: Issue, state: OrchestratorState): boolean {
  const retry = state.retryAttempts.get(issue.id);
  return !retry || retry.dueAt.getTime() <= Date.now();
}

function stateSlotsAvailable(issue: Issue, state: OrchestratorState): boolean {
  const normalized = normalizeState(issue.state);
  const limit = state.maxConcurrentAgentsByState.get(normalized) ?? state.maxConcurrentAgents;
  let used = 0;
  for (const running of state.running.values()) {
    if (normalizeState(running.issue.state) === normalized) used += 1;
  }
  return used < limit;
}

function todoIssueBlockedByNonTerminal(issue: Issue, state: OrchestratorState): boolean {
  if (normalizeState(issue.state) !== "todo") return false;
  return issue.blocked_by.some((blocker) => !state.terminalStates.has(normalizeState(blocker.state)));
}

function priorityRank(priority: number | null): number {
  return priority && priority >= 1 && priority <= 4 ? priority : 5;
}

function createdAtRank(createdAt: string | null): string {
  return createdAt ?? "9999-12-31T23:59:59.999Z";
}

import type { OrchestratorState } from "../orchestrator/state.js";
import { normalizeState } from "../orchestrator/state.js";
import type { Issue } from "../tracker/issue.js";
import type { BoardColumn, BoardRuntimeState } from "./columns.js";

export interface BoardSnapshot {
  columns: BoardColumnSnapshot[];
  metrics: BoardMetrics;
  updatedAt: string;
}

export interface BoardMetrics {
  running: number;
  awaitingReview: number;
  retrying: number;
  failed: number;
  completed: number;
  pullRequestsOpen: number;
}

export interface BoardColumnSnapshot {
  id: string;
  title: string;
  startsAgent: boolean;
  acceptsManualMoves: boolean;
  moveState: string | null;
  cards: BoardCard[];
}

export interface BoardCard {
  issueId: string;
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  labels: string[];
  priority: number | null;
  url: string | null;
  runtimeStatus: "idle" | BoardRuntimeState;
  lastActivityAt: string | null;
  lastEvent: string | null;
  workspacePath: string | null;
  branchName: string | null;
  baseBranch: string | null;
  changedFiles: string[];
  pr: {
    url: string;
    number: number;
    state: "open" | "merged" | "closed";
  } | null;
  detectedDependencies: string[];
}

export const buildBoardSnapshot = (opts: {
  columns: BoardColumn[];
  issues: Issue[];
  state: OrchestratorState;
  detectedDependencies?: Map<string, string[]>;
  now?: Date;
}): BoardSnapshot => {
  const cards = mergeCards(opts.issues, opts.state);
  if (opts.detectedDependencies) {
    for (const card of cards) {
      card.detectedDependencies = opts.detectedDependencies.get(card.issueId) ?? [];
    }
  }
  for (const card of cards) {
    card.pr = opts.state.pullRequests.get(card.issueId) ?? null;
  }
  const columnSnapshots = opts.columns.map((column) => ({
    id: column.id,
    title: column.title,
    startsAgent: column.startsAgent,
    acceptsManualMoves: column.acceptsManualMoves,
    moveState: column.trackerStates[0] ?? null,
    cards: [] as BoardCard[]
  }));

  for (const card of cards) {
    const columnIndex = findColumnIndex(opts.columns, card);
    if (columnIndex >= 0) columnSnapshots[columnIndex].cards.push(card);
  }

  return {
    columns: columnSnapshots,
    metrics: {
      running: opts.state.running.size,
      awaitingReview: opts.state.awaitingReview.size,
      retrying: [...opts.state.retryAttempts.values()].filter(
        (retry) => !opts.state.running.has(retry.issueId) && !opts.state.awaitingReview.has(retry.issueId)
      ).length,
      failed: [...opts.state.results.values()].filter(
        (result) => result.status !== "completed" && !runtimeStateTakesPrecedence(opts.state, result.issueId)
      ).length,
      completed: [...opts.state.results.values()].filter(
        (result) => result.status === "completed" && !runtimeStateTakesPrecedence(opts.state, result.issueId)
      ).length,
      pullRequestsOpen: [...opts.state.pullRequests.values()].filter((pr) => pr.state === "open").length
    },
    updatedAt: (opts.now ?? new Date()).toISOString()
  };
};

const mergeCards = (issues: Issue[], state: OrchestratorState): BoardCard[] => {
  const byId = new Map(issues.map((issue) => [issue.id, cardFromIssue(issue)]));

  for (const running of state.running.values()) {
    byId.set(running.issue.id, {
      ...cardFromIssue(running.issue),
      runtimeStatus: runningModeToRuntimeStatus(running.mode),
      lastActivityAt: running.lastActivityAt.toISOString(),
      lastEvent: lastEventMessage(running.events.at(-1)),
      workspacePath: running.workspacePath ?? null,
      branchName: running.branchName ?? null,
      baseBranch: running.baseBranch ?? null,
      changedFiles: running.changedFiles ?? []
    });
  }

  for (const entry of state.awaitingReview.values()) {
    const existing = byId.get(entry.issueId);
    byId.set(entry.issueId, {
      ...(existing ?? cardFromAwaiting(entry)),
      runtimeStatus: "awaiting_review",
      lastActivityAt: entry.updatedAt.toISOString(),
      workspacePath: entry.workspacePath
    });
  }

  for (const retry of state.retryAttempts.values()) {
    if (state.running.has(retry.issueId) || state.awaitingReview.has(retry.issueId)) continue;
    const existing = byId.get(retry.issueId);
    if (!existing) continue;
    byId.set(retry.issueId, {
      ...existing,
      runtimeStatus: "retrying",
      lastActivityAt: retry.dueAt.toISOString(),
      lastEvent: retry.metadata.output ? String(retry.metadata.output) : existing.lastEvent
    });
  }

  for (const result of state.results.values()) {
    if (state.retryAttempts.has(result.issueId) || state.running.has(result.issueId) || state.awaitingReview.has(result.issueId)) continue;
    const existing = byId.get(result.issueId);
    if (!existing) continue;
    byId.set(result.issueId, {
      ...existing,
      runtimeStatus: result.status === "completed" ? "completed" : "failed",
      lastActivityAt: result.completedAt.toISOString(),
      lastEvent: result.output ?? lastEventMessage(result.events.at(-1)) ?? existing.lastEvent,
      workspacePath: result.workspacePath || existing.workspacePath,
      branchName: result.branchName ?? existing.branchName,
      baseBranch: result.baseBranch ?? existing.baseBranch,
      changedFiles: result.changedFiles ?? existing.changedFiles
    });
  }

  return [...byId.values()].sort((left, right) => {
    const leftKey = [left.priority ?? 5, left.identifier].join("|");
    const rightKey = [right.priority ?? 5, right.identifier].join("|");
    return leftKey.localeCompare(rightKey);
  });
};

const cardFromIssue = (issue: Issue): BoardCard => ({
  issueId: issue.id,
  identifier: issue.identifier,
  title: issue.title,
  description: issue.description,
  state: issue.state,
  labels: [...issue.labels],
  priority: issue.priority,
  url: issue.url,
  runtimeStatus: "idle",
  lastActivityAt: issue.updated_at,
  lastEvent: null,
  workspacePath: null,
  branchName: issue.branch_name,
  baseBranch: null,
  changedFiles: [],
  pr: null,
  detectedDependencies: []
});

const cardFromAwaiting = (entry: { issueId: string; issue: string; title: string; workspacePath: string; updatedAt: Date }): BoardCard => ({
  issueId: entry.issueId,
  identifier: entry.issue,
  title: entry.title,
  description: null,
  state: "",
  labels: [],
  priority: null,
  url: null,
  runtimeStatus: "awaiting_review",
  lastActivityAt: entry.updatedAt.toISOString(),
  lastEvent: null,
  workspacePath: entry.workspacePath,
  branchName: null,
  baseBranch: null,
  changedFiles: [],
  pr: null,
  detectedDependencies: []
});

const runningModeToRuntimeStatus = (mode: string | undefined): BoardRuntimeState => {
  if (mode === "planning" || mode === "revision") return "planning";
  if (mode === "execution") return "execution";
  return "implementation";
};

const findColumnIndex = (columns: BoardColumn[], card: BoardCard): number => {
  if (card.runtimeStatus !== "idle") {
    const runtimeIndex = columns.findIndex((column) => column.runtimeStates.includes(card.runtimeStatus as BoardRuntimeState));
    if (runtimeIndex >= 0) return runtimeIndex;
  }
  return columns.findIndex((column) => column.normalizedTrackerStates.includes(normalizeState(card.state)));
};

const runtimeStateTakesPrecedence = (state: OrchestratorState, issueId: string): boolean =>
  state.running.has(issueId) || state.awaitingReview.has(issueId) || state.retryAttempts.has(issueId);

const lastEventMessage = (event: { message?: string } | undefined): string | null => event?.message ?? null;

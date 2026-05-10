export interface BoardSnapshot {
  columns: BoardColumn[];
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

export interface BoardColumn {
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
  runtimeStatus: "idle" | "planning" | "awaiting_review" | "implementation" | "execution" | "retrying" | "completed" | "failed" | "stalled";
  lastActivityAt: string | null;
  lastEvent: string | null;
  workspacePath: string | null;
  branchName: string | null;
  baseBranch: string | null;
  changedFiles: string[];
  pr: { url: string; number: number; state: "open" | "merged" | "closed" } | null;
  detectedDependencies: string[];
}

export interface RuntimeEvent {
  type: string;
  message?: string;
  timestamp?: string;
}

export type AuditEventKind =
  | "issue_dispatched"
  | "run_started"
  | "plan_created"
  | "dependency_detected"
  | "run_completed"
  | "run_failed"
  | "approval_triggered"
  | "feedback_triggered"
  | "rejection_triggered"
  | "retry_scheduled"
  | "issue_stopped";

export interface AuditEvent {
  id: number;
  timestamp: string;
  kind: AuditEventKind;
  issueId?: string;
  issueIdentifier?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface StateSnapshot {
  running: Array<{
    issue: string;
    issueId: string;
    threadId: string;
    eventCount: number;
    lastEvent: string;
    workspacePath?: string;
    branchName?: string | null;
    baseBranch?: string | null;
    changedFiles?: string[];
    toolNames?: string[];
    skillSequence?: string[];
    startedAt?: string;
  }>;
  awaitingReview: Array<{
    issueId: string;
    issue: string;
    title: string;
    planOutput: string;
    updatedAt: string;
    attempt: number;
    workspacePath: string;
  }>;
  retryAttempts: Array<{ issueId: string; attempt: number; dueAt: string }>;
  results: Array<{
    issueId: string;
    issue: string;
    status: string;
    output?: string;
    eventCount: number;
    completedAt: string;
    startedAt?: string;
    workspacePath: string;
    branchName?: string | null;
    baseBranch?: string | null;
    changedFiles?: string[];
    tokens?: { input: number; output: number; total: number };
    events?: RuntimeEvent[];
    toolNames?: string[];
  }>;
  tokenTotals: { input: number; output: number; total: number };
  auditLog?: AuditEvent[];
  pullRequests?: Array<{ issueId: string; url: string; number: number; state: "open" | "merged" | "closed" }>;
}

export interface SettingsSnapshot {
  runtime: {
    kind: string;
    executionModel: string | null;
    planningModel: string | null;
    capabilities: {
      localShell: boolean;
      filesystemEdits: boolean;
      northstarTools: boolean;
      tokenTelemetry: boolean;
      multiTurnSession: boolean;
      stop: boolean;
      planningModel: boolean;
    };
  };
  tracker: {
    kind: string;
    jql: string | null;
    project_key: string | null;
    active_states: string[];
  };
}

export interface SettingsUpdatePayload {
  runtime?: {
    executionModel?: string;
    planningModel?: string;
  };
  tracker?: {
    jql?: string;
  };
}

export interface CreatePullRequestPayload {
  head?: string;
  title?: string;
  body?: string;
  base?: string;
  draft?: boolean;
  labels?: string[];
  reviewers?: string[];
}

export async function fetchBoard(): Promise<BoardSnapshot> {
  return jsonFetch("/api/v1/board");
}

export async function fetchState(): Promise<StateSnapshot> {
  return jsonFetch("/api/v1/state");
}

export async function fetchSettings(): Promise<SettingsSnapshot> {
  return jsonFetch("/api/v1/settings");
}

export async function refreshService(): Promise<void> {
  await jsonFetch("/api/v1/refresh", { method: "POST" });
}

export async function approvePlan(card: BoardCard): Promise<void> {
  await jsonFetch(`/api/v1/issues/${encodeURIComponent(card.issueId)}/plan/approve`, { method: "POST" });
}

export async function sendPlanFeedback(card: BoardCard, message: string): Promise<void> {
  await jsonFetch(`/api/v1/issues/${encodeURIComponent(card.issueId)}/plan/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message })
  });
}

export async function rejectPlan(card: BoardCard, message: string): Promise<void> {
  await jsonFetch(`/api/v1/issues/${encodeURIComponent(card.issueId)}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message })
  });
}

export async function moveIssue(issueId: string, state: string): Promise<void> {
  await jsonFetch(`/api/v1/issues/${encodeURIComponent(issueId)}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state })
  });
}

export async function stopIssue(card: BoardCard): Promise<void> {
  await jsonFetch(`/api/v1/${encodeURIComponent(card.issueId)}/stop`, { method: "POST" });
}

export async function retryIssue(issueId: string): Promise<void> {
  await jsonFetch(`/api/v1/${encodeURIComponent(issueId)}/retry`, { method: "POST" });
}

export async function createPullRequest(issueId: string, payload: CreatePullRequestPayload = {}): Promise<void> {
  await jsonFetch(`/api/v1/issues/${encodeURIComponent(issueId)}/pr/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function addComment(issueId: string, body: string): Promise<void> {
  await jsonFetch(`/api/v1/issues/${encodeURIComponent(issueId)}/comment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body })
  });
}

export async function updateSettings(payload: SettingsUpdatePayload): Promise<void> {
  await jsonFetch("/api/v1/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function scanDependencies(): Promise<void> {
  await jsonFetch("/api/v1/dependencies/scan", { method: "POST" });
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = window.localStorage.getItem("northstar-auth-token")?.trim();
  if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

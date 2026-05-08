import type { Issue } from "../tracker/issue.js";
import type { RuntimeEvent, TurnResult } from "../runtime/types.js";
import type { AwaitingReviewEntry } from "./approval-gates.js";

export type RunMode = "implementation" | "planning" | "revision" | "execution" | "qa" | "refinement";

export type AuditEventKind =
  | "issue_dispatched"
  | "run_started"
  | "plan_created"
  | "dependency_detected"
  | "qa_started"
  | "run_completed"
  | "run_failed"
  | "approval_triggered"
  | "feedback_triggered"
  | "rejection_triggered"
  | "retry_scheduled"
  | "issue_stopped"
  | "refinement_started"
  | "refinement_completed";

export interface AuditEvent {
  id: number;
  timestamp: string;
  kind: AuditEventKind;
  issueId?: string;
  issueIdentifier?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface RunningEntry {
  issue: Issue;
  threadId: string;
  mode?: RunMode;
  startedAt: Date;
  lastActivityAt: Date;
  stop: () => Promise<void>;
  attempt?: number;
  workspacePath?: string;
  prompt?: string;
  toolNames?: string[];
  events: RuntimeEvent[];
  skillSequence?: string[];
}

export interface RetryEntry {
  issueId: string;
  attempt: number;
  dueAt: Date;
  metadata: Record<string, unknown>;
}

export interface TokenTotals {
  input: number;
  output: number;
  total: number;
}

export interface RunResultEntry {
  issueId: string;
  issue: string;
  threadId: string;
  workspacePath: string;
  status: TurnResult["status"];
  output?: string;
  tokens?: TokenTotals;
  events: RuntimeEvent[];
  startedAt: Date;
  completedAt: Date;
  attempt: number;
  error?: string;
  gateResults: GateResultEntry[];
  mode?: RunMode;
}

export interface GateResultEntry {
  gate: string;
  status: TurnResult["status"];
  output?: string;
}

export interface OrchestratorState {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  activeStates: Set<string>;
  terminalStates: Set<string>;
  maxConcurrentAgentsByState: Map<string, number>;
  running: Map<string, RunningEntry>;
  completed: Set<string>;
  claimed: Set<string>;
  retryAttempts: Map<string, RetryEntry>;
  awaitingReview: Map<string, AwaitingReviewEntry>;
  tokenTotals: TokenTotals;
  results: Map<string, RunResultEntry>;
  detectedDependencies: Map<string, string[]>;
  auditLog: AuditEvent[];
  auditSeq: number;
}

export const createInitialState = (opts: {
  pollIntervalMs?: number;
  maxConcurrentAgents: number;
  activeStates: string[];
  terminalStates: string[];
  maxConcurrentAgentsByState?: Record<string, number>;
}): OrchestratorState => ({
  pollIntervalMs: opts.pollIntervalMs ?? 30_000,
  maxConcurrentAgents: opts.maxConcurrentAgents,
  activeStates: new Set(opts.activeStates.map(normalizeState)),
  terminalStates: new Set(opts.terminalStates.map(normalizeState)),
  maxConcurrentAgentsByState: new Map(
    Object.entries(opts.maxConcurrentAgentsByState ?? {}).map(([key, value]) => [normalizeState(key), value])
  ),
  running: new Map(),
  completed: new Set(),
  claimed: new Set(),
  retryAttempts: new Map(),
  awaitingReview: new Map(),
  tokenTotals: { input: 0, output: 0, total: 0 },
  results: new Map(),
  detectedDependencies: new Map(),
  auditLog: [],
  auditSeq: 0
});

export const normalizeState = (state: string | null | undefined): string => (state ?? "").toLowerCase();

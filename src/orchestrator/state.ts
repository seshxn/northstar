import type { Issue } from "../tracker/issue.js";

export interface RunningEntry {
  issue: Issue;
  threadId: string;
  startedAt: Date;
  lastActivityAt: Date;
  stop: () => Promise<void>;
  attempt?: number;
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
  tokenTotals: TokenTotals;
}

export function createInitialState(opts: {
  pollIntervalMs?: number;
  maxConcurrentAgents: number;
  activeStates: string[];
  terminalStates: string[];
  maxConcurrentAgentsByState?: Record<string, number>;
}): OrchestratorState {
  return {
    pollIntervalMs: opts.pollIntervalMs ?? 30_000,
    maxConcurrentAgents: opts.maxConcurrentAgents,
    activeStates: new Set(opts.activeStates.map(normalizeState)),
    terminalStates: new Set(opts.terminalStates.map(normalizeState)),
    maxConcurrentAgentsByState: new Map(Object.entries(opts.maxConcurrentAgentsByState ?? {}).map(([key, value]) => [normalizeState(key), value])),
    running: new Map(),
    completed: new Set(),
    claimed: new Set(),
    retryAttempts: new Map(),
    tokenTotals: { input: 0, output: 0, total: 0 }
  };
}

export function normalizeState(state: string | null | undefined): string {
  return (state ?? "").toLowerCase();
}

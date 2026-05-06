import type { Issue } from "../tracker/issue.js";
import type { Tool } from "../tools/types.js";

export type RuntimeRunMode = "implementation" | "planning" | "revision" | "execution";

export interface Runtime {
  readonly kind: string;
  startSession(opts: StartSessionOpts): Promise<Session>;
}

export interface StartSessionOpts {
  issue: Issue;
  workspacePath: string;
  tools: Tool[];
}

export interface Session {
  readonly threadId: string;
  runTurn(opts: RunTurnOpts): Promise<TurnResult>;
  stop(): Promise<void>;
}

export interface RunTurnOpts {
  prompt: string;
  mode?: RuntimeRunMode;
  issue: Issue;
  tools: Tool[];
  onEvent: (event: RuntimeEvent) => void;
  signal: AbortSignal;
}

export interface RuntimeEvent {
  type: string;
  timestamp: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface TurnResult {
  status: "completed" | "failed" | "cancelled" | "timeout";
  output?: string;
  tokens?: { input: number; output: number; total: number };
}

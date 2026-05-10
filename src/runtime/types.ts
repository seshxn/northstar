import type { Issue } from "../tracker/issue.js";
import type { Tool } from "../tools/types.js";

export type RuntimeRunMode = "implementation" | "planning" | "revision" | "execution" | "refinement";

export interface Runtime {
  readonly kind: string;
  readonly capabilities?: RuntimeCapabilities;
  startSession(opts: StartSessionOpts): Promise<Session>;
}

export interface RuntimeCapabilities {
  localShell: boolean;
  filesystemEdits: boolean;
  northstarTools: boolean;
  tokenTelemetry: boolean;
  multiTurnSession: boolean;
  stop: boolean;
  planningModel: boolean;
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

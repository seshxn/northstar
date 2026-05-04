import { randomUUID } from "node:crypto";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { Runtime, Session, StartSessionOpts, RunTurnOpts, TurnResult } from "../types.js";
import { builtinTools } from "./builtin-tools.js";

export class BedrockAnthropicRuntime implements Runtime {
  readonly kind = "bedrock_anthropic";
  readonly client: BedrockRuntimeClient;

  constructor(private readonly config: { region?: string; builtin_tools?: string[] }) {
    this.client = new BedrockRuntimeClient({ region: config.region });
  }

  async startSession(opts: StartSessionOpts): Promise<Session> {
    return new BedrockSession(opts.workspacePath, this.config.builtin_tools ?? []);
  }
}

class BedrockSession implements Session {
  readonly threadId = randomUUID();
  constructor(private readonly workspacePath: string, private readonly builtins: string[]) {}
  async runTurn(opts: RunTurnOpts): Promise<TurnResult> {
    opts.onEvent({ type: "bedrock_turn_started", timestamp: new Date().toISOString() });
    for (const tool of builtinTools(this.builtins, this.workspacePath)) opts.tools.push(tool);
    return { status: "completed", output: "Bedrock runtime harness initialized.", tokens: { input: 0, output: 0, total: 0 } };
  }
  async stop(): Promise<void> {}
}

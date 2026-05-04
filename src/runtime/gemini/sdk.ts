import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import type { Runtime, Session, StartSessionOpts, RunTurnOpts, TurnResult } from "../types.js";

export class GeminiRuntime implements Runtime {
  readonly kind = "gemini";
  readonly client?: GoogleGenAI;
  constructor(private readonly config: { api_key?: string; model?: string }) {
    this.client = config.api_key ? new GoogleGenAI({ apiKey: config.api_key }) : undefined;
  }
  async startSession(): Promise<Session> {
    return new GeminiSession(this.config.model ?? "gemini-2.5-pro");
  }
}

class GeminiSession implements Session {
  readonly threadId = randomUUID();
  constructor(private readonly model: string) {}
  async runTurn(opts: RunTurnOpts): Promise<TurnResult> {
    opts.onEvent({ type: "gemini_experimental_runtime", timestamp: new Date().toISOString(), data: { model: this.model } });
    return { status: "failed", output: "Gemini runtime is experimental: model execution and tool calling are not implemented yet.", tokens: { input: 0, output: 0, total: 0 } };
  }
  async stop(): Promise<void> {}
}

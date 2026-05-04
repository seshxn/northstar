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
    opts.onEvent({ type: "gemini_turn_started", timestamp: new Date().toISOString(), data: { model: this.model } });
    return { status: "completed", output: "Gemini runtime harness initialized.", tokens: { input: 0, output: 0, total: 0 } };
  }
  async stop(): Promise<void> {}
}

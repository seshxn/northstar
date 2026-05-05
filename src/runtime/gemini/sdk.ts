import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import type { Runtime, Session, StartSessionOpts, RunTurnOpts, TurnResult } from "../types.js";
import { runFunctionCallingLoop, type HarnessMessage, type ModelResponse } from "../harness.js";
import type { Tool } from "../../tools/types.js";

export class GeminiRuntime implements Runtime {
  readonly kind = "gemini";
  readonly client: GoogleGenAI;

  constructor(private readonly config: { api_key?: string; model?: string; max_tokens?: number }) {
    this.client = new GoogleGenAI({ apiKey: config.api_key });
  }

  async startSession(opts: StartSessionOpts): Promise<Session> {
    return new GeminiSession(this.client, this.config, opts.workspacePath, opts.tools);
  }
}

class GeminiSession implements Session {
  readonly threadId = randomUUID();

  constructor(
    private readonly client: GoogleGenAI,
    private readonly config: { model?: string; max_tokens?: number },
    private readonly workspacePath: string,
    private readonly tools: Tool[]
  ) {}

  async runTurn(opts: RunTurnOpts): Promise<TurnResult> {
    return runFunctionCallingLoop({
      prompt: opts.prompt,
      issue: opts.issue,
      workspacePath: this.workspacePath,
      signal: opts.signal,
      tools: this.tools,
      callModel: (messages, tools, signal) => callGemini(this.client, this.config, messages, tools, signal),
      onEvent: opts.onEvent
    });
  }

  async stop(): Promise<void> {}
}

async function callGemini(
  client: GoogleGenAI,
  config: { model?: string; max_tokens?: number },
  messages: HarnessMessage[],
  tools: Tool[],
  signal: AbortSignal
): Promise<ModelResponse> {
  if (signal.aborted) return { stopReason: "error", message: { role: "assistant", content: [] } };

  const geminiTools = tools.length > 0
    ? [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })) }]
    : undefined;

  const response = await client.models.generateContent({
    model: config.model ?? "gemini-2.5-pro",
    contents: toGeminiContents(messages) as Parameters<typeof client.models.generateContent>[0]["contents"],
    ...(geminiTools && { tools: geminiTools }),
    config: { maxOutputTokens: config.max_tokens ?? 8192 }
  });

  const parts: Array<Record<string, unknown>> = (response.candidates?.[0]?.content?.parts ?? []) as Array<Record<string, unknown>>;
  const hasFunctionCalls = parts.some((p) => p.functionCall != null);

  const content = parts.map((p) => {
    if (p.functionCall && typeof p.functionCall === "object") {
      const fc = p.functionCall as { name: string; args?: Record<string, unknown> };
      return { type: "tool_use", id: fc.name, name: fc.name, input: fc.args ?? {} };
    }
    return { type: "text", text: String(p.text ?? "") };
  });

  const finishReason = String(response.candidates?.[0]?.finishReason ?? "STOP");

  return {
    stopReason: hasFunctionCalls ? "tool_use" : mapGeminiFinishReason(finishReason),
    message: { role: "assistant", content },
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount
    }
  };
}

function mapGeminiFinishReason(reason: string): ModelResponse["stopReason"] {
  if (reason === "MAX_TOKENS") return "max_tokens";
  if (reason === "STOP") return "end_turn";
  return "error";
}

export type GeminiContent = { role: "user" | "model"; parts: unknown[] };

export function toGeminiContents(messages: HarnessMessage[]): GeminiContent[] {
  const result: GeminiContent[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === "tool") {
      const parts: unknown[] = [];
      while (i < messages.length && messages[i].role === "tool") {
        const content = messages[i].content as { tool_use_id: string; content?: string; success?: boolean };
        parts.push({
          functionResponse: {
            name: content.tool_use_id,
            response: { output: content.content ?? "", success: content.success !== false }
          }
        });
        i++;
      }
      result.push({ role: "user", parts });
    } else if (msg.role === "user") {
      result.push({ role: "user", parts: [{ text: String(msg.content) }] });
      i++;
    } else {
      const content = msg.content;
      if (Array.isArray(content)) {
        const parts = (content as Array<Record<string, unknown>>).map((item) => {
          if (item.type === "tool_use") return { functionCall: { name: String(item.name), args: item.input ?? {} } };
          return { text: String(item.text ?? "") };
        });
        result.push({ role: "model", parts });
      } else {
        result.push({ role: "model", parts: [{ text: String(content) }] });
      }
      i++;
    }
  }
  return result;
}

import type { Issue } from "../tracker/issue.js";
import type { Tool } from "../tools/types.js";
import type { RuntimeEvent, TurnResult } from "./types.js";

export interface HarnessMessage {
  role: "user" | "assistant" | "tool";
  content: unknown;
}

export interface ModelResponse {
  stopReason: "tool_use" | "end_turn" | "max_tokens" | "error";
  message: HarnessMessage;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export async function runFunctionCallingLoop(opts: {
  prompt: string;
  issue: Issue;
  workspacePath: string;
  signal: AbortSignal;
  tools: Tool[];
  callModel: (messages: HarnessMessage[], tools: Tool[], signal: AbortSignal) => Promise<ModelResponse>;
  onEvent: (event: RuntimeEvent) => void;
  maxTurns?: number;
}): Promise<TurnResult> {
  const messages: HarnessMessage[] = [{ role: "user", content: opts.prompt }];
  let totals = { input: 0, output: 0, total: 0 };
  for (let turn = 0; turn < (opts.maxTurns ?? 50); turn += 1) {
    if (opts.signal.aborted) return { status: "cancelled", tokens: totals };
    const response = await opts.callModel(messages, opts.tools, opts.signal);
    messages.push(response.message);
    totals = addUsage(totals, response.usage);
    opts.onEvent({ type: "runtime_message", timestamp: new Date().toISOString(), data: { stopReason: response.stopReason } });
    if (response.stopReason === "end_turn") return { status: "completed", output: textFromContent(response.message.content), tokens: totals };
    if (response.stopReason !== "tool_use") return { status: "failed", output: textFromContent(response.message.content), tokens: totals };
    for (const call of toolCalls(response.message.content)) {
      const tool = opts.tools.find((candidate) => candidate.name === call.name);
      if (!tool) {
        messages.push({ role: "tool", content: { tool_use_id: call.id, error: `unsupported tool: ${call.name}` } });
        continue;
      }
      const result = await tool.execute(call.input, { issue: opts.issue, workspacePath: opts.workspacePath, signal: opts.signal });
      messages.push({ role: "tool", content: { tool_use_id: call.id, content: result.output, success: result.success } });
    }
  }
  return { status: "timeout", tokens: totals };
}

function toolCalls(content: unknown): Array<{ id: string; name: string; input: unknown }> {
  if (!Array.isArray(content)) return [];
  return content.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return record.type === "tool_use" && typeof record.name === "string"
      ? [{ id: String(record.id ?? record.name), name: record.name, input: record.input }]
      : [];
  });
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item && typeof item === "object" && "text" in item ? String((item as { text: unknown }).text) : "").join("");
  return JSON.stringify(content);
}

function addUsage(current: { input: number; output: number; total: number }, usage: ModelResponse["usage"]) {
  const input = current.input + (usage?.inputTokens ?? 0);
  const output = current.output + (usage?.outputTokens ?? 0);
  return { input, output, total: input + output };
}

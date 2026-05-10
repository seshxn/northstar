import { randomUUID } from "node:crypto";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { ConverseCommandInput } from "@aws-sdk/client-bedrock-runtime";
import type { Runtime, RuntimeRunMode, Session, StartSessionOpts, RunTurnOpts, TurnResult } from "../types.js";
import { runFunctionCallingLoop, type HarnessMessage, type ModelResponse } from "../harness.js";
import { builtinTools } from "./builtin-tools.js";
import type { Tool } from "../../tools/types.js";

export class BedrockAnthropicRuntime implements Runtime {
  readonly kind = "bedrock_anthropic";
  readonly capabilities = {
    localShell: true,
    filesystemEdits: true,
    northstarTools: true,
    tokenTelemetry: true,
    multiTurnSession: true,
    stop: false,
    planningModel: true
  };
  readonly client: BedrockRuntimeClient;

  constructor(
    private readonly config: { model_id: string; planning_model?: string; region?: string; max_tokens?: number; builtin_tools?: string[] }
  ) {
    this.client = new BedrockRuntimeClient({ region: config.region ?? "us-west-2" });
  }

  async startSession(opts: StartSessionOpts): Promise<Session> {
    const sessionTools = [...opts.tools, ...builtinTools(this.config.builtin_tools ?? [], opts.workspacePath)];
    return new BedrockSession(this.client, this.config, opts.workspacePath, sessionTools);
  }
}

class BedrockSession implements Session {
  readonly threadId = randomUUID();

  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly config: { model_id: string; planning_model?: string; max_tokens?: number },
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
      callModel: (messages, tools, signal) => callBedrockConverse(this.client, this.config, messages, tools, signal, opts.mode),
      onEvent: opts.onEvent
    });
  }

  async stop(): Promise<void> {}
}

const callBedrockConverse = async (
  client: BedrockRuntimeClient,
  config: { model_id: string; planning_model?: string; max_tokens?: number },
  messages: HarnessMessage[],
  tools: Tool[],
  signal: AbortSignal,
  mode?: RuntimeRunMode
): Promise<ModelResponse> => {
  const input: ConverseCommandInput = {
    modelId: modelIdForTurn(config, mode),
    messages: toConverseMessages(messages) as ConverseCommandInput["messages"],
    inferenceConfig: { maxTokens: config.max_tokens ?? 8192 }
  };

  if (tools.length > 0) {
    input.toolConfig = {
      tools: tools.map((tool) => ({
        toolSpec: {
          name: tool.name,
          description: tool.description,
          inputSchema: { json: tool.inputSchema as Record<string, unknown> }
        }
      })) as ConverseCommandInput["toolConfig"] extends { tools?: infer T } ? Exclude<T, undefined> : never
    };
  }

  const result = await client.send(new ConverseCommand(input), { abortSignal: signal });

  const rawContent = (result.output?.message?.content ?? []) as unknown as Array<Record<string, unknown>>;
  const content: unknown[] = rawContent.map((block) => {
    if (block.text != null) return { type: "text", text: String(block.text) };
    if (block.toolUse && typeof block.toolUse === "object") {
      const tu = block.toolUse as { toolUseId?: string; name?: string; input?: unknown };
      return { type: "tool_use", id: tu.toolUseId ?? "", name: tu.name ?? "", input: tu.input };
    }
    return { type: "text", text: JSON.stringify(block) };
  });

  return {
    stopReason: mapBedrockStopReason(String(result.stopReason ?? "end_turn")),
    message: { role: "assistant", content },
    usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens }
  };
};

export const modelIdForTurn = (config: { model_id: string; planning_model?: string }, mode?: RuntimeRunMode): string => {
  if ((mode === "planning" || mode === "revision") && config.planning_model) return config.planning_model;
  return config.model_id;
};

const mapBedrockStopReason = (reason: string): ModelResponse["stopReason"] => {
  if (reason === "tool_use") return "tool_use";
  if (reason === "max_tokens") return "max_tokens";
  if (reason === "end_turn") return "end_turn";
  return "error";
};

export type ConverseMessage = { role: "user" | "assistant"; content: unknown[] };

export const toConverseMessages = (messages: HarnessMessage[]): ConverseMessage[] => {
  const result: ConverseMessage[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === "tool") {
      const toolResults: unknown[] = [];
      while (i < messages.length && messages[i].role === "tool") {
        const content = messages[i].content as { tool_use_id: string; content?: string; success?: boolean };
        toolResults.push({
          toolResult: {
            toolUseId: content.tool_use_id,
            content: [{ text: content.content ?? "" }],
            status: content.success !== false ? "success" : "error"
          }
        });
        i++;
      }
      result.push({ role: "user", content: toolResults });
    } else if (msg.role === "user") {
      result.push({ role: "user", content: [{ text: String(msg.content) }] });
      i++;
    } else {
      const content = msg.content;
      if (Array.isArray(content)) {
        result.push({
          role: "assistant",
          content: (content as Array<Record<string, unknown>>).map((item) => {
            if (item.type === "text") return { text: String(item.text ?? "") };
            if (item.type === "tool_use")
              return { toolUse: { toolUseId: String(item.id ?? item.name), name: String(item.name), input: item.input } };
            return { text: JSON.stringify(item) };
          })
        });
      } else {
        result.push({ role: "assistant", content: [{ text: String(content) }] });
      }
      i++;
    }
  }
  return result;
};

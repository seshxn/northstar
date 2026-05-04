import { describe, expect, test, vi } from "vitest";
import { runtimeForConfig } from "../../src/runtime/registry.js";
import { runFunctionCallingLoop } from "../../src/runtime/harness.js";
import { builtinTools } from "../../src/runtime/bedrock/builtin-tools.js";

describe("SPEC 17.5 runtime implementations", () => {
  test("selects all configured runtime kinds", () => {
    expect(runtimeForConfig({ kind: "codex_app_server", command: "codex app-server" } as never).kind).toBe("codex_app_server");
    expect(runtimeForConfig({ kind: "claude_code", model: "claude-opus-4-7" } as never).kind).toBe("claude_code");
    expect(runtimeForConfig({ kind: "bedrock_anthropic", model_id: "anthropic.claude", region: "us-west-2" } as never).kind).toBe("bedrock_anthropic");
    expect(runtimeForConfig({ kind: "gemini", model: "gemini-2.5-pro", api_key: "key" } as never).kind).toBe("gemini");
  });

  test("function-calling harness executes tool calls until the model ends the turn", async () => {
    const model = vi
      .fn()
      .mockResolvedValueOnce({ stopReason: "tool_use", message: { role: "assistant", content: [{ type: "tool_use", id: "1", name: "echo", input: { text: "hi" } }] } })
      .mockResolvedValueOnce({ stopReason: "end_turn", message: { role: "assistant", content: [{ type: "text", text: "done" }] }, usage: { inputTokens: 3, outputTokens: 5 } });
    const result = await runFunctionCallingLoop({
      prompt: "hello",
      issue: undefined as never,
      workspacePath: "/tmp/ws",
      signal: new AbortController().signal,
      tools: [{ name: "echo", description: "echo", inputSchema: {}, execute: vi.fn(async (args) => ({ success: true, output: JSON.stringify(args) })) }],
      callModel: model,
      onEvent: vi.fn()
    });

    expect(model).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("completed");
    expect(result.tokens).toEqual({ input: 3, output: 5, total: 8 });
  });

  test("builtin file tools reject paths outside the workspace", async () => {
    const tools = builtinTools(["read", "write", "edit"], "/tmp/northstar-workspace");
    const ctx = { issue: undefined as never, workspacePath: "/tmp/northstar-workspace", signal: new AbortController().signal };

    await expect(tools.find((tool) => tool.name === "write_file")?.execute({ path: "../escape.txt", content: "x" }, ctx)).rejects.toThrow(/workspace/i);
  });

  test("Bedrock and Gemini runtime turns report explicit experimental status", async () => {
    const bedrock = runtimeForConfig({ kind: "bedrock_anthropic", model_id: "anthropic.claude", region: "us-west-2" } as never);
    const gemini = runtimeForConfig({ kind: "gemini", model: "gemini-2.5-pro", api_key: "key" } as never);

    const bedrockResult = await (await bedrock.startSession({ issue: undefined as never, workspacePath: "/tmp/ws", tools: [] })).runTurn({
      prompt: "run",
      issue: undefined as never,
      tools: [],
      onEvent: vi.fn(),
      signal: new AbortController().signal
    });
    const geminiResult = await (await gemini.startSession({ issue: undefined as never, workspacePath: "/tmp/ws", tools: [] })).runTurn({
      prompt: "run",
      issue: undefined as never,
      tools: [],
      onEvent: vi.fn(),
      signal: new AbortController().signal
    });

    expect(bedrockResult).toMatchObject({ status: "failed", output: expect.stringContaining("experimental") });
    expect(geminiResult).toMatchObject({ status: "failed", output: expect.stringContaining("experimental") });
  });
});

import { describe, expect, test, vi } from "vitest";
import { runtimeForConfig } from "../../src/runtime/registry.js";
import { runFunctionCallingLoop } from "../../src/runtime/harness.js";
import { builtinTools } from "../../src/runtime/bedrock/builtin-tools.js";
import { toConverseMessages } from "../../src/runtime/bedrock/bedrock.js";
import { toGeminiContents } from "../../src/runtime/gemini/sdk.js";

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

  describe("toConverseMessages (Bedrock message conversion)", () => {
    test("converts a simple user prompt", () => {
      const result = toConverseMessages([{ role: "user", content: "hello" }]);
      expect(result).toEqual([{ role: "user", content: [{ text: "hello" }] }]);
    });

    test("converts assistant message with text and tool_use", () => {
      const result = toConverseMessages([
        { role: "user", content: "run something" },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "bash", input: { command: "ls" } }] }
      ]);
      expect(result[1]).toEqual({
        role: "assistant",
        content: [{ toolUse: { toolUseId: "t1", name: "bash", input: { command: "ls" } } }]
      });
    });

    test("merges consecutive tool results into a single user message", () => {
      const result = toConverseMessages([
        { role: "user", content: "do it" },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "a", input: {} }, { type: "tool_use", id: "t2", name: "b", input: {} }] },
        { role: "tool", content: { tool_use_id: "t1", content: "result-a", success: true } },
        { role: "tool", content: { tool_use_id: "t2", content: "result-b", success: false } }
      ]);
      expect(result[2]).toEqual({
        role: "user",
        content: [
          { toolResult: { toolUseId: "t1", content: [{ text: "result-a" }], status: "success" } },
          { toolResult: { toolUseId: "t2", content: [{ text: "result-b" }], status: "error" } }
        ]
      });
    });
  });

  describe("toGeminiContents (Gemini message conversion)", () => {
    test("converts a simple user prompt", () => {
      const result = toGeminiContents([{ role: "user", content: "hello" }]);
      expect(result).toEqual([{ role: "user", parts: [{ text: "hello" }] }]);
    });

    test("converts assistant message with function calls", () => {
      const result = toGeminiContents([
        { role: "user", content: "run it" },
        { role: "assistant", content: [{ type: "tool_use", id: "bash", name: "bash", input: { command: "ls" } }] }
      ]);
      expect(result[1]).toEqual({
        role: "model",
        parts: [{ functionCall: { name: "bash", args: { command: "ls" } } }]
      });
    });

    test("merges consecutive tool results into a single user message with functionResponse parts", () => {
      const result = toGeminiContents([
        { role: "user", content: "go" },
        { role: "assistant", content: [{ type: "tool_use", id: "bash", name: "bash", input: {} }] },
        { role: "tool", content: { tool_use_id: "bash", content: "ok", success: true } }
      ]);
      expect(result[2]).toEqual({
        role: "user",
        parts: [{ functionResponse: { name: "bash", response: { output: "ok", success: true } } }]
      });
    });
  });
});

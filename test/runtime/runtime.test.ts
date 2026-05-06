import { describe, expect, test, vi } from "vitest";
import { buildArgs } from "../../src/runtime/claude-code/cli.js";
import { runtimeForConfig } from "../../src/runtime/registry.js";
import { runFunctionCallingLoop } from "../../src/runtime/harness.js";
import { builtinTools } from "../../src/runtime/bedrock/builtin-tools.js";
import { modelIdForTurn, toConverseMessages } from "../../src/runtime/bedrock/bedrock.js";
import { modelForTurn, toGeminiContents } from "../../src/runtime/gemini/sdk.js";

describe("SPEC 17.5 runtime implementations", () => {
  test("selects all configured runtime kinds", () => {
    expect(runtimeForConfig({ kind: "codex_app_server", command: "codex app-server" } as never).kind).toBe("codex_app_server");
    expect(runtimeForConfig({ kind: "claude_code", model: "claude-opus-4-7" } as never).kind).toBe("claude_code");
    expect(runtimeForConfig({ kind: "bedrock_anthropic", model_id: "anthropic.claude", region: "us-west-2" } as never).kind).toBe(
      "bedrock_anthropic"
    );
    expect(runtimeForConfig({ kind: "gemini", model: "gemini-2.5-pro", api_key: "key" } as never).kind).toBe("gemini");
  });

  test("function-calling harness executes tool calls until the model ends the turn", async () => {
    const model = vi
      .fn()
      .mockResolvedValueOnce({
        stopReason: "tool_use",
        message: { role: "assistant", content: [{ type: "tool_use", id: "1", name: "echo", input: { text: "hi" } }] }
      })
      .mockResolvedValueOnce({
        stopReason: "end_turn",
        message: { role: "assistant", content: [{ type: "text", text: "done" }] },
        usage: { inputTokens: 3, outputTokens: 5 }
      });
    const result = await runFunctionCallingLoop({
      prompt: "hello",
      issue: undefined as never,
      workspacePath: "/tmp/ws",
      signal: new AbortController().signal,
      tools: [
        {
          name: "echo",
          description: "echo",
          inputSchema: {},
          execute: vi.fn(async (args) => ({ success: true, output: JSON.stringify(args) }))
        }
      ],
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

    await expect(tools.find((tool) => tool.name === "write_file")?.execute({ path: "../escape.txt", content: "x" }, ctx)).rejects.toThrow(
      /workspace/i
    );
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
        {
          role: "assistant",
          content: [
            { type: "tool_use", id: "t1", name: "a", input: {} },
            { type: "tool_use", id: "t2", name: "b", input: {} }
          ]
        },
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

  describe("buildArgs (Claude Code CLI arg construction)", () => {
    test("includes base args for every invocation", () => {
      const args = buildArgs({ model: "claude-opus-4-7" }, "hello");
      expect(args).toEqual(expect.arrayContaining(["-p", "hello", "--output-format", "stream-json", "--verbose"]));
    });

    test("maps max_turns to --max-turns <n>", () => {
      const args = buildArgs({ max_turns: 10 }, "x");
      expect(args).toContain("--max-turns");
      expect(args[args.indexOf("--max-turns") + 1]).toBe("10");
    });

    test("maps allowed_tools to --allowedTools <comma-list>", () => {
      const args = buildArgs({ allowed_tools: ["Bash", "Read"] }, "x");
      expect(args).toContain("--allowedTools");
      expect(args[args.indexOf("--allowedTools") + 1]).toBe("Bash,Read");
    });

    test("maps disallowed_tools to --disallowedTools <comma-list>", () => {
      const args = buildArgs({ disallowed_tools: ["Write", "Edit"] }, "x");
      expect(args).toContain("--disallowedTools");
      expect(args[args.indexOf("--disallowedTools") + 1]).toBe("Write,Edit");
    });

    test("never adds --dangerously-skip-permissions for approval_policy auto", () => {
      expect(buildArgs({ approval_policy: "auto" }, "x")).not.toContain("--dangerously-skip-permissions");
    });

    test("omits --dangerously-skip-permissions when approval_policy is prompt", () => {
      expect(buildArgs({ approval_policy: "prompt" }, "x")).not.toContain("--dangerously-skip-permissions");
    });

    test("omits --dangerously-skip-permissions when approval_policy is reject", () => {
      expect(buildArgs({ approval_policy: "reject" }, "x")).not.toContain("--dangerously-skip-permissions");
    });

    test("omits --dangerously-skip-permissions when approval_policy is absent", () => {
      expect(buildArgs({}, "x")).not.toContain("--dangerously-skip-permissions");
    });

    test("uses default allowed-tools list when allowed_tools is absent", () => {
      const args = buildArgs({}, "prompt");
      expect(args).not.toContain("--max-turns");
      expect(args).not.toContain("--disallowedTools");
      expect(args).toContain("--allowedTools");
      const toolsArg = args[args.indexOf("--allowedTools") + 1];
      expect(toolsArg).toContain("Bash");
      expect(toolsArg).toContain("Read");
    });

    test("uses planning_model for planning and revision turns", () => {
      const planning = buildArgs({ model: "exec-model", planning_model: "plan-model" }, "prompt", { mode: "planning" });
      const revision = buildArgs({ model: "exec-model", planning_model: "plan-model" }, "prompt", { mode: "revision" });
      const execution = buildArgs({ model: "exec-model", planning_model: "plan-model" }, "prompt", { mode: "execution" });

      expect(planning[planning.indexOf("--model") + 1]).toBe("plan-model");
      expect(revision[revision.indexOf("--model") + 1]).toBe("plan-model");
      expect(execution[execution.indexOf("--model") + 1]).toBe("exec-model");
    });
  });

  test("Bedrock and Gemini choose planning_model only for planning-like turns", () => {
    expect(modelIdForTurn({ model_id: "bedrock-exec", planning_model: "bedrock-plan" }, "planning")).toBe("bedrock-plan");
    expect(modelIdForTurn({ model_id: "bedrock-exec", planning_model: "bedrock-plan" }, "revision")).toBe("bedrock-plan");
    expect(modelIdForTurn({ model_id: "bedrock-exec", planning_model: "bedrock-plan" }, "execution")).toBe("bedrock-exec");
    expect(modelForTurn({ model: "gemini-exec", planning_model: "gemini-plan" }, "planning")).toBe("gemini-plan");
    expect(modelForTurn({ model: "gemini-exec", planning_model: "gemini-plan" }, "implementation")).toBe("gemini-exec");
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

import { describe, expect, test, vi } from "vitest";
import { buildTools } from "../../src/tools/registry.js";
import { JiraRestTool } from "../../src/tools/jira-rest.js";
import { LinearGraphqlTool } from "../../src/tools/linear-graphql.js";
import { toCodexToolSpecs } from "../../src/tools/adapters/codex.js";
import { toClaudeToolSpecs } from "../../src/tools/adapters/claude-code.js";
import { toBedrockToolSpecs } from "../../src/tools/adapters/bedrock.js";
import { toGeminiToolSpecs } from "../../src/tools/adapters/gemini.js";

describe("SPEC 10.5 and integration tool contracts", () => {
  test("registers only enabled integration tools and preserves strict schemas across runtime adapters", () => {
    const tools = buildTools({
      tracker: {
        kind: "linear",
        endpoint: "https://linear",
        api_key: "token",
        project_slug: "SYM",
        active_states: ["Todo"],
        terminal_states: ["Done"]
      },
      integrations: {
        github: { enabled: true, token: "gh", default_repo: "openai/northstar" },
        slack: { enabled: false }
      }
    } as never);

    expect(tools.map((tool) => tool.name).sort()).toEqual(["github", "linear_graphql"]);
    expect(toCodexToolSpecs(tools)[0]).toHaveProperty("inputSchema");
    expect(toClaudeToolSpecs(tools)[0]).toHaveProperty("input_schema");
    expect(toBedrockToolSpecs(tools)[0]).toHaveProperty("toolSpec");
    expect(toGeminiToolSpecs(tools)[0]).toHaveProperty("functionDeclarations");
  });

  test("linear_graphql accepts string or object arguments and reports GraphQL errors as failed calls", async () => {
    const request = vi.fn(async () => ({ errors: [{ message: "bad" }] }));
    const tool = new LinearGraphqlTool({ endpoint: "https://linear", apiKey: "token", request });

    const result = await tool.execute("query { viewer { id } }", {
      issue: undefined as never,
      workspacePath: "/tmp/ws",
      signal: new AbortController().signal
    });

    expect(request).toHaveBeenCalledWith("query { viewer { id } }", {});
    expect(result.success).toBe(false);
    expect(result.output).toContain("bad");
  });

  test("jira_rest enforces method and path allowlists", async () => {
    const tool = new JiraRestTool({ baseUrl: "https://jira", email: "dev@example.com", apiToken: "token", request: vi.fn() });
    const ctx = { issue: undefined as never, workspacePath: "/tmp/ws", signal: new AbortController().signal };

    await expect(tool.execute({ method: "PATCH", path: "/rest/api/3/issue/SYM-1" }, ctx)).rejects.toThrow(/method/i);
    await expect(tool.execute({ method: "GET", path: "/wiki/rest/api/content" }, ctx)).rejects.toThrow(/path/i);
  });
});

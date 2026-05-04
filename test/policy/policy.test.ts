import { describe, expect, test } from "vitest";
import { filterToolsForIssue } from "../../src/policy/tools.js";
import { parseWorkflowConfig } from "../../src/workflow/schema.js";
import type { Tool } from "../../src/tools/types.js";
import type { Issue } from "../../src/tracker/issue.js";

const tools: Tool[] = ["github", "slack_post", "jira_rest", "linear_graphql"].map((name) => ({
  name,
  description: name,
  inputSchema: {},
  execute: async () => ({ success: true, output: "ok" })
}));

const issue = (labels: string[]): Issue => ({
  id: "1",
  identifier: "SYM-1",
  title: "Policy",
  description: null,
  priority: null,
  state: "Todo",
  branch_name: null,
  url: null,
  labels,
  blocked_by: [],
  created_at: null,
  updated_at: null
});

describe("tool policy", () => {
  test("applies global and label-specific allow and deny rules", () => {
    const config = parseWorkflowConfig({
      policy: {
        allowed_tools: ["github", "slack_post", "jira_rest"],
        disallowed_tools: ["slack_post"],
        allowed_tools_by_label: {
          security: ["jira_rest"]
        },
        disallowed_tools_by_label: {
          backend: ["github"]
        }
      }
    });

    expect(filterToolsForIssue(tools, config.policy, issue(["security", "backend"])).map((tool) => tool.name)).toEqual(["jira_rest"]);
  });
});

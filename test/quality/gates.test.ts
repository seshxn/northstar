import { describe, expect, test } from "vitest";
import { qualityGateSequenceForIssue, renderQualityGatePrompt } from "../../src/quality/gates.js";
import { parseWorkflowConfig } from "../../src/workflow/schema.js";
import type { Issue } from "../../src/tracker/issue.js";

const issue: Issue = {
  id: "1",
  identifier: "SYM-1",
  title: "Gate work",
  description: null,
  priority: null,
  state: "Todo",
  branch_name: null,
  url: null,
  labels: ["security"],
  blocked_by: [],
  created_at: null,
  updated_at: null
};

describe("quality gates", () => {
  test("resolves unique sequential gates and renders gate prompts", () => {
    const config = parseWorkflowConfig({
      quality_gates: {
        enabled: true,
        default_sequence: ["test", "review"],
        label_sequences: {
          security: ["security_review", "review"]
        }
      }
    });

    expect(qualityGateSequenceForIssue(config.quality_gates, issue)).toEqual(["test", "review", "security_review"]);
    expect(renderQualityGatePrompt("security_review", issue, "implementation output")).toContain("Quality gate: security_review");
    expect(renderQualityGatePrompt("security_review", issue, "implementation output")).toContain("implementation output");
  });
});

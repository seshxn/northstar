import { describe, expect, test } from "vitest";
import { renderSkillInstructions, skillSequenceForIssue } from "../../src/skills/profile.js";
import { parseWorkflowConfig } from "../../src/workflow/schema.js";
import type { Issue } from "../../src/tracker/issue.js";

const issue = (labels: string[]): Issue => ({
  id: "1",
  identifier: "SYM-1",
  title: "Secure endpoint",
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

describe("skill profiles", () => {
  test("parses prompt-injection skills config and resolves label-driven sequences", () => {
    const config = parseWorkflowConfig({
      skills: {
        enabled: true,
        default_sequence: ["spec", "plan", "tdd", "verify"],
        label_sequences: {
          security: ["threat_model", "security_review", "verify"],
          docs: ["documentation"]
        }
      }
    });

    expect(config.skills.enabled).toBe(true);
    expect(skillSequenceForIssue(config.skills, issue(["security", "backend"]))).toEqual([
      "spec",
      "plan",
      "tdd",
      "verify",
      "threat_model",
      "security_review"
    ]);
  });

  test("renders concise instructions for known and unknown skill names", () => {
    expect(renderSkillInstructions(["spec", "tdd", "systematic_debugging", "custom_gate"])).toContain("write or confirm a short spec");
    expect(renderSkillInstructions(["spec", "tdd", "systematic_debugging", "custom_gate"])).toContain("test-driven development");
    expect(renderSkillInstructions(["spec", "tdd", "systematic_debugging", "custom_gate"])).toContain("custom_gate");
  });
});

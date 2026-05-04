import { describe, expect, test } from "vitest";
import { assembleIssueContext } from "../../src/context/assembler.js";
import type { Issue } from "../../src/tracker/issue.js";

const baseIssue: Issue = {
  id: "1",
  identifier: "SYM-1",
  title: "Add run loop",
  description: "Wire the orchestrator end to end.",
  priority: 1,
  state: "Todo",
  branch_name: "sesh/sym-1",
  url: "https://linear.app/acme/issue/SYM-1",
  labels: ["backend", "orchestration"],
  blocked_by: [{ id: "0", identifier: "SYM-0", state: "Done" }],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z"
};

describe("context assembler", () => {
  test("builds a compact issue context with blockers, skills, and previous result", () => {
    const context = assembleIssueContext({
      issue: baseIssue,
      skillSequence: ["spec", "tdd"],
      previousResult: {
        status: "failed",
        output: "unit test failed"
      }
    });

    expect(context).toContain("SYM-1: Add run loop");
    expect(context).toContain("Labels: backend, orchestration");
    expect(context).toContain("Blocked by: SYM-0 (Done)");
    expect(context).toContain("Requested skill gates: spec, tdd");
    expect(context).toContain("Previous run: failed");
    expect(context).toContain("unit test failed");
  });
});

import { describe, expect, test } from "vitest";
import { normalizeDependencyResults } from "../../src/orchestrator/sequencer.js";
import type { Issue } from "../../src/tracker/issue.js";

const issue = (id: string, identifier: string): Issue => ({
  id,
  identifier,
  title: identifier,
  description: null,
  priority: null,
  state: "Ready",
  branch_name: null,
  url: null,
  labels: [],
  blocked_by: [],
  created_at: null,
  updated_at: null
});

describe("dependency sequencer normalization", () => {
  test("keeps only dependencies that reference visible issues", () => {
    expect(
      normalizeDependencyResults([issue("1", "SYM-1"), issue("2", "SYM-2")], [
        { issueId: "1", blockedBy: ["SYM-2", "missing"] },
        { issueId: "missing", blockedBy: ["SYM-1"] }
      ])
    ).toEqual([{ issueId: "1", blockedBy: ["SYM-2"] }]);
  });
});

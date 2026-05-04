import { describe, expect, test } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("SPEC 17.7 CLI", () => {
  test("accepts positional WORKFLOW.md path and --port", () => {
    expect(parseCliArgs(["node", "northstar", "custom/WORKFLOW.md", "--port", "4567"])).toMatchObject({
      workflowPath: "custom/WORKFLOW.md",
      port: 4567
    });
  });
});

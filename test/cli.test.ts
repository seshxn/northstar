import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { parseCliArgs } from "../src/cli.js";

describe("SPEC 17.7 CLI", () => {
  test("accepts positional WORKFLOW.md path and --port", () => {
    expect(parseCliArgs(["node", "northstar", "custom/WORKFLOW.md", "--port", "4567"])).toMatchObject({
      workflowPath: "custom/WORKFLOW.md",
      port: 4567
    });
  });

  test("prints help with a zero exit status", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "--help"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: northstar");
    expect(result.stderr).toBe("");
  });
});

import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { formatCliError, parseCliArgs } from "../src/cli.js";
import { parseWorkflowConfig } from "../src/workflow/schema.js";

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

  test("formats workflow validation errors with actionable field paths", () => {
    let error: unknown;
    try {
      parseWorkflowConfig({
        tracker: {
          kind: "jira",
          endpoint: "https://acme.atlassian.net",
          project_key: "SYM"
        }
      });
    } catch (caught) {
      error = caught;
    }

    const message = formatCliError(error);

    expect(message).toContain("Invalid workflow configuration");
    expect(message).toContain("tracker.email is required");
    expect(message).toContain("tracker.api_token is required");
    expect(message).toContain("Set the referenced environment variables");
  });
});

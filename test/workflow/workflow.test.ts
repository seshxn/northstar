import { describe, expect, test, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadWorkflowFile } from "../../src/workflow/loader.js";
import { parseWorkflowConfig } from "../../src/workflow/schema.js";
import { renderPrompt } from "../../src/workflow/prompt.js";

describe("SPEC 17.1 workflow loading and config", () => {
  test("parses YAML front matter and rewrites legacy codex config to runtime codex_app_server", async () => {
    const dir = await mkdtemp(join(tmpdir(), "northstar-workflow-"));
    const workflowPath = join(dir, "WORKFLOW.md");
    await writeFile(
      workflowPath,
      [
        "---",
        "tracker:",
        "  kind: linear",
        "  project_slug: SYM",
        "codex:",
        "  command: codex app-server --json",
        "workspace:",
        "  root: ~/northstar-ts-test",
        "---",
        "Implement {{ issue.identifier }}: {{ issue.title }}"
      ].join("\n")
    );

    const workflow = await loadWorkflowFile(workflowPath);
    const config = parseWorkflowConfig(workflow.config, { env: {}, homeDir: "/home/tester" });

    expect(workflow.promptTemplate).toBe("Implement {{ issue.identifier }}: {{ issue.title }}");
    expect(config.runtime.kind).toBe("codex_app_server");
    if (config.runtime.kind !== "codex_app_server") throw new Error("expected codex runtime");
    expect(config.runtime.command).toBe("codex app-server --json");
    expect(config.workspace.root).toBe("/home/tester/northstar-ts-test");
  });

  test("resolves $VAR indirection without printing secrets and validates Jira tracker credentials", () => {
    const config = parseWorkflowConfig(
      {
        tracker: {
          kind: "jira",
          endpoint: "https://acme.atlassian.net",
          email: "$JIRA_EMAIL",
          api_token: "$JIRA_API_TOKEN",
          project_key: "SYM"
        }
      },
      {
        env: { JIRA_EMAIL: "dev@example.com", JIRA_API_TOKEN: "secret-token" },
        homeDir: "/home/tester"
      }
    );

    expect(config.tracker.kind).toBe("jira");
    if (config.tracker.kind !== "jira") throw new Error("expected jira tracker");
    expect(config.tracker.email).toBe("dev@example.com");
    expect(config.tracker.api_token).toBe("secret-token");
  });

  test("renders Liquid prompts strictly and exposes normalized issue fields", async () => {
    const prompt = await renderPrompt("Ship {{ issue.identifier }} / {{ issue.labels[0] }}", {
      issue: {
        id: "1",
        identifier: "SYM-1",
        title: "Port",
        description: null,
        priority: 1,
        state: "Todo",
        branch_name: null,
        url: null,
        labels: ["backend"],
        blocked_by: [],
        created_at: null,
        updated_at: null
      }
    });

    expect(prompt).toBe("Ship SYM-1 / backend");
    await expect(renderPrompt("{{ missing.value }}", { issue: {} })).rejects.toThrow(/missing/i);
  });

  test("parses optional prompt-level skill profiles", () => {
    const config = parseWorkflowConfig({
      skills: {
        enabled: true,
        mode: "prompt_injection",
        default_sequence: ["spec", "plan"],
        label_sequences: {
          security: ["threat_model", "security_review"]
        }
      }
    });

    expect(config.skills).toEqual({
      enabled: true,
      mode: "prompt_injection",
      default_sequence: ["spec", "plan"],
      label_sequences: {
        security: ["threat_model", "security_review"]
      }
    });
  });

  test("parses optional policy and feedback config", () => {
    const config = parseWorkflowConfig({
      policy: {
        allowed_tools: ["github"],
        disallowed_tools_by_label: { docs: ["slack_post"] }
      },
      feedback: {
        comments_enabled: false,
        transitions: {
          completed_state: "Review"
        }
      }
    });

    expect(config.policy.allowed_tools).toEqual(["github"]);
    expect(config.policy.disallowed_tools_by_label).toEqual({ docs: ["slack_post"] });
    expect(config.feedback).toEqual({
      comments_enabled: false,
      transitions: {
        started_state: undefined,
        completed_state: "Review",
        failed_state: undefined
      }
    });
  });

  test("parses optional sequential quality gates", () => {
    const config = parseWorkflowConfig({
      quality_gates: {
        enabled: true,
        default_sequence: ["test", "review"],
        label_sequences: {
          security: ["security_review"]
        }
      }
    });

    expect(config.quality_gates).toEqual({
      enabled: true,
      mode: "sequential",
      default_sequence: ["test", "review"],
      label_sequences: {
        security: ["security_review"]
      }
    });
  });

  test("parses optional human approval gates", () => {
    const config = parseWorkflowConfig({
      approval_gates: {
        enabled: true,
        labels: ["High-Risk"],
        awaiting_state: "Awaiting Review",
        approval_trigger: "/shipit",
        rejection_trigger: "/nope",
        revision_trigger: "/change",
        approvers: ["lead@example.com"]
      }
    });

    expect(config.approval_gates).toEqual({
      enabled: true,
      labels: ["high-risk"],
      awaiting_state: "Awaiting Review",
      approval_trigger: "/shipit",
      rejection_trigger: "/nope",
      revision_trigger: "/change",
      approvers: ["lead@example.com"]
    });
  });
});

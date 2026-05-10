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

  test("parses optional board columns", () => {
    const config = parseWorkflowConfig({
      board: {
        columns: [
          {
            id: "ready",
            title: "Ready",
            tracker_states: ["Ready for Agent"],
            starts_agent: true
          },
          {
            id: "human-review",
            title: "Human Review",
            runtime_states: ["awaiting_review"],
            accepts_manual_moves: false
          }
        ]
      }
    });

    expect(config.board.columns).toEqual([
      {
        id: "ready",
        title: "Ready",
        tracker_states: ["Ready for Agent"],
        runtime_states: [],
        starts_agent: true,
        accepts_manual_moves: undefined
      },
      {
        id: "human-review",
        title: "Human Review",
        tracker_states: [],
        runtime_states: ["awaiting_review"],
        starts_agent: false,
        accepts_manual_moves: false
      }
    ]);
  });

  test("parses optional dispatch policy config", () => {
    const config = parseWorkflowConfig({
      dispatch: {
        mode: "tracker_states",
        states: ["In Progress"],
        require_unblocked: true,
        require_ready_label: true,
        ready_labels: ["ready-for-agent"],
        blocked_labels: ["blocked", "needs-human"]
      }
    });

    expect(config.dispatch).toEqual({
      mode: "tracker_states",
      states: ["In Progress"],
      require_unblocked: true,
      require_ready_label: true,
      ready_labels: ["ready-for-agent"],
      blocked_labels: ["blocked", "needs-human"]
    });
  });

  test("parses server auth guard config", () => {
    const config = parseWorkflowConfig(
      {
        server: {
          port: 7331,
          host: "0.0.0.0",
          auth_token: "$NORTHSTAR_DASHBOARD_TOKEN"
        }
      },
      { env: { NORTHSTAR_DASHBOARD_TOKEN: "dashboard-secret" } }
    );

    expect(config.server).toEqual({
      port: 7331,
      host: "0.0.0.0",
      auth_token: "dashboard-secret",
      allow_unauthenticated_remote: false
    });
  });

  test("parses repository workspace strategy config", () => {
    const config = parseWorkflowConfig(
      {
        workspace: {
          root: "~/northstar-workspaces",
          strategy: "git_worktree",
          repo: "~/repo",
          base_branch: "develop",
          branch_template: "northstar/{{ issue.identifier | downcase }}-{{ issue.title | slug }}",
          reuse_existing: false,
          cleanup: {
            remove_after_pr_merge: true
          }
        }
      },
      { homeDir: "/home/dev" }
    );

    expect(config.workspace).toEqual({
      root: "/home/dev/northstar-workspaces",
      strategy: "git_worktree",
      repo: "/home/dev/repo",
      base_branch: "develop",
      branch_template: "northstar/{{ issue.identifier | downcase }}-{{ issue.title | slug }}",
      reuse_existing: false,
      cleanup: {
        remove_after_pr_merge: true
      }
    });
  });

  test("parses optional local storage config", () => {
    const config = parseWorkflowConfig(
      {
        storage: {
          kind: "json",
          path: "~/northstar/state.json",
          retention_days: 14
        }
      },
      { homeDir: "/home/dev" }
    );

    expect(config.storage).toEqual({
      kind: "json",
      path: "/home/dev/northstar/state.json",
      retention_days: 14
    });
  });

  test("parses optional sequencing config", () => {
    const config = parseWorkflowConfig({
      sequencing: {
        enabled: true,
        mode: "block_dispatch",
        scan_on_refresh: true,
        write_tracker_relationships: false
      }
    });

    expect(config.sequencing).toEqual({
      enabled: true,
      mode: "block_dispatch",
      scan_on_refresh: true,
      write_tracker_relationships: false
    });
  });

  test("parses optional pull request handoff config", () => {
    const config = parseWorkflowConfig(
      {
        pull_request: {
          enabled: true,
          provider: "github",
          repo: "owner/repo",
          token: "$GITHUB_TOKEN",
          base_branch: "develop",
          draft: false,
          labels: ["northstar"],
          labels_by_issue_label: {
            security: ["security-review-required"]
          },
          reviewers: ["lead"],
          title_template: "{{ issue.identifier }}: {{ issue.title }}",
          body_template: "Plan\n{{ northstar.approved_plan }}"
        }
      },
      {
        env: { GITHUB_TOKEN: "gh-token" }
      }
    );

    expect(config.pull_request).toEqual({
      enabled: true,
      provider: "github",
      repo: "owner/repo",
      token: "gh-token",
      base_branch: "develop",
      draft: false,
      labels: ["northstar"],
      labels_by_issue_label: {
        security: ["security-review-required"]
      },
      reviewers: ["lead"],
      title_template: "{{ issue.identifier }}: {{ issue.title }}",
      body_template: "Plan\n{{ northstar.approved_plan }}"
    });
  });

  test("parses planning models for model-backed runtimes", () => {
    const claude = parseWorkflowConfig({
      runtime: {
        kind: "claude_code",
        model: "claude-sonnet-exec",
        planning_model: "claude-opus-plan"
      }
    });
    expect(claude.runtime).toMatchObject({
      kind: "claude_code",
      model: "claude-sonnet-exec",
      planning_model: "claude-opus-plan"
    });

    const bedrock = parseWorkflowConfig({
      runtime: {
        kind: "bedrock_anthropic",
        model_id: "anthropic.claude-sonnet-exec",
        planning_model: "anthropic.claude-opus-plan"
      }
    });
    expect(bedrock.runtime).toMatchObject({
      kind: "bedrock_anthropic",
      model_id: "anthropic.claude-sonnet-exec",
      planning_model: "anthropic.claude-opus-plan"
    });

    const gemini = parseWorkflowConfig({
      runtime: {
        kind: "gemini",
        model: "gemini-exec",
        planning_model: "gemini-plan"
      }
    });
    expect(gemini.runtime).toMatchObject({
      kind: "gemini",
      model: "gemini-exec",
      planning_model: "gemini-plan"
    });
  });
});

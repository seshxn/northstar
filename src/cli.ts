#!/usr/bin/env node
import { Command } from "commander";
import { ZodError, type ZodIssue } from "zod";
import { loadWorkflowFile } from "./workflow/loader.js";
import { parseWorkflowConfig } from "./workflow/schema.js";
import { watchWorkflow } from "./workflow/watch.js";
import { trackerForConfig } from "./tracker/registry.js";
import { runtimeForConfig } from "./runtime/registry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { OrchestratorService } from "./orchestrator/service.js";
import { createHttpServer } from "./observability/http.js";
import type { SettingsSnapshot, SettingsPatch } from "./observability/http.js";
import { boardColumnsForConfig, trackerStatesForBoard } from "./board/columns.js";
import { buildBoardSnapshot } from "./board/snapshot.js";
import { GitHubPullRequestClient, pullRequestLabels } from "./github/pr.js";

export interface CliArgs {
  workflowPath: string;
  port?: number;
}

export const parseCliArgs = (argv: string[]): CliArgs => {
  const program = new Command();
  program
    .name("northstar")
    .argument("[workflow]", "path to WORKFLOW.md", "WORKFLOW.md")
    .option("--port <port>", "HTTP status server port", (value) => Number(value));
  program.exitOverride();
  program.parse(argv);
  return { workflowPath: program.args[0] ?? "WORKFLOW.md", port: program.opts<{ port?: number }>().port };
};

export const main = async (argv = process.argv): Promise<void> => {
  const args = parseCliArgs(argv);
  const workflow = await loadWorkflowFile(args.workflowPath);
  const config = parseWorkflowConfig(workflow.config);
  if (args.port != null) config.server.port = args.port;
  const tracker = trackerForConfig(config);
  const orchestrator = new Orchestrator(config, tracker, runtimeForConfig(config.runtime), workflow.promptTemplate);
  const service = new OrchestratorService(orchestrator);
  const boardColumns = boardColumnsForConfig(config);
  const prClient = pullRequestClientForConfig(config);
  const app = createHttpServer({
    getState: () => orchestrator.state,
    getBoardSnapshot: async () =>
      buildBoardSnapshot({
        columns: boardColumns,
        issues: await tracker.fetchIssuesByStates(trackerStatesForBoard(boardColumns)),
        state: orchestrator.state,
        detectedDependencies: orchestrator.state.detectedDependencies
      }),
    getSettings: () => settingsForConfig(config),
    refresh: () => service.refresh(),
    stopIssue: (identifier) => orchestrator.stopIssue(identifier),
    retryIssue: (identifier) => orchestrator.retryIssue(identifier),
    approveIssue: (identifier) => orchestrator.approveIssue(identifier),
    feedbackIssue: (identifier, message) => orchestrator.feedbackIssue(identifier, message),
    rejectIssue: (identifier, message) => orchestrator.rejectIssue(identifier, message),
    moveIssue: async (identifier, state) => {
      if (!tracker.updateIssueState) return false;
      await tracker.updateIssueState(identifier, state);
      return true;
    },
    commentIssue: async (identifier, body) => {
      if (!tracker.createComment) return false;
      try {
        await tracker.createComment(identifier, body);
        return true;
      } catch {
        return false;
      }
    },
    scanDependencies: () => orchestrator.scanDependencies(),
    updateSettings: (patch: SettingsPatch) => {
      if (patch.runtime?.executionModel !== undefined && config.runtime.kind === "claude_code") {
        (config.runtime as Record<string, unknown>).model = patch.runtime.executionModel;
      }
      if (patch.runtime?.planningModel !== undefined && config.runtime.kind === "claude_code") {
        (config.runtime as Record<string, unknown>).planning_model = patch.runtime.planningModel;
      }
      if (patch.tracker?.jql !== undefined && config.tracker.kind === "jira") {
        (config.tracker as Record<string, unknown>).jql = patch.tracker.jql;
      }
    },
    createPullRequest: async (identifier, input) => {
      if (!prClient || !config.pull_request.enabled) return null;
      const [issue] = await tracker.fetchIssueStatesByIds([identifier]);
      const labels = pullRequestLabels(
        [...config.pull_request.labels, ...(input.labels ?? [])],
        config.pull_request.labels_by_issue_label,
        issue?.labels ?? []
      );
      return prClient.ensurePullRequest({
        head: input.head,
        base: input.base ?? config.pull_request.base_branch,
        title: input.title ?? (issue ? `${issue.identifier}: ${issue.title}` : identifier),
        body: input.body ?? "",
        draft: input.draft ?? config.pull_request.draft,
        labels,
        reviewers: input.reviewers ?? config.pull_request.reviewers
      });
    }
  });
  if (config.server.port != null) {
    await app.listen({ host: config.server.host, port: config.server.port });
    console.log(`Northstar running — dashboard: http://${config.server.host}:${config.server.port}/`);
    console.log(`Tracker: ${config.tracker.kind}  Runtime: ${config.runtime.kind}  Poll: ${config.polling.interval_ms}ms`);
    const watcher = watchWorkflow(args.workflowPath, (reloaded) => {
      orchestrator.setPromptTemplate(reloaded.promptTemplate);
      console.log(`Workflow reloaded from ${args.workflowPath}`);
    });
    try {
      await service.start();
    } finally {
      await watcher.close();
    }
  } else {
    await service.refresh();
    await orchestrator.waitForIdle();
  }
};

const settingsForConfig = (config: ReturnType<typeof parseWorkflowConfig>): SettingsSnapshot => {
  const { runtime } = config;
  let runtimeSnapshot: SettingsSnapshot["runtime"];
  if (runtime.kind === "claude_code") {
    runtimeSnapshot = {
      kind: runtime.kind,
      executionModel: runtime.model ?? null,
      planningModel: runtime.planning_model ?? runtime.model ?? null
    };
  } else if (runtime.kind === "bedrock_anthropic") {
    runtimeSnapshot = { kind: runtime.kind, executionModel: runtime.model_id, planningModel: runtime.planning_model ?? runtime.model_id };
  } else if (runtime.kind === "gemini") {
    runtimeSnapshot = {
      kind: runtime.kind,
      executionModel: runtime.model ?? null,
      planningModel: runtime.planning_model ?? runtime.model ?? null
    };
  } else {
    runtimeSnapshot = { kind: runtime.kind, executionModel: null, planningModel: null };
  }
  const { tracker } = config;
  return {
    runtime: runtimeSnapshot,
    tracker: {
      kind: tracker.kind,
      jql: "jql" in tracker ? (tracker.jql ?? null) : null,
      project_key: "project_key" in tracker ? (tracker.project_key ?? null) : null,
      active_states: tracker.active_states
    }
  };
};

export const handleCliError = (error: unknown): void => {
  if (isCommanderExpectedExit(error)) {
    process.exitCode = 0;
    return;
  }
  console.error(formatCliError(error));
  process.exitCode = 1;
};

export const formatCliError = (error: unknown): string => {
  if (error instanceof ZodError) return formatWorkflowValidationError(error);
  return error instanceof Error ? error.message : String(error);
};

const isCommanderExpectedExit = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; exitCode?: unknown };
  return typeof record.code === "string" && record.code.startsWith("commander.") && record.exitCode === 0;
};

const formatWorkflowValidationError = (error: ZodError): string => {
  const issues = flattenZodIssues(error);
  const required = issues.filter((issue) => issue.code === "invalid_type" && "received" in issue && issue.received === "undefined");
  const selected = required.length > 0 ? required : issues;
  const lines = selected.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "workflow";
    if (issue.code === "invalid_type" && "received" in issue && issue.received === "undefined") return `- ${path} is required`;
    return `- ${path}: ${issue.message}`;
  });
  return [
    "Invalid workflow configuration.",
    ...dedupe(lines),
    "Set the referenced environment variables or edit WORKFLOW.md, then rerun the command."
  ].join("\n");
};

const flattenZodIssues = (error: ZodError): ZodIssue[] =>
  error.issues.flatMap((issue) => {
    if (issue.code === "invalid_union") return issue.unionErrors.flatMap((unionError) => flattenZodIssues(unionError));
    return [issue];
  });

const dedupe = (values: string[]): string[] => [...new Set(values)];

const pullRequestClientForConfig = (config: ReturnType<typeof parseWorkflowConfig>): GitHubPullRequestClient | null => {
  const repo =
    config.pull_request.repo ??
    config.integrations.github?.default_repo ??
    (config.tracker.kind === "github" ? config.tracker.repo : undefined);
  if (!repo) return null;
  const token =
    config.pull_request.token ?? config.integrations.github?.token ?? (config.tracker.kind === "github" ? config.tracker.token : undefined);
  return new GitHubPullRequestClient({ repo, token });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(handleCliError);
}

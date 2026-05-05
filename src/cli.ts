#!/usr/bin/env node
import { Command } from "commander";
import { ZodError, type ZodIssue } from "zod";
import { loadWorkflowFile } from "./workflow/loader.js";
import { parseWorkflowConfig } from "./workflow/schema.js";
import { trackerForConfig } from "./tracker/registry.js";
import { runtimeForConfig } from "./runtime/registry.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { OrchestratorService } from "./orchestrator/service.js";
import { createHttpServer } from "./observability/http.js";

export interface CliArgs {
  workflowPath: string;
  port?: number;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const program = new Command();
  program
    .name("northstar")
    .argument("[workflow]", "path to WORKFLOW.md", "WORKFLOW.md")
    .option("--port <port>", "HTTP status server port", (value) => Number(value));
  program.exitOverride();
  program.parse(argv);
  return { workflowPath: program.args[0] ?? "WORKFLOW.md", port: program.opts<{ port?: number }>().port };
}

export async function main(argv = process.argv): Promise<void> {
  const args = parseCliArgs(argv);
  const workflow = await loadWorkflowFile(args.workflowPath);
  const config = parseWorkflowConfig(workflow.config);
  if (args.port != null) config.server.port = args.port;
  const orchestrator = new Orchestrator(config, trackerForConfig(config), runtimeForConfig(config.runtime), workflow.promptTemplate);
  const service = new OrchestratorService(orchestrator);
  const app = createHttpServer({
    getState: () => orchestrator.state,
    refresh: () => service.refresh(),
    stopIssue: (identifier) => orchestrator.stopIssue(identifier),
    retryIssue: (identifier) => orchestrator.retryIssue(identifier)
  });
  if (config.server.port != null) {
    await app.listen({ host: config.server.host, port: config.server.port });
    await service.start();
  } else {
    await service.refresh();
    await orchestrator.waitForIdle();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(handleCliError);
}

export function handleCliError(error: unknown): void {
  if (isCommanderExpectedExit(error)) {
    process.exitCode = 0;
    return;
  }
  console.error(formatCliError(error));
  process.exitCode = 1;
}

export function formatCliError(error: unknown): string {
  if (error instanceof ZodError) return formatWorkflowValidationError(error);
  return error instanceof Error ? error.message : String(error);
}

function isCommanderExpectedExit(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; exitCode?: unknown };
  return typeof record.code === "string" && record.code.startsWith("commander.") && record.exitCode === 0;
}

function formatWorkflowValidationError(error: ZodError): string {
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
}

function flattenZodIssues(error: ZodError): ZodIssue[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === "invalid_union") return issue.unionErrors.flatMap((unionError) => flattenZodIssues(unionError));
    return [issue];
  });
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

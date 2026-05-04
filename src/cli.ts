#!/usr/bin/env node
import { Command } from "commander";
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
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

function isCommanderExpectedExit(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; exitCode?: unknown };
  return typeof record.code === "string" && record.code.startsWith("commander.") && record.exitCode === 0;
}

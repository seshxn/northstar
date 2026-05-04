import { readFile } from "node:fs/promises";
import YAML from "yaml";

export interface WorkflowDefinition {
  config: Record<string, unknown>;
  promptTemplate: string;
}

export async function loadWorkflowFile(path: string): Promise<WorkflowDefinition> {
  return parseWorkflow(await readFile(path, "utf8"));
}

export function parseWorkflow(source: string): WorkflowDefinition {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { config: {}, promptTemplate: normalized.trim() };
  }
  const config = YAML.parse(match[1]) ?? {};
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("workflow front matter must decode to a map");
  }
  return { config: config as Record<string, unknown>, promptTemplate: match[2].trim() };
}

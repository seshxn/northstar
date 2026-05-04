import type { Tool } from "../types.js";

export function toClaudeToolSpecs(tools: Tool[]) {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }));
}

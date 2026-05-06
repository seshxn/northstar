import type { Tool } from "../types.js";

export const toClaudeToolSpecs = (tools: Tool[]) =>
  tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }));

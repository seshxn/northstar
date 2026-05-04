import type { Tool } from "../types.js";

export function toCodexToolSpecs(tools: Tool[]) {
  return tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
}

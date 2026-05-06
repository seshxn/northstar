import type { Tool } from "../types.js";

export const toCodexToolSpecs = (tools: Tool[]) =>
  tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));

import type { Tool } from "../types.js";

export const toBedrockToolSpecs = (tools: Tool[]) =>
  tools.map((tool) => ({ toolSpec: { name: tool.name, description: tool.description, inputSchema: { json: tool.inputSchema } } }));

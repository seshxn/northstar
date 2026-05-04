import type { Tool } from "../types.js";

export function toBedrockToolSpecs(tools: Tool[]) {
  return tools.map((tool) => ({ toolSpec: { name: tool.name, description: tool.description, inputSchema: { json: tool.inputSchema } } }));
}

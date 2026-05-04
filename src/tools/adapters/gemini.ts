import type { Tool } from "../types.js";

export function toGeminiToolSpecs(tools: Tool[]) {
  return [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) }];
}

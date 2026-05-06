import type { Tool } from "../types.js";

export const toGeminiToolSpecs = (tools: Tool[]) => [
  { functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) }
];

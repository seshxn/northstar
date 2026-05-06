import type { Issue } from "../tracker/issue.js";

export interface ToolContext {
  issue: Issue;
  workspacePath: string;
  signal: AbortSignal;
}

export interface ToolResult {
  success: boolean;
  output: string;
  contentItems?: Array<Record<string, unknown>>;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export const jsonResult = (payload: unknown, success = true): ToolResult => {
  const output = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { success, output, contentItems: [{ type: "inputText", text: output }] };
};

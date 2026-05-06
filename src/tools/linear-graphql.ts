import type { Tool, ToolContext, ToolResult } from "./types.js";
import { jsonResult } from "./types.js";

export type LinearRequest = (query: string, variables: Record<string, unknown>) => Promise<unknown>;

export class LinearGraphqlTool implements Tool {
  readonly name = "linear_graphql";
  readonly description = "Execute a raw GraphQL query or mutation against Linear using Northstar's configured auth.";
  readonly inputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string", description: "GraphQL query or mutation document to execute against Linear." },
      variables: { type: ["object", "null"], additionalProperties: true }
    }
  };

  constructor(private readonly opts: { endpoint: string; apiKey?: string; request?: LinearRequest }) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const { query, variables } = normalizeArgs(args);
    const response = await (this.opts.request ?? this.defaultRequest.bind(this))(query, variables);
    const hasErrors = Boolean(
      response &&
      typeof response === "object" &&
      Array.isArray((response as { errors?: unknown[] }).errors) &&
      (response as { errors?: unknown[] }).errors!.length > 0
    );
    return jsonResult(response, !hasErrors);
  }

  private async defaultRequest(query: string, variables: Record<string, unknown>): Promise<unknown> {
    if (!this.opts.apiKey) throw new Error("missing Linear API token");
    const response = await fetch(this.opts.endpoint, {
      method: "POST",
      headers: { authorization: this.opts.apiKey, "content-type": "application/json" },
      body: JSON.stringify({ query, variables })
    });
    if (!response.ok) throw new Error(`Linear GraphQL request failed with HTTP ${response.status}`);
    return response.json();
  }
}

const normalizeArgs = (args: unknown): { query: string; variables: Record<string, unknown> } => {
  if (typeof args === "string" && args.trim()) return { query: args.trim(), variables: {} };
  if (!args || typeof args !== "object") throw new Error("linear_graphql expects a query string or object");
  const record = args as Record<string, unknown>;
  if (typeof record.query !== "string" || !record.query.trim()) throw new Error("linear_graphql requires query");
  if (record.variables != null && (typeof record.variables !== "object" || Array.isArray(record.variables))) {
    throw new Error("linear_graphql variables must be an object");
  }
  return { query: record.query.trim(), variables: (record.variables as Record<string, unknown> | undefined) ?? {} };
};

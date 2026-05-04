import type { Tool, ToolContext, ToolResult } from "./types.js";
import { jsonResult } from "./types.js";

type JiraRequest = (path: string, init: RequestInit) => Promise<unknown>;
const allowedMethods = new Set(["GET", "POST", "PUT", "DELETE"]);

export class JiraRestTool implements Tool {
  readonly name = "jira_rest";
  readonly description = "Execute an allowlisted Jira Cloud REST v3 request.";
  readonly inputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["method", "path"],
    properties: {
      method: { enum: [...allowedMethods] },
      path: { type: "string" },
      query: { type: "object", additionalProperties: true },
      body: {}
    }
  };

  constructor(private readonly opts: { baseUrl: string; email?: string; apiToken?: string; request?: JiraRequest }) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    if (!args || typeof args !== "object") throw new Error("jira_rest expects an object");
    const { method, path, query, body } = args as Record<string, unknown>;
    const normalizedMethod = String(method ?? "").toUpperCase();
    if (!allowedMethods.has(normalizedMethod)) throw new Error(`jira_rest method not allowed: ${method}`);
    if (typeof path !== "string" || !path.startsWith("/rest/api/3/")) throw new Error("jira_rest path must start with /rest/api/3/");
    const url = appendQuery(path, query);
    const result = await (this.opts.request ?? this.defaultRequest.bind(this))(url, {
      method: normalizedMethod,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return jsonResult(result);
  }

  private async defaultRequest(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(new URL(path, this.opts.baseUrl), init);
    if (!response.ok) throw new Error(`Jira request failed with HTTP ${response.status}`);
    return response.json();
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (this.opts.email && this.opts.apiToken) headers.authorization = `Basic ${Buffer.from(`${this.opts.email}:${this.opts.apiToken}`).toString("base64")}`;
    return headers;
  }
}

function appendQuery(path: string, query: unknown): string {
  if (!query || typeof query !== "object" || Array.isArray(query)) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null) params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

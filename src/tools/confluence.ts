import type { Tool, ToolContext, ToolResult } from "./types.js";
import { jsonResult } from "./types.js";

type ConfluenceRequest = (path: string, init: RequestInit) => Promise<unknown>;

export class ConfluencePageTool implements Tool {
  readonly name = "confluence_page";
  readonly description = "Get, create, update, or search Confluence pages.";
  readonly inputSchema = { type: "object", required: ["op"], additionalProperties: true };

  constructor(
    private readonly opts: { baseUrl: string; email?: string; apiToken?: string; defaultSpace?: string; request?: ConfluenceRequest }
  ) {}

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    if (!args || typeof args !== "object") throw new Error("confluence_page expects an object");
    const input = args as Record<string, unknown>;
    const request = this.opts.request ?? this.defaultRequest.bind(this);
    switch (input.op) {
      case "get":
        return jsonResult(await request(`/api/v2/pages/${input.id}`, { method: "GET", headers: this.headers() }));
      case "search":
        return jsonResult(
          await request(`/wiki/rest/api/search?cql=${encodeURIComponent(String(input.cql ?? ""))}`, {
            method: "GET",
            headers: this.headers()
          })
        );
      case "create":
        return jsonResult(
          await request("/api/v2/pages", {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ spaceId: input.spaceId ?? this.opts.defaultSpace, title: input.title, body: input.body })
          })
        );
      case "update":
        return jsonResult(
          await request(`/api/v2/pages/${input.id}`, { method: "PUT", headers: this.headers(), body: JSON.stringify(input.page ?? input) })
        );
      default:
        throw new Error(`unsupported confluence op: ${String(input.op)}`);
    }
  }

  private async defaultRequest(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(new URL(path, this.opts.baseUrl), init);
    if (!response.ok) throw new Error(`Confluence request failed with HTTP ${response.status}`);
    return response.json();
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (this.opts.email && this.opts.apiToken)
      headers.authorization = `Basic ${Buffer.from(`${this.opts.email}:${this.opts.apiToken}`).toString("base64")}`;
    return headers;
  }
}

import { WebClient } from "@slack/web-api";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { jsonResult } from "./types.js";

export class SlackPostTool implements Tool {
  readonly name = "slack_post";
  readonly description = "Post or update a Slack message.";
  readonly inputSchema = { type: "object", required: ["text"], additionalProperties: true };
  private readonly client?: WebClient;

  constructor(private readonly opts: { token?: string; defaultChannel?: string; client?: WebClient }) {
    this.client = opts.client ?? (opts.token ? new WebClient(opts.token) : undefined);
  }

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    if (!args || typeof args !== "object") throw new Error("slack_post expects an object");
    if (!this.client) throw new Error("Slack token missing");
    const input = args as Record<string, unknown>;
    const channel = String(input.channel ?? this.opts.defaultChannel ?? "");
    if (!channel) throw new Error("slack_post requires channel");
    return jsonResult(
      await this.client.chat.postMessage({
        channel,
        text: String(input.text),
        thread_ts: input.thread_ts as string | undefined,
        blocks: input.blocks as never
      })
    );
  }
}

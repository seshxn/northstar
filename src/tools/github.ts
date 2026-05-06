import { Octokit } from "@octokit/rest";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { jsonResult } from "./types.js";

export class GitHubTool implements Tool {
  readonly name = "github";
  readonly description = "Perform selected GitHub repository, pull request, issue, and file operations.";
  readonly inputSchema = { type: "object", required: ["op"], additionalProperties: true, properties: { op: { type: "string" } } };
  private readonly octokit?: Octokit;

  constructor(private readonly opts: { token?: string; defaultRepo?: string; octokit?: Octokit }) {
    this.octokit = opts.octokit ?? (opts.token ? new Octokit({ auth: opts.token }) : undefined);
  }

  async execute(args: unknown, _ctx: ToolContext): Promise<ToolResult> {
    if (!args || typeof args !== "object") throw new Error("github expects an object");
    if (!this.octokit) throw new Error("github token missing");
    const input = args as Record<string, unknown>;
    const repo = parseRepo((input.repo as string | undefined) ?? this.opts.defaultRepo);
    switch (input.op) {
      case "issues_list":
        return jsonResult((await this.octokit.issues.listForRepo({ owner: repo.owner, repo: repo.repo })).data);
      case "file_get":
        return jsonResult((await this.octokit.repos.getContent({ owner: repo.owner, repo: repo.repo, path: String(input.path) })).data);
      case "pr_comment":
        return jsonResult(
          (
            await this.octokit.issues.createComment({
              owner: repo.owner,
              repo: repo.repo,
              issue_number: Number(input.pull_number),
              body: String(input.body)
            })
          ).data
        );
      case "pr_create":
        return jsonResult(
          (
            await this.octokit.pulls.create({
              owner: repo.owner,
              repo: repo.repo,
              title: String(input.title),
              head: String(input.head),
              base: String(input.base ?? "main"),
              body: String(input.body ?? "")
            })
          ).data
        );
      case "pr_merge":
        return jsonResult(
          (await this.octokit.pulls.merge({ owner: repo.owner, repo: repo.repo, pull_number: Number(input.pull_number) })).data
        );
      default:
        throw new Error(`unsupported github op: ${String(input.op)}`);
    }
  }
}

const parseRepo = (repo: string | undefined): { owner: string; repo: string } => {
  const [owner, name] = (repo ?? "").split("/");
  if (!owner || !name) throw new Error("github repo must be owner/name");
  return { owner, repo: name };
};

import type { GitHubRequest } from "../tracker/github/client.js";

export interface GitHubPullRequestMetadata {
  url: string;
  number: number;
  state: "open" | "closed" | "merged";
}

export interface EnsurePullRequestOpts {
  head: string;
  base: string;
  title: string;
  body: string;
  draft: boolean;
  labels: string[];
  reviewers: string[];
}

export class GitHubPullRequestClient {
  constructor(private readonly opts: { repo: string; token?: string; request?: GitHubRequest }) {}

  async ensurePullRequest(input: EnsurePullRequestOpts): Promise<GitHubPullRequestMetadata> {
    const repo = parseGitHubRepo(this.opts.repo);
    const existing = await this.findOpenPullRequest(repo, input.head, input.base);
    const pull = existing ?? (await this.createPullRequest(repo, input));
    const number = pullNumber(pull);
    if (input.labels.length > 0) {
      await this.request(`/repos/${repo.owner}/${repo.repo}/issues/${number}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: input.labels })
      });
    }
    if (input.reviewers.length > 0) {
      await this.request(`/repos/${repo.owner}/${repo.repo}/pulls/${number}/requested_reviewers`, {
        method: "POST",
        body: JSON.stringify({ reviewers: input.reviewers })
      });
    }
    return pullMetadata(pull);
  }

  private async findOpenPullRequest(repo: GitHubRepo, head: string, base: string): Promise<Record<string, unknown> | null> {
    const headRef = head.includes(":") ? head : `${repo.owner}:${head}`;
    const params = new URLSearchParams({ state: "open", head: headRef, base });
    const pulls = await this.request(`/repos/${repo.owner}/${repo.repo}/pulls?${params.toString()}`);
    return Array.isArray(pulls) && pulls.length > 0 && typeof pulls[0] === "object" ? (pulls[0] as Record<string, unknown>) : null;
  }

  private createPullRequest(repo: GitHubRepo, input: EnsurePullRequestOpts): Promise<unknown> {
    return this.request(`/repos/${repo.owner}/${repo.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        head: input.head,
        base: input.base,
        body: input.body,
        draft: input.draft
      })
    });
  }

  private request(path: string, init: RequestInit = {}): Promise<unknown> {
    const request = this.opts.request ?? defaultGitHubRequest(this.opts.token);
    return request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init.headers as Record<string, string> | undefined)
      }
    });
  }
}

export const pullRequestLabels = (baseLabels: string[], labelsByIssueLabel: Record<string, string[]>, issueLabels: string[]): string[] => {
  const labels: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const normalized = label.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    labels.push(label);
  };
  for (const label of baseLabels) add(label);
  for (const issueLabel of issueLabels) {
    for (const label of labelsByIssueLabel[issueLabel.toLowerCase()] ?? []) add(label);
  }
  return labels;
};

export const parseGitHubRepo = (repo: string): GitHubRepo => {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("github repo must be owner/name");
  return { owner, repo: name };
};

interface GitHubRepo {
  owner: string;
  repo: string;
}

const defaultGitHubRequest =
  (token: string | undefined): GitHubRequest =>
  async (path, init = {}) => {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(init.headers as Record<string, string> | undefined)
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`https://api.github.com${path}`, { ...init, headers });
    if (!response.ok) throw new Error(`GitHub request failed with HTTP ${response.status}`);
    if (response.status === 204) return null;
    return response.json();
  };

const pullMetadata = (value: unknown): GitHubPullRequestMetadata => {
  if (!value || typeof value !== "object") throw new Error("GitHub pull request response was not an object");
  const record = value as Record<string, unknown>;
  const url = typeof record.html_url === "string" ? record.html_url : "";
  const number = pullNumber(record);
  const state = record.merged === true ? "merged" : record.state === "closed" ? "closed" : "open";
  return { url, number, state };
};

const pullNumber = (value: unknown): number => {
  if (!value || typeof value !== "object") throw new Error("GitHub pull request response was not an object");
  const number = (value as Record<string, unknown>).number;
  if (typeof number !== "number") throw new Error("GitHub pull request response missing number");
  return number;
};

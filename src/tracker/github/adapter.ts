import type { Tracker } from "../types.js";
import type { Issue } from "../issue.js";
import { GitHubClient, type GitHubRequest } from "./client.js";
import { normalizeGitHubIssue } from "./normalize.js";

export interface GitHubTrackerConfig {
  kind: "github";
  token?: string;
  repo: string;
  labels: string[];
  active_states: string[];
  terminal_states: string[];
}

export class GitHubTracker implements Tracker {
  private readonly request: GitHubRequest;

  constructor(private readonly config: GitHubTrackerConfig, request?: GitHubRequest) {
    const client = new GitHubClient({ token: config.token });
    this.request = request ?? client.request.bind(client);
  }

  fetchCandidateIssues(): Promise<Issue[]> {
    return this.fetchByGitHubState("open");
  }

  fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    const hasOpen = states.some((s) => s.toLowerCase() === "open");
    const hasClosed = states.some((s) => s.toLowerCase() === "closed");
    const ghState = hasOpen && hasClosed ? "all" : hasOpen ? "open" : hasClosed ? "closed" : "all";
    return this.fetchByGitHubState(ghState);
  }

  async fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    if (ids.length === 0) return [];
    const results = await Promise.all([...new Set(ids)].map((id) => this.fetchIssueByNumber(id)));
    return results.filter((issue): issue is Issue => issue !== null);
  }

  async createComment(issueId: string, body: string): Promise<void> {
    await this.request(`/repos/${this.config.repo}/issues/${encodeURIComponent(issueId)}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body })
    });
  }

  async updateIssueState(issueId: string, stateName: string): Promise<void> {
    const isTerminal = this.config.terminal_states.some((s) => s.toLowerCase() === stateName.toLowerCase());
    await this.request(`/repos/${this.config.repo}/issues/${encodeURIComponent(issueId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: isTerminal ? "closed" : "open" })
    });
  }

  private async fetchByGitHubState(state: string, page = 1, acc: Issue[] = []): Promise<Issue[]> {
    let path = `/repos/${this.config.repo}/issues?state=${state}&per_page=100&page=${page}`;
    if (this.config.labels.length > 0) path += `&labels=${this.config.labels.map(encodeURIComponent).join(",")}`;
    const response = await this.request(path);
    const items = Array.isArray(response) ? response : [];
    const issues = [
      ...acc,
      ...items
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .filter((item) => !item.pull_request)
        .map((item) => normalizeGitHubIssue(item))
        .filter((issue): issue is Issue => issue !== null)
    ];
    return items.length === 100 ? this.fetchByGitHubState(state, page + 1, issues) : issues;
  }

  private async fetchIssueByNumber(number: string): Promise<Issue | null> {
    try {
      const response = await this.request(`/repos/${this.config.repo}/issues/${encodeURIComponent(number)}`);
      if (!response || typeof response !== "object") return null;
      return normalizeGitHubIssue(response as Record<string, unknown>);
    } catch {
      return null;
    }
  }
}

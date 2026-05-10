import type { Tracker, TrackerComment } from "../types.js";
import type { Issue } from "../issue.js";
import { JiraClient, type JiraRequest } from "./client.js";
import { normalizeJiraIssue } from "./normalize.js";

export interface JiraTrackerConfig {
  kind: "jira";
  endpoint: string;
  email: string;
  api_token: string;
  project_key: string;
  jql?: string;
  active_states: string[];
  terminal_states: string[];
}

export class JiraTracker implements Tracker {
  private readonly request: JiraRequest;

  constructor(
    private readonly config: JiraTrackerConfig,
    request?: JiraRequest
  ) {
    const client = new JiraClient({ endpoint: config.endpoint, email: config.email, apiToken: config.api_token });
    this.request = request ?? client.request.bind(client);
  }

  fetchCandidateIssues(): Promise<Issue[]> {
    const jql = this.config.jql ?? `project = ${this.config.project_key} AND status in (${this.config.active_states.join(",")})`;
    return this.search(jql);
  }

  fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    return this.search(`project = ${this.config.project_key} AND status in (${states.join(",")})`);
  }

  fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.search(`key in (${ids.join(",")})`);
  }

  async createComment(issueId: string, body: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${encodeURIComponent(issueId)}/comment`, {
      method: "POST",
      body: JSON.stringify({ body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: body }] }] } })
    });
  }

  async fetchComments(issueId: string): Promise<TrackerComment[]> {
    const response = await this.request(`/rest/api/3/issue/${encodeURIComponent(issueId)}/comment`, { method: "GET" });
    const comments = (response as { comments?: unknown[] }).comments ?? [];
    return comments.map(normalizeJiraComment).filter((comment): comment is TrackerComment => comment !== null);
  }

  async updateIssueDescription(issueId: string, description: string): Promise<void> {
    await this.request(`/rest/api/3/issue/${encodeURIComponent(issueId)}`, {
      method: "PUT",
      body: JSON.stringify({
        fields: {
          description: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: description }] }]
          }
        }
      })
    });
  }

  async updateIssueState(issueId: string, stateName: string): Promise<void> {
    const transitions = await this.request(`/rest/api/3/issue/${encodeURIComponent(issueId)}/transitions`);
    const transition = (transitions as { transitions?: Array<{ id: string; name: string }> }).transitions?.find(
      (item) => item.name === stateName
    );
    if (!transition) throw new Error(`Jira transition not found: ${stateName}`);
    await this.request(`/rest/api/3/issue/${encodeURIComponent(issueId)}/transitions`, {
      method: "POST",
      body: JSON.stringify({ transition: { id: transition.id } })
    });
  }

  private async search(jql: string): Promise<Issue[]> {
    const path = `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,description,status,priority,labels,issuelinks,created,updated`;
    const response = await this.request(path, { method: "GET" });
    const issues = (response as { issues?: unknown[] }).issues ?? [];
    return issues
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => normalizeJiraIssue(item))
      .filter((issue): issue is Issue => issue != null);
  }
}

const normalizeJiraComment = (raw: unknown): TrackerComment | null => {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.created !== "string") return null;
  const author = record.author && typeof record.author === "object" ? (record.author as Record<string, unknown>) : {};
  return {
    id: record.id,
    body: adfToText(record.body),
    created_at: record.created,
    author: typeof author.displayName === "string" ? author.displayName : undefined
  };
};

const adfToText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";
  const children = Array.isArray(record.content) ? record.content.map(adfToText).filter(Boolean).join("\n") : "";
  return [text, children].filter(Boolean).join(text && children ? "\n" : "");
};

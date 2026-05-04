import type { Tracker } from "../types.js";
import type { Issue } from "../issue.js";
import type { GraphqlRequest } from "./client.js";
import { LinearClient } from "./client.js";
import { normalizeLinearIssue } from "./normalize.js";

const pollQuery = "query NorthstarLinearPoll($projectSlug:String!,$stateNames:[String!]!,$first:Int!,$after:String){issues(filter:{project:{slugId:{eq:$projectSlug}},state:{name:{in:$stateNames}}},first:$first,after:$after){nodes{id identifier title description priority state{name} branchName url labels{nodes{name}} inverseRelations(first:50){nodes{type issue{id identifier state{name}}}} createdAt updatedAt} pageInfo{hasNextPage endCursor}}}";
const byIdsQuery = "query NorthstarLinearIssuesById($ids:[ID!]!,$first:Int!){issues(filter:{id:{in:$ids}},first:$first){nodes{id identifier title description priority state{name} branchName url labels{nodes{name}} inverseRelations(first:50){nodes{type issue{id identifier state{name}}}} createdAt updatedAt}}}";

export interface LinearTrackerConfig {
  kind: "linear";
  endpoint: string;
  api_key?: string;
  project_slug?: string;
  active_states: string[];
  terminal_states: string[];
}

export class LinearTracker implements Tracker {
  private readonly graphql: GraphqlRequest;

  constructor(private readonly config: LinearTrackerConfig, graphql?: GraphqlRequest) {
    const client = new LinearClient({ endpoint: config.endpoint, apiKey: config.api_key });
    this.graphql = graphql ?? client.graphql.bind(client);
  }

  fetchCandidateIssues(): Promise<Issue[]> {
    if (!this.config.project_slug) throw new Error("missing Linear project slug");
    return this.fetchPages(pollQuery, { projectSlug: this.config.project_slug, stateNames: this.config.active_states, first: 50, after: null });
  }

  fetchIssuesByStates(states: string[]): Promise<Issue[]> {
    if (!this.config.project_slug) throw new Error("missing Linear project slug");
    return this.fetchPages(pollQuery, { projectSlug: this.config.project_slug, stateNames: states, first: 50, after: null });
  }

  async fetchIssueStatesByIds(ids: string[]): Promise<Issue[]> {
    if (ids.length === 0) return [];
    const response = await this.graphql(byIdsQuery, { ids: [...new Set(ids)], first: 50 });
    return decodeIssues(response);
  }

  private async fetchPages(query: string, variables: Record<string, unknown>, acc: Issue[] = []): Promise<Issue[]> {
    const response = await this.graphql(query, variables);
    const page = readPage(response);
    const issues = [...acc, ...decodeIssues(response)];
    return page.hasNextPage && page.endCursor ? this.fetchPages(query, { ...variables, after: page.endCursor }, issues) : issues;
  }
}

function decodeIssues(response: unknown): Issue[] {
  const nodes = readNodes(response);
  return nodes.map((node) => normalizeLinearIssue(node)).filter((issue): issue is Issue => issue != null);
}

function readNodes(response: unknown): Record<string, unknown>[] {
  const issues = response && typeof response === "object" ? (response as { data?: { issues?: { nodes?: unknown[] } } }).data?.issues : undefined;
  return Array.isArray(issues?.nodes) ? issues.nodes.filter((node): node is Record<string, unknown> => Boolean(node && typeof node === "object")) : [];
}

function readPage(response: unknown): { hasNextPage: boolean; endCursor: string | null } {
  const page = response && typeof response === "object" ? (response as { data?: { issues?: { pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } } } }).data?.issues?.pageInfo : undefined;
  return { hasNextPage: page?.hasNextPage === true, endCursor: typeof page?.endCursor === "string" ? page.endCursor : null };
}

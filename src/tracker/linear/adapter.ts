import type { Tracker, TrackerComment } from "../types.js";
import type { Issue } from "../issue.js";
import type { GraphqlRequest } from "./client.js";
import { LinearClient } from "./client.js";
import { normalizeLinearIssue } from "./normalize.js";

const pollQuery =
  "query NorthstarLinearPoll($projectSlug:String!,$stateNames:[String!]!,$first:Int!,$after:String){issues(filter:{project:{slugId:{eq:$projectSlug}},state:{name:{in:$stateNames}}},first:$first,after:$after){nodes{id identifier title description priority state{name} branchName url labels{nodes{name}} inverseRelations(first:50){nodes{type issue{id identifier state{name}}}} createdAt updatedAt} pageInfo{hasNextPage endCursor}}}";
const byIdsQuery =
  "query NorthstarLinearIssuesById($ids:[ID!]!,$first:Int!){issues(filter:{id:{in:$ids}},first:$first){nodes{id identifier title description priority state{name} branchName url labels{nodes{name}} inverseRelations(first:50){nodes{type issue{id identifier state{name}}}} createdAt updatedAt}}}";
const commentsQuery =
  "query NorthstarLinearComments($issueId:String!,$first:Int!,$after:String){issue(id:$issueId){comments(first:$first,after:$after){nodes{id body createdAt user{name email displayName}} pageInfo{hasNextPage endCursor}}}}";
const createCommentMutation =
  "mutation NorthstarLinearCreateComment($issueId:String!,$body:String!){commentCreate(input:{issueId:$issueId,body:$body}){success comment{id body createdAt user{name email displayName}}}}";

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

  constructor(
    private readonly config: LinearTrackerConfig,
    graphql?: GraphqlRequest
  ) {
    const client = new LinearClient({ endpoint: config.endpoint, apiKey: config.api_key });
    this.graphql = graphql ?? client.graphql.bind(client);
  }

  fetchCandidateIssues(): Promise<Issue[]> {
    if (!this.config.project_slug) throw new Error("missing Linear project slug");
    return this.fetchPages(pollQuery, {
      projectSlug: this.config.project_slug,
      stateNames: this.config.active_states,
      first: 50,
      after: null
    });
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

  async createComment(issueId: string, body: string): Promise<TrackerComment | void> {
    const response = await this.graphql(createCommentMutation, { issueId, body });
    return (
      normalizeLinearComment((response as { data?: { commentCreate?: { comment?: unknown } } })?.data?.commentCreate?.comment) ?? undefined
    );
  }

  fetchComments(issueId: string): Promise<TrackerComment[]> {
    return this.fetchCommentPages(issueId, { issueId, first: 50, after: null });
  }

  private async fetchPages(query: string, variables: Record<string, unknown>, acc: Issue[] = []): Promise<Issue[]> {
    const response = await this.graphql(query, variables);
    const page = readPage(response);
    const issues = [...acc, ...decodeIssues(response)];
    return page.hasNextPage && page.endCursor ? this.fetchPages(query, { ...variables, after: page.endCursor }, issues) : issues;
  }

  private async fetchCommentPages(
    issueId: string,
    variables: Record<string, unknown>,
    acc: TrackerComment[] = []
  ): Promise<TrackerComment[]> {
    const response = await this.graphql(commentsQuery, variables);
    const page = readCommentPage(response);
    const comments = [
      ...acc,
      ...readCommentNodes(response)
        .map(normalizeLinearComment)
        .filter((comment): comment is TrackerComment => comment !== null)
    ];
    return page.hasNextPage && page.endCursor
      ? this.fetchCommentPages(issueId, { issueId, first: 50, after: page.endCursor }, comments)
      : comments;
  }
}

const decodeIssues = (response: unknown): Issue[] => {
  const nodes = readNodes(response);
  return nodes.map((node) => normalizeLinearIssue(node)).filter((issue): issue is Issue => issue != null);
};

const readNodes = (response: unknown): Record<string, unknown>[] => {
  const issues =
    response && typeof response === "object" ? (response as { data?: { issues?: { nodes?: unknown[] } } }).data?.issues : undefined;
  return Array.isArray(issues?.nodes)
    ? issues.nodes.filter((node): node is Record<string, unknown> => Boolean(node && typeof node === "object"))
    : [];
};

const readPage = (response: unknown): { hasNextPage: boolean; endCursor: string | null } => {
  const page =
    response && typeof response === "object"
      ? (response as { data?: { issues?: { pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } } } }).data?.issues?.pageInfo
      : undefined;
  return { hasNextPage: page?.hasNextPage === true, endCursor: typeof page?.endCursor === "string" ? page.endCursor : null };
};

const readCommentNodes = (response: unknown): unknown[] => {
  const comments =
    response && typeof response === "object"
      ? (response as { data?: { issue?: { comments?: { nodes?: unknown[] } } } }).data?.issue?.comments
      : undefined;
  return Array.isArray(comments?.nodes) ? comments.nodes : [];
};

const readCommentPage = (response: unknown): { hasNextPage: boolean; endCursor: string | null } => {
  const page =
    response && typeof response === "object"
      ? (response as { data?: { issue?: { comments?: { pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } } } } }).data?.issue
          ?.comments?.pageInfo
      : undefined;
  return { hasNextPage: page?.hasNextPage === true, endCursor: typeof page?.endCursor === "string" ? page.endCursor : null };
};

const normalizeLinearComment = (raw: unknown): TrackerComment | null => {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.body !== "string" || typeof record.createdAt !== "string") return null;
  const user = record.user && typeof record.user === "object" ? (record.user as Record<string, unknown>) : {};
  return {
    id: record.id,
    body: record.body,
    created_at: record.createdAt,
    author: firstString(user.name, user.email, user.displayName)
  };
};

const firstString = (...values: unknown[]): string | undefined => values.find((value): value is string => typeof value === "string");

import { describe, expect, test, vi } from "vitest";
import { normalizeLinearIssue } from "../../src/tracker/linear/normalize.js";
import { LinearTracker } from "../../src/tracker/linear/adapter.js";
import { normalizeJiraIssue } from "../../src/tracker/jira/normalize.js";
import { JiraTracker } from "../../src/tracker/jira/adapter.js";
import { normalizeGitHubIssue } from "../../src/tracker/github/normalize.js";
import { GitHubTracker } from "../../src/tracker/github/adapter.js";

describe("SPEC 17.3 tracker adapters", () => {
  test("normalizes Linear labels, branch metadata, and inverse blocking relations", () => {
    const issue = normalizeLinearIssue({
      id: "lin-1",
      identifier: "SYM-1",
      title: "Port",
      description: "body",
      priority: 2,
      state: { name: "Todo" },
      branchName: "sesh/sym-1",
      url: "https://linear.app/acme/issue/SYM-1",
      labels: { nodes: [{ name: "Backend" }] },
      inverseRelations: { nodes: [{ type: "blocks", issue: { id: "dep", identifier: "SYM-0", state: { name: "Todo" } } }] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });

    expect(issue?.labels).toEqual(["backend"]);
    expect(issue?.blocked_by).toEqual([{ id: "dep", identifier: "SYM-0", state: "Todo" }]);
    expect(issue?.branch_name).toBe("sesh/sym-1");
  });

  test("Linear adapter paginates candidate issue queries", async () => {
    const pages = [
      {
        data: {
          issues: {
            nodes: [{ id: "1", identifier: "SYM-1", title: "A", state: { name: "Todo" } }],
            pageInfo: { hasNextPage: true, endCursor: "next" }
          }
        }
      },
      {
        data: {
          issues: {
            nodes: [{ id: "2", identifier: "SYM-2", title: "B", state: { name: "Todo" } }],
            pageInfo: { hasNextPage: false, endCursor: null }
          }
        }
      }
    ];
    const graphql = vi.fn(async () => pages.shift());
    const tracker = new LinearTracker(
      {
        kind: "linear",
        endpoint: "https://linear",
        api_key: "token",
        project_slug: "SYM",
        active_states: ["Todo"],
        terminal_states: ["Done"]
      },
      graphql
    );

    const issues = await tracker.fetchCandidateIssues();

    expect(issues.map((i) => i.identifier)).toEqual(["SYM-1", "SYM-2"]);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  test("Linear adapter creates and fetches comments", async () => {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const graphql = vi.fn(async (query: string, variables: Record<string, unknown>) => {
      calls.push({ query, variables });
      if (query.includes("commentCreate")) return { data: { commentCreate: { success: true } } };
      return {
        data: {
          issue: {
            comments: {
              nodes: [{ id: "c1", body: "looks good", createdAt: "2026-01-01T00:00:00.000Z", user: { name: "Lead" } }],
              pageInfo: { hasNextPage: false, endCursor: null }
            }
          }
        }
      };
    });
    const tracker = new LinearTracker(
      {
        kind: "linear",
        endpoint: "https://linear",
        api_key: "token",
        project_slug: "SYM",
        active_states: ["Todo"],
        terminal_states: ["Done"]
      },
      graphql
    );

    await tracker.createComment("lin-1", "plan");
    const comments = await tracker.fetchComments("lin-1");

    expect(calls[0]?.variables).toEqual({ issueId: "lin-1", body: "plan" });
    expect(comments).toEqual([{ id: "c1", body: "looks good", created_at: "2026-01-01T00:00:00.000Z", author: "Lead" }]);
  });

  test("normalizes Jira status, priority, labels, and outward blockers", () => {
    const issue = normalizeJiraIssue({
      id: "10001",
      key: "SYM-3",
      fields: {
        summary: "Jira issue",
        description: "ADF",
        status: { name: "In Progress" },
        priority: { name: "High", id: "2" },
        labels: ["API", "Bug"],
        issuelinks: [
          {
            type: { outward: "blocks", inward: "is blocked by" },
            inwardIssue: { id: "10000", key: "SYM-2", fields: { status: { name: "Todo" } } }
          }
        ],
        created: "2026-01-01T00:00:00.000+0000",
        updated: "2026-01-02T00:00:00.000+0000"
      }
    });

    expect(issue?.identifier).toBe("SYM-3");
    expect(issue?.labels).toEqual(["api", "bug"]);
    expect(issue?.priority).toBe(2);
    expect(issue?.blocked_by).toEqual([{ id: "10000", identifier: "SYM-2", state: "Todo" }]);
  });

  test("Jira adapter builds default active-state JQL and fetches states by key", async () => {
    const requests: string[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push(`${path} ${init?.method ?? "GET"}`);
      return { issues: [{ id: "10001", key: "SYM-1", fields: { summary: "A", status: { name: "Todo" } } }] };
    });
    const tracker = new JiraTracker(
      {
        kind: "jira",
        endpoint: "https://jira",
        email: "dev@example.com",
        api_token: "token",
        project_key: "SYM",
        active_states: ["Todo"],
        terminal_states: ["Done"]
      },
      request
    );

    expect((await tracker.fetchCandidateIssues())[0]?.identifier).toBe("SYM-1");
    expect((await tracker.fetchIssueStatesByIds(["SYM-1"]))[0]?.state).toBe("Todo");
    expect(requests[0]).toContain("/rest/api/3/search");
    expect(requests[1]).toContain("key%20in%20(SYM-1)");
  });

  test("Jira adapter fetches comments and extracts ADF text", async () => {
    const request = vi.fn(async () => ({
      comments: [
        {
          id: "100",
          created: "2026-01-01T00:00:00.000+0000",
          author: { displayName: "Reviewer" },
          body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "/approve" }] }] }
        }
      ]
    }));
    const tracker = new JiraTracker(
      {
        kind: "jira",
        endpoint: "https://jira",
        email: "dev@example.com",
        api_token: "token",
        project_key: "SYM",
        active_states: ["Todo"],
        terminal_states: ["Done"]
      },
      request
    );

    const comments = await tracker.fetchComments("SYM-1");

    expect(comments).toEqual([{ id: "100", body: "/approve", created_at: "2026-01-01T00:00:00.000+0000", author: "Reviewer" }]);
    expect(request).toHaveBeenCalledWith("/rest/api/3/issue/SYM-1/comment", { method: "GET" });
  });

  test("normalizes GitHub issue fields, strips PRs, and maps priority labels", () => {
    const issue = normalizeGitHubIssue({
      number: 42,
      title: "Add feature X",
      body: "Description here",
      state: "open",
      html_url: "https://github.com/acme/repo/issues/42",
      labels: [{ name: "P1" }, { name: "backend" }],
      assignee: { login: "sesh" },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    });

    expect(issue?.id).toBe("42");
    expect(issue?.identifier).toBe("#42");
    expect(issue?.state).toBe("open");
    expect(issue?.labels).toEqual(["p1", "backend"]);
    expect(issue?.priority).toBe(1);
    expect(issue?.assignee_id).toBe("sesh");
    expect(issue?.blocked_by).toEqual([]);
  });

  test("GitHub normalizer returns null for pull requests (missing number)", () => {
    expect(normalizeGitHubIssue({ title: "PR", state: "open" })).toBeNull();
  });

  test("GitHub adapter paginates candidate issues and excludes PRs", async () => {
    const makeItem = (n: number) => ({ number: n, title: `Issue ${n}`, state: "open", labels: [] });
    const page1 = [...Array(100)].map((_, i) => makeItem(i + 1));
    const page2 = [makeItem(101), { number: 102, title: "PR", state: "open", labels: [], pull_request: {} }];
    let call = 0;
    const request = vi.fn(async () => (call++ === 0 ? page1 : page2));
    const tracker = new GitHubTracker(
      { kind: "github", repo: "acme/repo", labels: [], active_states: ["open"], terminal_states: ["closed"] },
      request
    );

    const issues = await tracker.fetchCandidateIssues();

    expect(issues).toHaveLength(101);
    expect(request).toHaveBeenCalledTimes(2);
    expect(issues.find((i) => i.id === "102")).toBeUndefined();
  });

  test("GitHub adapter creates comment and closes issue via updateIssueState", async () => {
    const requests: Array<{ path: string; method: string; body?: unknown }> = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (path.includes("/issues/5") && (init?.method ?? "GET") === "GET") {
        return { number: 5, title: "T", state: "open", labels: [] };
      }
      return null;
    });
    const tracker = new GitHubTracker(
      { kind: "github", repo: "acme/repo", labels: [], active_states: ["open"], terminal_states: ["closed"] },
      request
    );

    await tracker.createComment("5", "done");
    await tracker.updateIssueState("5", "closed");

    expect(requests[0]?.path).toContain("/issues/5/comments");
    expect(requests[0]?.body).toEqual({ body: "done" });
    expect(requests[1]?.method).toBe("PATCH");
    expect(requests[1]?.body).toEqual({ state: "closed" });
  });

  test("GitHub adapter fetches issue comments", async () => {
    const request = vi.fn(async () => [
      {
        id: 123,
        body: "/approve",
        created_at: "2026-01-01T00:00:00Z",
        user: { login: "lead" }
      }
    ]);
    const tracker = new GitHubTracker(
      { kind: "github", repo: "acme/repo", labels: [], active_states: ["open"], terminal_states: ["closed"] },
      request
    );

    const comments = await tracker.fetchComments("5");

    expect(comments).toEqual([{ id: "123", body: "/approve", created_at: "2026-01-01T00:00:00Z", author: "lead" }]);
    expect(request).toHaveBeenCalledWith("/repos/acme/repo/issues/5/comments?per_page=100&page=1");
  });

  test("GitHub adapter fetchIssuesByStates maps open/closed to GitHub state param", async () => {
    const paths: string[] = [];
    const request = vi.fn(async (path: string) => {
      paths.push(path);
      return [];
    });
    const tracker = new GitHubTracker(
      { kind: "github", repo: "acme/repo", labels: [], active_states: ["open"], terminal_states: ["closed"] },
      request
    );

    await tracker.fetchIssuesByStates(["open"]);
    await tracker.fetchIssuesByStates(["closed"]);
    await tracker.fetchIssuesByStates(["open", "closed"]);

    expect(paths[0]).toContain("state=open");
    expect(paths[1]).toContain("state=closed");
    expect(paths[2]).toContain("state=all");
  });
});

import { describe, expect, test, vi } from "vitest";
import { normalizeLinearIssue } from "../../src/tracker/linear/normalize.js";
import { LinearTracker } from "../../src/tracker/linear/adapter.js";
import { normalizeJiraIssue } from "../../src/tracker/jira/normalize.js";
import { JiraTracker } from "../../src/tracker/jira/adapter.js";

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
      { data: { issues: { nodes: [{ id: "1", identifier: "SYM-1", title: "A", state: { name: "Todo" } }], pageInfo: { hasNextPage: true, endCursor: "next" } } } },
      { data: { issues: { nodes: [{ id: "2", identifier: "SYM-2", title: "B", state: { name: "Todo" } }], pageInfo: { hasNextPage: false, endCursor: null } } } }
    ];
    const graphql = vi.fn(async () => pages.shift());
    const tracker = new LinearTracker({ kind: "linear", endpoint: "https://linear", api_key: "token", project_slug: "SYM", active_states: ["Todo"], terminal_states: ["Done"] }, graphql);

    const issues = await tracker.fetchCandidateIssues();

    expect(issues.map((i) => i.identifier)).toEqual(["SYM-1", "SYM-2"]);
    expect(graphql).toHaveBeenCalledTimes(2);
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
        issuelinks: [{ type: { outward: "blocks", inward: "is blocked by" }, inwardIssue: { id: "10000", key: "SYM-2", fields: { status: { name: "Todo" } } } }],
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
    const tracker = new JiraTracker({ kind: "jira", endpoint: "https://jira", email: "dev@example.com", api_token: "token", project_key: "SYM", active_states: ["Todo"], terminal_states: ["Done"] }, request);

    expect((await tracker.fetchCandidateIssues())[0]?.identifier).toBe("SYM-1");
    expect((await tracker.fetchIssueStatesByIds(["SYM-1"]))[0]?.state).toBe("Todo");
    expect(requests[0]).toContain("/rest/api/3/search");
    expect(requests[1]).toContain("key%20in%20(SYM-1)");
  });
});

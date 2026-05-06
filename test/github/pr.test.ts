import { describe, expect, test, vi } from "vitest";
import { GitHubPullRequestClient, parseGitHubRepo, pullRequestLabels } from "../../src/github/pr.js";
import type { GitHubRequest } from "../../src/tracker/github/client.js";

describe("GitHub pull request handoff", () => {
  test("dedupes base and issue-derived labels case-insensitively", () => {
    expect(
      pullRequestLabels(
        ["northstar", "Docs"],
        {
          docs: ["docs", "documentation"],
          security: ["security-review-required"]
        },
        ["Docs", "security"]
      )
    ).toEqual(["northstar", "Docs", "documentation", "security-review-required"]);
  });

  test("validates repository names", () => {
    expect(parseGitHubRepo("owner/repo")).toEqual({ owner: "owner", repo: "repo" });
    expect(() => parseGitHubRepo("repo")).toThrow(/owner\/name/);
  });

  test("finds an existing open pull request before creating one", async () => {
    const request = vi.fn<GitHubRequest>(async (path) => {
      if (path.startsWith("/repos/owner/repo/pulls?"))
        return [{ number: 7, html_url: "https://github.com/owner/repo/pull/7", state: "open" }];
      if (path.endsWith("/issues/7/labels")) return {};
      return {};
    });
    const client = new GitHubPullRequestClient({ repo: "owner/repo", request });

    const result = await client.ensurePullRequest({
      head: "feature",
      base: "main",
      title: "Title",
      body: "Body",
      draft: true,
      labels: ["northstar"],
      reviewers: []
    });

    expect(result).toEqual({ url: "https://github.com/owner/repo/pull/7", number: 7, state: "open" });
    expect(request).not.toHaveBeenCalledWith("/repos/owner/repo/pulls", expect.anything());
    expect(request).toHaveBeenCalledWith(
      "/repos/owner/repo/issues/7/labels",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ labels: ["northstar"] })
      })
    );
  });

  test("creates a draft pull request and requests reviewers when no open PR exists", async () => {
    const request = vi.fn<GitHubRequest>(async (path) => {
      if (path.startsWith("/repos/owner/repo/pulls?")) return [];
      if (path === "/repos/owner/repo/pulls") return { number: 8, html_url: "https://github.com/owner/repo/pull/8", state: "open" };
      if (path.endsWith("/requested_reviewers")) return {};
      return {};
    });
    const client = new GitHubPullRequestClient({ repo: "owner/repo", request });

    const result = await client.ensurePullRequest({
      head: "feature",
      base: "main",
      title: "Title",
      body: "Body",
      draft: true,
      labels: [],
      reviewers: ["lead"]
    });

    expect(result.number).toBe(8);
    expect(request).toHaveBeenCalledWith(
      "/repos/owner/repo/pulls",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Title", head: "feature", base: "main", body: "Body", draft: true })
      })
    );
    expect(request).toHaveBeenCalledWith(
      "/repos/owner/repo/pulls/8/requested_reviewers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reviewers: ["lead"] })
      })
    );
  });
});

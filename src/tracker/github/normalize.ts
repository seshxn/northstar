import type { Issue } from "../issue.js";

export const normalizeGitHubIssue = (raw: Record<string, unknown>): Issue | null => {
  const number = raw.number;
  const title = raw.title;
  if (typeof number !== "number" || typeof title !== "string") return null;
  const state = typeof raw.state === "string" ? raw.state : null;
  if (!state) return null;

  const labels = Array.isArray(raw.labels)
    ? raw.labels
        .filter((l): l is Record<string, unknown> => Boolean(l && typeof l === "object"))
        .map((l) => (typeof l.name === "string" ? l.name : null))
        .filter((name): name is string => name !== null)
    : [];

  return {
    id: String(number),
    identifier: `#${number}`,
    title,
    description: typeof raw.body === "string" ? raw.body : null,
    priority: priorityFromLabels(labels),
    state,
    branch_name: null,
    url: typeof raw.html_url === "string" ? raw.html_url : null,
    labels: labels.map((l) => l.toLowerCase()),
    blocked_by: [],
    created_at: typeof raw.created_at === "string" ? raw.created_at : null,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
    assignee_id: raw.assignee && typeof raw.assignee === "object" ? stringOrNull((raw.assignee as Record<string, unknown>).login) : null
  };
};

const priorityFromLabels = (labels: string[]): number | null => {
  for (const label of labels) {
    const l = label.toLowerCase();
    if (l === "priority: critical" || l === "p0") return 0;
    if (l === "priority: high" || l === "p1") return 1;
    if (l === "priority: medium" || l === "p2") return 2;
    if (l === "priority: low" || l === "p3") return 3;
  }
  return null;
};

const stringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

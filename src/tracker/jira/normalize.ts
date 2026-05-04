import type { Issue } from "../issue.js";
import { issuePriority, normalizeLabels } from "../issue.js";

export function normalizeJiraIssue(raw: Record<string, unknown>): Issue | null {
  const fields = raw.fields && typeof raw.fields === "object" ? raw.fields as Record<string, unknown> : {};
  if (typeof raw.id !== "string" || typeof raw.key !== "string" || typeof fields.summary !== "string") return null;
  const status = readName(fields.status) ?? "";
  return {
    id: raw.id,
    identifier: raw.key,
    title: fields.summary,
    description: stringifyDescription(fields.description),
    priority: issuePriority((fields.priority as { id?: unknown } | undefined)?.id ?? (fields.priority as { name?: unknown } | undefined)?.name),
    state: status,
    branch_name: null,
    url: null,
    labels: normalizeLabels(fields.labels),
    blocked_by: blockers(fields.issuelinks),
    created_at: typeof fields.created === "string" ? fields.created : null,
    updated_at: typeof fields.updated === "string" ? fields.updated : null
  };
}

function blockers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((link) => {
    if (!link || typeof link !== "object") return [];
    const inward = (link as { inwardIssue?: unknown }).inwardIssue;
    if (!inward || typeof inward !== "object") return [];
    const issue = inward as Record<string, unknown>;
    const fields = issue.fields && typeof issue.fields === "object" ? issue.fields as Record<string, unknown> : {};
    return [{ id: typeof issue.id === "string" ? issue.id : null, identifier: typeof issue.key === "string" ? issue.key : null, state: readName(fields.status) }];
  });
}

function readName(value: unknown): string | null {
  return value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string" ? (value as { name: string }).name : null;
}

function stringifyDescription(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

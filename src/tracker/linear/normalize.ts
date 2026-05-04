import type { Issue } from "../issue.js";
import { issuePriority } from "../issue.js";

export function normalizeLinearIssue(raw: Record<string, unknown>): Issue | null {
  if (typeof raw.id !== "string" || typeof raw.identifier !== "string" || typeof raw.title !== "string") return null;
  const state = readName(raw.state);
  if (!state) return null;
  const labelNodes = readNodes(raw.labels).map((node) => readName(node)).filter((name): name is string => Boolean(name));
  const blockers = readNodes(raw.inverseRelations)
    .filter((relation) => relation.type === "blocks" && relation.issue && typeof relation.issue === "object")
    .map((relation) => {
      const blockedBy = relation.issue as Record<string, unknown>;
      return { id: stringOrNull(blockedBy.id), identifier: stringOrNull(blockedBy.identifier), state: readName(blockedBy.state) };
    });
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: stringOrNull(raw.description),
    priority: issuePriority(raw.priority),
    state,
    branch_name: stringOrNull(raw.branchName),
    url: stringOrNull(raw.url),
    labels: labelNodes.map((label) => label.toLowerCase()),
    blocked_by: blockers,
    created_at: stringOrNull(raw.createdAt),
    updated_at: stringOrNull(raw.updatedAt),
    assignee_id: raw.assignee && typeof raw.assignee === "object" ? stringOrNull((raw.assignee as Record<string, unknown>).id) : null
  };
}

function readNodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { nodes?: unknown }).nodes)) return [];
  return (value as { nodes: unknown[] }).nodes.filter((node): node is Record<string, unknown> => Boolean(node && typeof node === "object"));
}

function readName(value: unknown): string | null {
  return value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string" ? (value as { name: string }).name : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

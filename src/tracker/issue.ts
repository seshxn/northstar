export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branch_name: string | null;
  url: string | null;
  labels: string[];
  blocked_by: BlockerRef[];
  created_at: string | null;
  updated_at: string | null;
  assignee_id?: string | null;
  assigned_to_worker?: boolean;
}

export const normalizeLabels = (labels: unknown): string[] => {
  if (!Array.isArray(labels)) return [];
  return labels.filter((label): label is string => typeof label === "string").map((label) => label.toLowerCase());
};

export const issuePriority = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
};

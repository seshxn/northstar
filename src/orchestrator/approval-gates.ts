import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Issue } from "../tracker/issue.js";
import type { TrackerComment } from "../tracker/types.js";

export interface AwaitingReviewEntry {
  issueId: string;
  issue: string;
  title: string;
  workspacePath: string;
  planOutput: string;
  planCommentId: string | null;
  lastProcessedCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  attempt: number;
}

export interface ApprovalCommandConfig {
  approvalTrigger: string;
  rejectionTrigger: string;
  revisionTrigger: string;
}

export type ApprovalCommand = { kind: "approve" } | { kind: "reject"; message?: string } | { kind: "revise"; message: string };

export const approvalGatesApply = (config: { enabled: boolean; labels: string[] }, issue: Issue): boolean => {
  if (!config.enabled) return false;
  if (config.labels.length === 0) return true;
  const labels = new Set(issue.labels.map((label) => label.toLowerCase()));
  return config.labels.some((label) => labels.has(label.toLowerCase()));
};

export const parseApprovalCommand = (body: string, config: ApprovalCommandConfig): ApprovalCommand | null => {
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(">")) continue;
    if (line === config.approvalTrigger) return { kind: "approve" };
    if (line === config.rejectionTrigger) return { kind: "reject" };
    if (line.startsWith(`${config.rejectionTrigger} `))
      return { kind: "reject", message: line.slice(config.rejectionTrigger.length).trim() };
    if (line.startsWith(`${config.revisionTrigger} `)) return { kind: "revise", message: line.slice(config.revisionTrigger.length).trim() };
  }
  return null;
};

export const approvalAuthorAllowed = (comment: TrackerComment, approvers: string[]): boolean => {
  if (approvers.length === 0) return true;
  const author = comment.author?.toLowerCase();
  return Boolean(author && approvers.map((item) => item.toLowerCase()).includes(author));
};

export const commentsAfter = (comments: TrackerComment[], lastProcessedCommentId: string | null): TrackerComment[] => {
  if (!lastProcessedCommentId) return comments;
  const index = comments.findIndex((comment) => comment.id === lastProcessedCommentId);
  return index >= 0 ? comments.slice(index + 1) : comments;
};

export const renderPlanningPrompt = (basePrompt: string): string =>
  [
    basePrompt,
    "Human approval gate: analyze the issue and write a concrete implementation plan. Do not execute code changes, edit files, run implementation commands, or continue beyond the plan. Output only the plan and wait for human approval."
  ].join("\n\n");

export const renderRevisionPrompt = (basePrompt: string, previousPlan: string, feedback: string): string =>
  [
    basePrompt,
    "Human approval gate: the human provided feedback on your plan. Revise the plan according to the feedback. Do not execute code changes.",
    `Previous plan:\n${previousPlan}`,
    `Human feedback:\n${feedback}`
  ].join("\n\n");

export const renderRefinementPrompt = (basePrompt: string): string =>
  [
    basePrompt,
    "Refinement task: analyze this ticket and produce a comprehensive, well-structured description that will help an engineer implement it. Cover: what the feature does and why it exists, clear acceptance criteria, edge cases to handle, and any technical context needed. Output ONLY the refined description text in markdown — no preamble, no explanations, no file edits, no commands."
  ].join("\n\n");

export const renderExecutionPrompt = (basePrompt: string, plan: string): string =>
  [
    basePrompt,
    "The human approved this plan. Proceed to implement the code changes as outlined, then report the result.",
    `Approved plan:\n${plan}`
  ].join("\n\n");

export const approvalStatePath = (workspaceRoot: string): string => join(workspaceRoot, ".northstar", "awaiting-review.json");

export const loadAwaitingReview = async (workspaceRoot: string): Promise<Map<string, AwaitingReviewEntry>> => {
  try {
    const raw = await readFile(approvalStatePath(workspaceRoot), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed.flatMap((entry) => {
        const decoded = decodeAwaitingReviewEntry(entry);
        return decoded ? [[decoded.issueId, decoded] as const] : [];
      })
    );
  } catch {
    return new Map();
  }
};

export const saveAwaitingReview = async (workspaceRoot: string, entries: Map<string, AwaitingReviewEntry>): Promise<void> => {
  const path = approvalStatePath(workspaceRoot);
  await mkdir(join(workspaceRoot, ".northstar"), { recursive: true });
  await writeFile(path, JSON.stringify([...entries.values()].map(encodeAwaitingReviewEntry), null, 2));
};

const encodeAwaitingReviewEntry = (entry: AwaitingReviewEntry) => ({
  ...entry,
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt.toISOString()
});

const decodeAwaitingReviewEntry = (value: unknown): AwaitingReviewEntry | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.issueId !== "string" || typeof record.issue !== "string" || typeof record.title !== "string") return null;
  if (typeof record.workspacePath !== "string" || typeof record.planOutput !== "string") return null;
  return {
    issueId: record.issueId,
    issue: record.issue,
    title: record.title,
    workspacePath: record.workspacePath,
    planOutput: record.planOutput,
    planCommentId: typeof record.planCommentId === "string" ? record.planCommentId : null,
    lastProcessedCommentId: typeof record.lastProcessedCommentId === "string" ? record.lastProcessedCommentId : null,
    createdAt: typeof record.createdAt === "string" ? new Date(record.createdAt) : new Date(),
    updatedAt: typeof record.updatedAt === "string" ? new Date(record.updatedAt) : new Date(),
    attempt: typeof record.attempt === "number" ? record.attempt : 1
  };
};

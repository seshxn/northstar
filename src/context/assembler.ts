import type { Issue } from "../tracker/issue.js";
import type { RunResultEntry } from "../orchestrator/state.js";

export interface AssembleIssueContextOpts {
  issue: Issue;
  skillSequence?: string[];
  previousResult?: Pick<RunResultEntry, "status" | "output"> | null;
}

export function assembleIssueContext(opts: AssembleIssueContextOpts): string {
  const lines = [
    "Northstar issue context:",
    `- Issue: ${opts.issue.identifier}: ${opts.issue.title}`,
    opts.issue.url ? `- URL: ${opts.issue.url}` : null,
    opts.issue.state ? `- State: ${opts.issue.state}` : null,
    opts.issue.priority != null ? `- Priority: ${opts.issue.priority}` : null,
    opts.issue.branch_name ? `- Branch: ${opts.issue.branch_name}` : null,
    opts.issue.labels.length > 0 ? `- Labels: ${opts.issue.labels.join(", ")}` : null,
    opts.issue.description ? `- Description: ${compact(opts.issue.description)}` : null,
    opts.issue.blocked_by.length > 0 ? `- Blocked by: ${opts.issue.blocked_by.map((blocker) => `${blocker.identifier ?? blocker.id ?? "unknown"} (${blocker.state ?? "unknown"})`).join(", ")}` : null,
    opts.skillSequence && opts.skillSequence.length > 0 ? `- Requested skill gates: ${opts.skillSequence.join(", ")}` : null,
    opts.previousResult ? `- Previous run: ${opts.previousResult.status}${opts.previousResult.output ? ` - ${compact(opts.previousResult.output)}` : ""}` : null
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 1200);
}

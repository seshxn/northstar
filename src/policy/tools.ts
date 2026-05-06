import type { Issue } from "../tracker/issue.js";
import type { Tool } from "../tools/types.js";
import type { NorthstarConfig } from "../workflow/schema.js";

export type ToolPolicy = NorthstarConfig["policy"];

export const filterToolsForIssue = (tools: Tool[], policy: ToolPolicy, issue: Pick<Issue, "labels">): Tool[] => {
  const allowed = allowedSetForIssue(policy, issue);
  const disallowed = disallowedSetForIssue(policy, issue);
  return tools.filter((tool) => {
    if (allowed && !allowed.has(tool.name)) return false;
    return !disallowed.has(tool.name);
  });
};

const allowedSetForIssue = (policy: ToolPolicy, issue: Pick<Issue, "labels">): Set<string> | null => {
  const labelAllowed = unionForLabels(policy.allowed_tools_by_label, issue.labels);
  if (labelAllowed.size > 0) return labelAllowed;
  return policy.allowed_tools.length > 0 ? new Set(policy.allowed_tools) : null;
};

const disallowedSetForIssue = (policy: ToolPolicy, issue: Pick<Issue, "labels">): Set<string> =>
  new Set([...policy.disallowed_tools, ...unionForLabels(policy.disallowed_tools_by_label, issue.labels)]);

const unionForLabels = (rules: Record<string, string[]>, labels: string[]): Set<string> => {
  const values = new Set<string>();
  for (const label of labels) {
    for (const value of rules[label.toLowerCase()] ?? []) values.add(value);
  }
  return values;
};

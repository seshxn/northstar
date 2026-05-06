import type { Issue } from "../tracker/issue.js";
import type { NorthstarConfig } from "../workflow/schema.js";

export type QualityGatesConfig = NorthstarConfig["quality_gates"];

const gateInstructions: Record<string, string> = {
  test: "Focus only on proving the implementation works. Run or describe the exact verification commands and identify missing coverage.",
  review: "Review the implementation for bugs, regressions, maintainability risks, and missing tests.",
  security_review: "Review trust boundaries, user-controlled inputs, secrets, permissions, external calls, and tool access.",
  docs: "Check whether user-facing, operator-facing, and agent-facing documentation need updates."
};

export const qualityGateSequenceForIssue = (config: QualityGatesConfig, issue: Pick<Issue, "labels">): string[] => {
  if (!config.enabled) return [];
  const sequence: string[] = [];
  for (const gate of config.default_sequence) pushUnique(sequence, gate);
  for (const label of issue.labels) {
    for (const gate of config.label_sequences[label.toLowerCase()] ?? []) pushUnique(sequence, gate);
  }
  return sequence;
};

export const renderQualityGatePrompt = (
  gate: string,
  issue: Pick<Issue, "identifier" | "title">,
  previousOutput: string | undefined
): string =>
  [
    `Quality gate: ${gate}`,
    `Issue: ${issue.identifier}: ${issue.title}`,
    gateInstructions[gate] ?? `Run the ${gate} quality gate using the local agent workflow if available.`,
    "Do not make unrelated changes. Report pass/fail and concrete evidence.",
    previousOutput ? `Previous turn output:\n${previousOutput.slice(0, 4000)}` : null
  ]
    .filter(Boolean)
    .join("\n\n");

const pushUnique = (values: string[], value: string): void => {
  if (!values.includes(value)) values.push(value);
};

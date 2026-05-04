import type { Issue } from "../tracker/issue.js";
import type { NorthstarConfig } from "../workflow/schema.js";

export type SkillsConfig = NorthstarConfig["skills"];

const skillInstructions: Record<string, string> = {
  spec: "Clarify the request and write or confirm a short spec before changing code.",
  plan: "Break the work into small, ordered, verifiable tasks before implementation.",
  tdd: "Use test-driven development for behavior changes: write the failing test first, then implement.",
  verify: "Run fresh verification commands before claiming the work is complete.",
  review: "Review the diff for bugs, regressions, missing tests, and maintainability risks.",
  threat_model: "Identify trust boundaries, attacker-controlled inputs, and likely abuse cases before implementation.",
  security_review: "Review security-sensitive code for input validation, secret handling, permissions, and unsafe tool access.",
  systematic_debugging: "For failures, reproduce and isolate the root cause before changing code.",
  documentation: "Update user-facing and agent-facing docs when behavior, setup, or public contracts change.",
  ship: "Prepare a clean handoff with tests, docs, and rollback-relevant notes."
};

export function skillSequenceForIssue(config: SkillsConfig, issue: Pick<Issue, "labels">): string[] {
  if (!config.enabled) return [];
  const sequence: string[] = [];
  for (const skill of config.default_sequence) pushUnique(sequence, skill);
  for (const label of issue.labels) {
    for (const skill of config.label_sequences[label.toLowerCase()] ?? []) pushUnique(sequence, skill);
  }
  return sequence;
}

export function renderSkillInstructions(sequence: string[]): string {
  if (sequence.length === 0) return "";
  return [
    "Northstar requested skill gates for this issue:",
    ...sequence.map((skill) => `- ${skill}: ${skillInstructions[skill] ?? `Follow the locally installed ${skill} skill workflow if available.`}`)
  ].join("\n");
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

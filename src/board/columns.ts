import type { NorthstarConfig } from "../workflow/schema.js";
import { normalizeState } from "../orchestrator/state.js";

export type BoardRuntimeState =
  | "planning"
  | "awaiting_review"
  | "implementation"
  | "execution"
  | "retrying"
  | "completed"
  | "failed"
  | "stalled";

export interface BoardColumn {
  id: string;
  title: string;
  trackerStates: string[];
  normalizedTrackerStates: string[];
  runtimeStates: BoardRuntimeState[];
  startsAgent: boolean;
  acceptsManualMoves: boolean;
}

export const boardColumnsForConfig = (config: NorthstarConfig): BoardColumn[] => {
  if (config.board.columns.length > 0) {
    return config.board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      trackerStates: column.tracker_states,
      normalizedTrackerStates: column.tracker_states.map(normalizeState),
      runtimeStates: column.runtime_states,
      startsAgent: column.starts_agent,
      acceptsManualMoves: column.accepts_manual_moves ?? column.tracker_states.length > 0
    }));
  }
  return defaultBoardColumns(config);
};

export const trackerStatesForBoard = (columns: BoardColumn[]): string[] => {
  const states: string[] = [];
  const seen = new Set<string>();
  for (const column of columns) {
    for (const state of column.trackerStates) {
      const normalized = normalizeState(state);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      states.push(state);
    }
  }
  return states;
};

const defaultBoardColumns = (config: NorthstarConfig): BoardColumn[] => {
  const columns: BoardColumn[] = [];
  const seenIds = new Set<string>();
  const push = (input: {
    id?: string;
    title: string;
    trackerStates?: string[];
    runtimeStates?: BoardRuntimeState[];
    startsAgent?: boolean;
    acceptsManualMoves?: boolean;
  }) => {
    const id = uniqueId(input.id ?? slugify(input.title), seenIds);
    const trackerStates = input.trackerStates ?? [];
    columns.push({
      id,
      title: input.title,
      trackerStates,
      normalizedTrackerStates: trackerStates.map(normalizeState),
      runtimeStates: input.runtimeStates ?? [],
      startsAgent: input.startsAgent ?? false,
      acceptsManualMoves: input.acceptsManualMoves ?? trackerStates.length > 0
    });
  };

  for (const state of config.tracker.active_states) {
    push({ title: state, trackerStates: [state], startsAgent: true });
  }
  push({ title: "Planning", runtimeStates: ["planning"], acceptsManualMoves: false });
  if (config.approval_gates.awaiting_state) {
    push({
      title: config.approval_gates.awaiting_state,
      trackerStates: [config.approval_gates.awaiting_state],
      runtimeStates: ["awaiting_review"]
    });
  } else {
    push({ title: "Human Review", runtimeStates: ["awaiting_review"], acceptsManualMoves: false });
  }
  push({ title: "Implementing", runtimeStates: ["implementation", "execution"], acceptsManualMoves: false });
  push({ title: "Retrying", runtimeStates: ["retrying"], acceptsManualMoves: false });
  if (config.feedback.transitions.completed_state) {
    push({
      title: config.feedback.transitions.completed_state,
      trackerStates: [config.feedback.transitions.completed_state],
      runtimeStates: ["completed"]
    });
  } else {
    for (const state of config.tracker.terminal_states) {
      push({ title: state, trackerStates: [state], runtimeStates: ["completed"] });
    }
  }
  if (config.feedback.transitions.failed_state) {
    push({
      title: config.feedback.transitions.failed_state,
      trackerStates: [config.feedback.transitions.failed_state],
      runtimeStates: ["failed"]
    });
  } else {
    push({ title: "Failed", runtimeStates: ["failed"], acceptsManualMoves: false });
  }
  return columns;
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "column";

const uniqueId = (base: string, seen: Set<string>): string => {
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
};

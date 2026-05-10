import type { BoardColumn } from "../board/columns.js";
import type { NorthstarConfig } from "../workflow/schema.js";

export interface ResolvedDispatchPolicy {
  states: string[];
  requireUnblocked: boolean;
  requireReadyLabel: boolean;
  readyLabels: string[];
  blockedLabels: string[];
}

export const resolveDispatchPolicy = (config: NorthstarConfig, columns: BoardColumn[]): ResolvedDispatchPolicy => {
  const states =
    config.dispatch.mode === "board_start_columns"
      ? statesForStartColumns(columns)
      : config.dispatch.states.length > 0
        ? config.dispatch.states
        : config.tracker.active_states;
  return {
    states,
    requireUnblocked: config.dispatch.require_unblocked,
    requireReadyLabel: config.dispatch.require_ready_label,
    readyLabels: config.dispatch.ready_labels,
    blockedLabels: config.dispatch.blocked_labels
  };
};

const statesForStartColumns = (columns: BoardColumn[]): string[] => {
  const states: string[] = [];
  const seen = new Set<string>();
  for (const column of columns) {
    if (!column.startsAgent) continue;
    for (const state of column.trackerStates) {
      const normalized = state.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      states.push(state);
    }
  }
  return states;
};

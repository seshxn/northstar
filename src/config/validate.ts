import type { NorthstarConfig } from "../workflow/schema.js";
import { boardColumnsForConfig } from "../board/columns.js";
import { normalizeState } from "../orchestrator/state.js";
import { resolveDispatchPolicy } from "../orchestrator/dispatch-policy.js";

export interface ConfigValidationResult {
  warnings: string[];
}

export const validateConfig = (config: NorthstarConfig): ConfigValidationResult => {
  if (!config.tracker.kind) throw new Error("tracker.kind is required");
  if (config.tracker.kind === "linear" && !config.tracker.project_slug) throw new Error("tracker.project_slug is required for Linear");
  if (config.tracker.kind === "jira" && (!config.tracker.email || !config.tracker.api_token || !config.tracker.project_key)) {
    throw new Error("Jira tracker requires email, api_token, and project_key");
  }
  if (config.tracker.kind === "github") {
    if (!config.tracker.token) throw new Error("GitHub tracker requires token");
    if (!config.tracker.repo) throw new Error("GitHub tracker requires repo");
  }
  validateServerExposure(config);
  const warnings = [
    ...dispatchWarnings(config),
    ...runtimeIntegrationWarnings(config)
  ];
  return { warnings };
};

const validateServerExposure = (config: NorthstarConfig): void => {
  if (config.server.port == null) return;
  if (isLocalHost(config.server.host)) return;
  if (config.server.auth_token) return;
  if (config.server.allow_unauthenticated_remote) return;
  throw new Error("server.auth_token is required when binding the dashboard/API to a non-local host");
};

const isLocalHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
};

const dispatchWarnings = (config: NorthstarConfig): string[] => {
  if (!config.board?.columns || config.board.columns.length === 0 || !config.dispatch) return [];
  const startStates = config.board.columns
    .filter((column) => column.starts_agent)
    .flatMap((column) => column.tracker_states)
    .map(normalizeState);
  if (startStates.length === 0) return [];
  const resolved = resolveDispatchPolicy(config, boardColumnsForConfig(config)).states.map(normalizeState);
  const startSet = new Set(startStates);
  const dispatchSet = new Set(resolved);
  const differs = startSet.size !== dispatchSet.size || [...startSet].some((state) => !dispatchSet.has(state));
  return differs
    ? ["Board starts_agent columns do not match the resolved dispatch states; operators may see a column as agent-starting when it is not."]
    : [];
};

const runtimeIntegrationWarnings = (config: NorthstarConfig): string[] => {
  if (config.runtime.kind !== "claude_code" && config.runtime.kind !== "codex_app_server") return [];
  const enabled = [
    config.integrations.github?.enabled,
    config.integrations.jira_tools?.enabled,
    config.integrations.slack?.enabled,
    config.integrations.confluence?.enabled
  ].some(Boolean);
  return enabled
    ? [`${config.runtime.kind} does not execute Northstar integration tools through the shared function-calling harness; enabled integration tools may only be available through runtime-native tooling.`]
    : [];
};

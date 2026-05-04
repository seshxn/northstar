import type { NorthstarConfig } from "../workflow/schema.js";

export function validateConfig(config: NorthstarConfig): void {
  if (!config.tracker.kind) throw new Error("tracker.kind is required");
  if (config.tracker.kind === "linear" && !config.tracker.project_slug) throw new Error("tracker.project_slug is required for Linear");
  if (config.tracker.kind === "jira" && (!config.tracker.email || !config.tracker.api_token || !config.tracker.project_key)) {
    throw new Error("Jira tracker requires email, api_token, and project_key");
  }
}

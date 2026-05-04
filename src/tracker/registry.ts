import type { NorthstarConfig } from "../workflow/schema.js";
import type { Tracker } from "./types.js";
import { LinearTracker } from "./linear/adapter.js";
import { JiraTracker } from "./jira/adapter.js";

export function trackerForConfig(config: NorthstarConfig): Tracker {
  return config.tracker.kind === "jira" ? new JiraTracker(config.tracker) : new LinearTracker(config.tracker);
}

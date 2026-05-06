import type { NorthstarConfig } from "../workflow/schema.js";
import type { Tracker } from "./types.js";
import { LinearTracker } from "./linear/adapter.js";
import { JiraTracker } from "./jira/adapter.js";
import { GitHubTracker } from "./github/adapter.js";

export const trackerForConfig = (config: NorthstarConfig): Tracker => {
  if (config.tracker.kind === "jira") return new JiraTracker(config.tracker);
  if (config.tracker.kind === "github") return new GitHubTracker(config.tracker);
  return new LinearTracker(config.tracker);
};

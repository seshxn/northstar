import type { NorthstarConfig } from "../workflow/schema.js";
import type { Tool } from "./types.js";
import { LinearGraphqlTool } from "./linear-graphql.js";
import { JiraRestTool } from "./jira-rest.js";
import { GitHubTool } from "./github.js";
import { SlackPostTool } from "./slack.js";
import { ConfluencePageTool } from "./confluence.js";

export const buildTools = (config: NorthstarConfig): Tool[] => {
  const tools: Tool[] = [];
  if (config.tracker.kind === "linear" && config.tracker.api_key && config.integrations.linear_graphql?.enabled !== false) {
    tools.push(new LinearGraphqlTool({ endpoint: config.tracker.endpoint, apiKey: config.tracker.api_key }));
  }
  if (config.integrations.jira_tools?.enabled) {
    tools.push(
      new JiraRestTool({
        baseUrl: config.integrations.jira_tools.base_url ?? "",
        email: config.integrations.jira_tools.email,
        apiToken: config.integrations.jira_tools.api_token
      })
    );
  }
  if (config.integrations.github?.enabled) {
    tools.push(new GitHubTool({ token: config.integrations.github.token, defaultRepo: config.integrations.github.default_repo }));
  }
  if (config.integrations.slack?.enabled) {
    tools.push(new SlackPostTool({ token: config.integrations.slack.token, defaultChannel: config.integrations.slack.default_channel }));
  }
  if (config.integrations.confluence?.enabled) {
    tools.push(
      new ConfluencePageTool({
        baseUrl: config.integrations.confluence.base_url ?? "",
        email: config.integrations.confluence.email,
        apiToken: config.integrations.confluence.api_token,
        defaultSpace: config.integrations.confluence.default_space
      })
    );
  }
  return tools;
};

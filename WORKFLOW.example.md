---
tracker:
  kind: jira
  endpoint: https://acme.atlassian.net
  email: $JIRA_EMAIL
  api_token: $JIRA_API_TOKEN
  project_key: SYM
  active_states: ["To Do", "In Progress"]
  terminal_states: ["Done", "Cancelled", "Won't Do"]

runtime:
  kind: claude_code
  model: claude-opus-4-7
  api_key: $ANTHROPIC_API_KEY
  approval_policy: auto

workspace:
  root: ~/northstar_workspaces

integrations:
  github:
    enabled: true
    token: $GITHUB_TOKEN
    default_repo: openai/northstar
  jira_tools:
    enabled: true
    base_url: https://acme.atlassian.net
    email: $JIRA_EMAIL
    api_token: $JIRA_API_TOKEN
  slack:
    enabled: false
---
You are working on {{ issue.identifier }}: {{ issue.title }}.

Use the available tools only when they directly advance the issue.

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

agent:
  max_concurrent_agents: 4
  max_concurrent_agents_by_state:
    "In Progress": 2

server:
  host: 127.0.0.1
  port: 4000

skills:
  enabled: true
  mode: prompt_injection
  default_sequence: ["spec", "plan", "tdd", "verify", "review"]
  label_sequences:
    security: ["threat_model", "security_review"]
    docs: ["documentation"]

quality_gates:
  enabled: true
  mode: sequential
  default_sequence: ["test", "review"]
  label_sequences:
    security: ["security_review"]
    docs: ["docs"]

policy:
  disallowed_tools_by_label:
    external: ["slack_post"]

feedback:
  comments_enabled: true
  transitions:
    started_state: "In Progress"
    completed_state: "Review"
    failed_state: "Blocked"

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

Issue URL: {{ issue.url | default: "not provided" }}
Priority: {{ issue.priority | default: "not provided" }}
Labels: {{ issue.labels | join: ", " }}

Use the available tools only when they directly advance the issue.

If your runtime has local skills installed, follow the matching workflow before implementation:

1. Clarify or write a short spec when the issue is ambiguous.
2. Break work into small, verifiable tasks.
3. Use test-driven development for behavior changes.
4. Use systematic debugging for failing tests or unexpected behavior.
5. Run fresh verification commands before claiming completion.
6. Request code review before merge or handoff.

Prefer the repository's existing patterns and keep changes scoped to this issue.

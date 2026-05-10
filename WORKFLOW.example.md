---
# Tracker options — uncomment one block and remove the others.
#
# GitHub Issues:
# tracker:
#   kind: github
#   token: $GITHUB_TOKEN
#   repo: owner/repo
#   labels: []                          # optional: filter to issues with these labels
#   active_states: [open]
#   terminal_states: [closed]
#
# Linear:
# tracker:
#   kind: linear
#   api_key: $LINEAR_API_KEY
#   project_slug: my-project
#   active_states: ["Todo", "In Progress"]
#   terminal_states: ["Done", "Cancelled"]

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
  planning_model: claude-opus-4-7
  api_key: $ANTHROPIC_API_KEY
  approval_policy: auto

workspace:
  root: ~/northstar_workspaces
  strategy: git_worktree
  repo: ~/src/product-repo
  base_branch: main
  branch_template: "northstar/{{ issue.identifier | downcase }}-{{ issue.title | slug }}"
  reuse_existing: true
  cleanup:
    remove_after_pr_merge: false

agent:
  max_concurrent_agents: 4
  max_concurrent_agents_by_state:
    "In Progress": 2

dispatch:
  mode: tracker_states
  states: ["In Progress"]
  require_unblocked: true
  blocked_labels: ["blocked", "needs-human"]

server:
  host: 127.0.0.1
  port: 4000
  # Required when binding to a non-local host unless allow_unauthenticated_remote is true.
  auth_token: $NORTHSTAR_DASHBOARD_TOKEN

storage:
  kind: json
  path: ~/.northstar/state.json
  retention_days: 30

sequencing:
  enabled: true
  mode: advisory
  scan_on_refresh: false
  write_tracker_relationships: false

board:
  columns:
    - id: todo
      title: Todo
      tracker_states: ["To Do"]
      starts_agent: false
    - id: in-progress
      title: In Progress
      tracker_states: ["In Progress"]
      starts_agent: true
    - id: planning
      title: Planning
      runtime_states: ["planning"]
    - id: human-review
      title: Human Review
      tracker_states: ["Human Review"]
      runtime_states: ["awaiting_review"]
    - id: implementing
      title: Implementing
      runtime_states: ["implementation", "execution"]
    - id: retrying
      title: Retrying
      runtime_states: ["retrying"]
    - id: review
      title: Review
      tracker_states: ["Review"]
      runtime_states: ["completed"]
    - id: blocked
      title: Blocked
      tracker_states: ["Blocked"]
      runtime_states: ["failed"]

pull_request:
  enabled: true
  provider: github
  repo: openai/northstar
  token: $GITHUB_TOKEN
  base_branch: main
  draft: true
  labels: ["northstar", "agent-generated"]
  labels_by_issue_label:
    security: ["security-review-required"]
    docs: ["documentation"]
  reviewers: []
  title_template: "{{ issue.identifier }}: {{ issue.title }}"
  body_template: |
    ## Summary

    {{ northstar.summary }}

    ## Approved Plan

    {{ northstar.approved_plan }}

    ## Verification

    {{ northstar.verification }}

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

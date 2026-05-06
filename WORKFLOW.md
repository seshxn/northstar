---
tracker:
  kind: github
  token: $GITHUB_TOKEN
  repo: seshxn/northstar
  active_states: [open]
  terminal_states: [closed]

runtime:
  kind: claude_code
  model: claude-sonnet-4-6
  allowed_tools: [Bash, Read, Write, Edit, Glob, Grep, Agent]

workspace:
  root: ~/northstar_workspaces

agent:
  max_concurrent_agents: 2

server:
  host: 127.0.0.1
  port: 4000

skills:
  enabled: true
  mode: prompt_injection
  default_sequence: ["spec", "plan", "tdd", "verify", "review"]

quality_gates:
  enabled: true
  mode: sequential
  default_sequence: ["test", "review"]

approval_gates:
  enabled: true

feedback:
  comments_enabled: true
---

You are working on {{ issue.identifier }}: {{ issue.title }} in the Northstar repository.

Issue URL: {{ issue.url | default: "not provided" }}
Priority: {{ issue.priority | default: "not provided" }}
Labels: {{ issue.labels | join: ", " }}

Northstar is a TypeScript orchestration harness for issue-driven coding-agent workflows.
Repository: /Users/seshanpillay/Documents/GitHub/northstar

Key modules:

- src/workflow/ — WORKFLOW.md loading, YAML config parsing, Liquid prompt rendering
- src/tracker/ — Issue normalisation; Linear, Jira, GitHub adapters
- src/runtime/ — Runtime interface; Codex, Claude Code, Bedrock, Gemini harnesses
- src/orchestrator/ — Dispatch, state, retry, reconciliation
- src/workspace/ — Per-issue directory creation and lifecycle hooks
- src/tools/ — Integration tool contracts and per-runtime spec adapters
- src/observability/ — HTTP server, dashboard, result snapshots

Commands:
npm run build
npm test
npm run spec:check

Guidelines:

- Use test-driven development for all behaviour changes.
- Run `npm run build && npm test` before claiming completion.
- Keep changes scoped to the issue. Do not refactor adjacent code.
- Do not add or modify workflow config keys unless schema.ts, docs, and tests are updated together.
- Prefer editing existing files over creating new ones.

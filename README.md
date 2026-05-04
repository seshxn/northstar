# Northstar

Agent orchestration for issue-driven development workflows.

## CLI

```bash
npm install
npm run build
npx northstar ./WORKFLOW.md --port 4000
```

The CLI loads `WORKFLOW.md`, polls the configured tracker, dispatches per-issue agent sessions, and optionally exposes the HTTP status surface at `/api/v1/state`.

## Trust Posture

This implementation targets high-trust local development. It assumes credentials come from environment-variable indirection, redacts known secret keys from structured logs, scopes built-in file tools to the issue workspace, and fails rather than prompting when runtime user input would be required.

## Supported Extensions

Runtime selection is configured through `runtime.kind`: `codex_app_server`, `claude_code`, `bedrock_anthropic`, or `gemini`. Tracker selection is configured through `tracker.kind`: `linear` or `jira`. Optional tools are enabled under `integrations`.

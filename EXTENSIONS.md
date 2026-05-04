# Northstar Extension Profile

`runtime` replaces the legacy top-level `codex` block. A legacy `codex` block is accepted as sugar for:

```yaml
runtime:
  kind: codex_app_server
```

Supported runtime kinds:

- `codex_app_server`: `command`, `approval_policy`, `thread_sandbox`, `turn_sandbox_policy`, `turn_timeout_ms`, `read_timeout_ms`, `stall_timeout_ms`.
- `claude_code`: `model`, `api_key`, `max_turns`, `allowed_tools`, `disallowed_tools`, `approval_policy`.
- `bedrock_anthropic`: `model_id`, `region`, `max_tokens`, `aws_profile`, `builtin_tools`.
- `gemini`: `model`, `api_key`, `max_tokens`, `builtin_tools`.

Supported tracker kinds:

- `linear`: spec-compatible Linear GraphQL polling.
- `jira`: Atlassian Cloud REST v3 with `endpoint`, `email`, `api_token`, `project_key`, optional `jql`, `active_states`, and `terminal_states`.

Supported integration tools:

- `linear_graphql`
- `jira_rest`
- `github`
- `slack_post`
- `confluence_page`

Changes to workflow config are loaded by the file watcher. HTTP listener host/port changes require restart.

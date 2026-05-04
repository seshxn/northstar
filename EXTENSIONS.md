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

`watchWorkflow()` can reload workflow config for callers that wire it in. The CLI service currently requires restart for workflow and HTTP listener changes.

## Agent Skills

Northstar treats agent skills as prompt-level operating instructions through the supported `skills:` workflow config block.

Current integration pattern:

1. Install the desired skill pack in the coding-agent environment.
2. Add concise skill-use rules to the `WORKFLOW.md` prompt body.
3. Let the selected runtime invoke its local skill mechanism.

Useful skill families:

- Superpowers: brainstorming, writing plans, test-driven development, systematic debugging, verification before completion, requesting code review, and finishing a development branch.
- Addy Osmani's Agent Skills: idea refinement, spec-driven development, planning and task breakdown, incremental implementation, TDD, API/interface design, debugging, review, hardening, documentation, and shipping.

Supported shape:

```yaml
skills:
  enabled: true
  mode: prompt_injection
  default_sequence:
    - spec
    - plan
    - tdd
    - verify
    - review
  label_sequences:
    security:
      - threat_model
      - tdd
      - security_review
      - verify
```

Northstar resolves `default_sequence` plus any matching `label_sequences` into concise prompt guidance. The selected runtime is responsible for invoking its own installed skill mechanism.

## Quality Gates

Sequential quality gates can run after the implementation turn:

```yaml
quality_gates:
  enabled: true
  mode: sequential
  default_sequence: ["test", "review"]
  label_sequences:
    security: ["security_review"]
    docs: ["docs"]
```

Gates run in the same runtime session. A failed gate turns the issue run into a failed result and schedules retry according to the normal retry policy.

## Policy

Tool access can be constrained with:

```yaml
policy:
  allowed_tools: ["linear_graphql", "github"]
  disallowed_tools: ["slack_post"]
  allowed_tools_by_label:
    security: ["linear_graphql", "jira_rest"]
  disallowed_tools_by_label:
    external: ["github"]
```

If a label-specific allowlist matches, it overrides the global allowlist for that issue. Deny rules are applied after allow rules.

## Feedback

Tracker comments and optional state transitions can be configured with:

```yaml
feedback:
  comments_enabled: true
  transitions:
    started_state: "In Progress"
    completed_state: "Review"
    failed_state: "Blocked"
```

Transitions are best-effort and require tracker support.

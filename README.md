# Northstar

Northstar is a TypeScript orchestration harness for issue-driven coding-agent workflows. It loads a Markdown workflow, polls Linear or Jira, runs per-issue agent sessions in isolated workspaces, and exposes an operator dashboard plus HTTP status API.

## Current Status

This repository is an early implementation, but the core issue-run loop is wired.

Implemented today:

- Workflow loading with YAML front matter and strict Liquid prompt rendering.
- Linear and Jira issue normalization, including labels, priorities, branches, and blockers.
- Runtime adapters for `codex_app_server`, `claude_code`, `bedrock_anthropic`, and `gemini`.
- Workspace lifecycle utilities with contained paths and lifecycle hooks.
- Optional integration tool contracts for Linear GraphQL, Jira REST, GitHub, Slack, and Confluence.
- Dispatch ordering, concurrency limits, blocker checks, retries, reconciliation, stalled-run restart, and result snapshots.
- Prompt-level skill profiles with label-driven sequences.
- Sequential quality gates for test, review, security, docs, or custom gate prompts.
- Tool policies for global and label-specific allow/deny rules.
- Tracker feedback through comments and optional state transitions.
- HTTP endpoints and dashboard for state inspection, manual refresh, stop, and retry.

Important gaps:

- Bedrock and Gemini runtimes are explicitly experimental and return failed turns until real provider tool loops are implemented.
- Workflow file watching and SSH workers exist as utilities but are not wired into the CLI service loop yet.
- Quality gates currently run sequentially in the same runtime session, not as parallel independent agents.

See [docs/GAPS_AND_AGENT_SKILLS.md](docs/GAPS_AND_AGENT_SKILLS.md) for the gap analysis, feature roadmap, and skill-integration plan.

## Quick Start

Prerequisites:

- Node.js 22 or newer.
- Tracker credentials for either Linear or Jira.
- At least one coding-agent runtime installed and authenticated if you want live agent execution later.

Install and verify the project:

```bash
npm install
npm run build
npm test
npm run spec:check
```

Create a workflow file:

```bash
cp WORKFLOW.example.md WORKFLOW.md
```

Set the environment variables referenced by your workflow. Common variables are:

| Variable | Used by |
| --- | --- |
| `LINEAR_API_KEY` | Linear tracker and Linear GraphQL tool |
| `JIRA_EMAIL` | Jira tracker and Jira REST tool |
| `JIRA_API_TOKEN` | Jira tracker and Jira REST tool |
| `GITHUB_TOKEN` | GitHub integration tool |
| `SLACK_TOKEN` | Slack posting tool |
| `CONFLUENCE_API_TOKEN` | Confluence page tool |
| `ANTHROPIC_API_KEY` | Claude Code runtime, depending on local auth setup |
| `GOOGLE_API_KEY` | Gemini runtime, once the model loop is wired |
| `AWS_PROFILE` | Bedrock runtime, depending on AWS configuration |

Run the local service:

```bash
npm run build
node dist/src/cli.js ./WORKFLOW.md --port 4000
```

Open the dashboard at `http://127.0.0.1:4000/`, or inspect state directly:

```bash
curl http://127.0.0.1:4000/api/v1/state
curl -X POST http://127.0.0.1:4000/api/v1/refresh
```

When published or linked as a package, the same CLI is exposed as:

```bash
npx northstar ./WORKFLOW.md --port 4000
```

## Workflow Files

`WORKFLOW.md` has YAML front matter followed by a Liquid prompt template. The YAML config selects the tracker, runtime, workspace root, concurrency, hooks, server settings, and integrations. The Markdown body is rendered with an `issue` object before it is sent to the runtime.
Northstar also appends generated issue context and configured skill-gate instructions to the rendered prompt.

Start from [WORKFLOW.example.md](WORKFLOW.example.md). Keep credentials as `$ENV_VAR` references so secrets are resolved at runtime instead of written to disk.

## Runtime Support

Runtime selection is configured through `runtime.kind`.

| Runtime kind | Current behavior |
| --- | --- |
| `codex_app_server` | Spawns the configured Codex app-server command when `runTurn()` is called. |
| `claude_code` | Spawns the local `claude` CLI with stream JSON output when `runTurn()` is called. |
| `bedrock_anthropic` | Experimental. Returns a failed turn explaining that provider model execution is not implemented yet. |
| `gemini` | Experimental. Returns a failed turn explaining that provider model execution is not implemented yet. |

## Tracker Support

Tracker selection is configured through `tracker.kind`.

| Tracker kind | Notes |
| --- | --- |
| `linear` | Uses Linear GraphQL, active and terminal state filters, project/assignee filters, pagination, and blocker normalization. |
| `jira` | Uses Atlassian Cloud REST v3 with endpoint, email, API token, project key, optional JQL, active states, and terminal states. |

## Agent Skill Workflows

Northstar supports prompt-level skill profiles through the `skills` workflow block. It does not vendor or execute skill packs itself; it asks the selected coding agent to follow matching local skills.

Good default sequence for coding-agent runs:

1. Clarify or write a short spec for ambiguous work.
2. Break the work into small verifiable tasks.
3. Use test-driven development for behavior changes.
4. Use systematic debugging for failures.
5. Verify with fresh commands before claiming completion.
6. Request review before merge or handoff.

This maps cleanly to local Superpowers skills such as brainstorming, writing plans, test-driven development, systematic debugging, verification before completion, and code review. It also maps to Addy Osmani's Agent Skills lifecycle: define, plan, build, verify, review, and ship.

For repo-specific coding-agent instructions, see [AGENTS.md](AGENTS.md).

## Policy And Feedback

Use `policy` to restrict tools globally or by issue label. Label-specific allow rules override global allow rules for matching labels, then deny rules remove tools.

Use `feedback` to control tracker comments and optional state transitions. Comments are best-effort, and transitions are skipped for trackers that do not implement `updateIssueState`.

Use `quality_gates` to run extra sequential turns after the implementation turn succeeds. Built-in gate names include `test`, `review`, `security_review`, and `docs`; unknown names are passed through as custom gate prompts.

## Development

Useful commands:

```bash
npm run build
npm test
npm run test:watch
npm run spec:check
```

CI runs install, build, tests, and the conformance checklist through `.github/workflows/ci.yml`.

## Trust Posture

Northstar targets high-trust local development. It assumes credentials come from environment-variable indirection, redacts known secret keys from structured logs, scopes built-in file tools to the issue workspace, and fails rather than prompting when runtime user input would be required.

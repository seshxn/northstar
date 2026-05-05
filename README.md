# Northstar

Northstar is a TypeScript orchestration harness for issue-driven coding-agent workflows. It loads a Markdown workflow, polls Linear or Jira, runs per-issue agent sessions in isolated workspaces, and exposes an operator dashboard plus HTTP status API.

## Current Status

The core issue-run loop is wired. Implemented features:

- Workflow loading with YAML front matter and Liquid prompt rendering, with hot-reload on file change.
- Linear and Jira issue normalization, including labels, priorities, branches, and blockers.
- Runtime adapters for `codex_app_server`, `claude_code`, `bedrock_anthropic` (Converse API), and `gemini` (generateContent).
- Workspace lifecycle utilities with contained paths and lifecycle hooks.
- Optional integration tool contracts for Linear GraphQL, Jira REST, GitHub, Slack, and Confluence.
- Dispatch ordering, concurrency limits, blocker checks, retries, reconciliation, stalled-run restart, and result snapshots.
- Prompt-level skill profiles with label-driven sequences.
- Sequential quality gates for test, review, security, docs, or custom gate prompts.
- Tool policies for global and label-specific allow/deny rules.
- Tracker feedback through comments and optional state transitions.
- HTTP endpoints and dashboard for state inspection, manual refresh, stop, and retry.

Known limitation:

- Quality gates run sequentially in the same runtime session, not as parallel independent agents. See [ADR-005](docs/decisions/0005-sequential-quality-gates.md) for the rationale.

## Quick Start

### Prerequisites

- Node.js 22 or newer.
- Credentials for at least one issue tracker (Linear API key, or Jira email + API token).
- A coding-agent runtime installed locally if you want live agent execution: Claude Code (`npm install -g @anthropic-ai/claude-code`) or Codex.

### 1. Install and verify

```bash
npm install
npm run build
npm test
```

### 2. Create your workflow file

```bash
cp WORKFLOW.example.md WORKFLOW.md
```

Open `WORKFLOW.md` and edit the YAML front matter to point at your tracker, runtime, and workspace:

- Set `tracker.kind` to `linear` or `jira` and fill in the matching credentials.
- Set `runtime.kind` to `claude_code` (or `codex_app_server`).
- Set `workspace.root` to where you want per-issue working directories created (defaults to a temp directory).

Keep credentials as `$ENV_VAR` references — they are resolved at startup, not stored in the file.

### 3. Export your credentials

Set the environment variables referenced by your `WORKFLOW.md`:

| Variable | Used by |
| --- | --- |
| `LINEAR_API_KEY` | Linear tracker and Linear GraphQL integration tool |
| `JIRA_EMAIL` | Jira tracker and Jira REST integration tool |
| `JIRA_API_TOKEN` | Jira tracker and Jira REST integration tool |
| `ANTHROPIC_API_KEY` | Claude Code runtime (if not using `claude auth login`) |
| `GITHUB_TOKEN` | GitHub integration tool |
| `SLACK_TOKEN` | Slack posting integration tool |
| `CONFLUENCE_API_TOKEN` | Confluence page integration tool |
| `GOOGLE_API_KEY` | Gemini runtime (experimental) |
| `AWS_PROFILE` | Bedrock runtime (experimental) |

### 4. Run the service

```bash
node dist/src/cli.js ./WORKFLOW.md --port 4000
```

Open the dashboard at `http://127.0.0.1:4000/`, or query the state API directly:

```bash
curl http://127.0.0.1:4000/api/v1/state
curl -X POST http://127.0.0.1:4000/api/v1/refresh
```

Omit `--port` to run a single-pass tick (fetch issues, start agent runs, exit when all runs finish) without starting the HTTP server. This is useful for one-shot CI jobs.

Once published or globally linked:

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

## Architecture

```
WORKFLOW.md  →  Orchestrator  →  Tracker (Linear / Jira)
                     │
                     ├── Workspace (per-issue directory)
                     ├── Tool policy filter
                     ├── Skill profile injector
                     ├── Runtime (Codex / Claude Code / Bedrock / Gemini)
                     │       └── Quality gates (sequential turns)
                     └── Feedback (tracker comments + state transitions)

HTTP server  →  state, refresh, stop, retry endpoints
Dashboard    →  browser UI consuming the state endpoint
```

Key modules:

| Module | Purpose |
| --- | --- |
| `src/workflow/` | WORKFLOW.md loading, YAML parsing, Liquid prompt rendering |
| `src/tracker/` | Normalised `Issue` model; Linear and Jira adapters |
| `src/runtime/` | Runtime interface; Codex, Claude Code, Bedrock, Gemini harnesses |
| `src/orchestrator/` | Dispatch, state, retry, reconciliation, stall restart |
| `src/workspace/` | Per-issue directory creation and lifecycle hooks |
| `src/tools/` | Integration tool contracts and per-runtime spec adapters |
| `src/skills/` | Skill-sequence resolution and prompt injection |
| `src/quality/` | Quality gate sequence resolution and prompt construction |
| `src/policy/` | Tool allow/deny filtering by label |
| `src/context/` | Deterministic issue-context assembly for prompts |
| `src/observability/` | HTTP server, dashboard, and result snapshots |

See [docs/decisions/](docs/decisions/) for architecture decision records covering key design choices.

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

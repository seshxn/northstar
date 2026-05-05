# AGENTS.md

This file gives coding agents practical guidance for working in the Northstar repository.

## Project Overview

Northstar is a TypeScript CLI for issue-driven coding-agent orchestration. The implementation currently covers workflow parsing, tracker adapters, runtime adapters, workspace utilities, integration tool contracts, dispatch state, retry/reconciliation behavior, skill profiles, tool policies, feedback transitions, and a small HTTP dashboard/API.

Before implying provider parity, check the current code path in `src/runtime/`: Codex and Claude Code have concrete process-based turns, while Bedrock and Gemini are explicit experimental placeholders.

## Important Files

- `src/cli.ts`: CLI argument parsing, workflow load, tracker/runtime construction, HTTP server startup, and one orchestrator tick.
- `src/workflow/`: Markdown workflow loading, YAML config parsing, file watching, and Liquid prompt rendering.
- `src/tracker/`: normalized issue model plus Linear and Jira adapters.
- `src/runtime/`: runtime interface and Codex, Claude Code, Bedrock, and Gemini harnesses.
- `src/workspace/`: contained workspace creation, lifecycle hooks, and cleanup.
- `src/tools/`: optional integration tools and runtime-specific tool spec adapters.
- `src/orchestrator/`: dispatch, state, retry, and reconciliation helpers.
- `src/skills/`: prompt-level skill profile resolution.
- `src/quality/`: sequential quality gate prompts.
- `src/context/`: deterministic issue context assembly for prompts.
- `src/policy/`: tool allow/deny filtering.
- `src/observability/`: HTTP state surface, snapshots, and dashboard.
- `test/`: Vitest suites mapped to conformance sections.
- `docs/decisions/`: architecture decision records explaining key design choices.

## Commands

Use these commands after changing code:

```bash
npm run build
npm test
npm run spec:check
```

For documentation-only changes, at least inspect the rendered Markdown and run `npm run build` if examples or public API descriptions changed.

## Coding Guidelines

- Keep changes small and aligned with existing module boundaries.
- Prefer existing helpers over new abstractions.
- Do not add unsupported workflow config keys unless `src/workflow/schema.ts`, docs, and tests are updated in the same change.
- Keep credentials as `$ENV_VAR` indirections in docs and examples.
- Treat runtime/tool execution as a trust boundary. Validate paths, do not print secrets, and prefer failing closed over interactive prompts.
- Add or update tests when behavior changes.

## Agent Skill Guidance

If your coding environment supports skills, use them as process gates:

- Use a spec or brainstorming skill before designing major behavior.
- Use a planning skill before multi-file implementation.
- Use test-driven development for behavior changes.
- Use systematic debugging before fixing failures.
- Use verification before completion before claiming a task is complete.
- Use code review or security review skills before merge when the change touches runtime execution, tool access, credentials, or external APIs.

Northstar resolves skill profiles into prompt guidance. Skill execution still belongs in the selected coding-agent environment.

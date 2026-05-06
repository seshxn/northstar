# ADR-012: LLM-Based Dependency Detection

## Status

Accepted

## Context

Issue trackers model dependencies inconsistently. Linear uses blocker relationships; Jira uses issue links; GitHub Issues has no first-class dependency concept. Even when dependencies are tracked, they may be stale or incomplete. Operators want to know "does ENG-102 depend on ENG-101?" before dispatching the run.

## Decision

Implement an **optional LLM-based dependency sequencer** (`src/orchestrator/sequencer.ts`) that:

1. Takes all currently-tracked issue identifiers, titles, and descriptions.
2. Sends a single prompt to `claude-haiku-4-5-20251001` via the Anthropic Messages API asking it to identify dependencies.
3. Parses the response as `DependencyResult[]` — `{ issueId, blockedBy: string[] }`.
4. Stores results in `state.detectedDependencies: Map<string, string[]>`.
5. Surfaces them on `BoardCard.detectedDependencies` in the board snapshot.

The sequencer is **manual-trigger only** via `POST /api/v1/dependencies/scan`. It runs in an enqueued operation to prevent concurrent scans.

**Safety conditions** — the sequencer silently returns `[]` when:

- Fewer than 2 issues are tracked (no dependencies possible).
- `ANTHROPIC_API_KEY` is not set.
- The runtime is not `claude_code`.
- Any network or parse error occurs.

## Consequences

**Good:**

- Works across all trackers regardless of their native dependency model.
- Haiku is fast and cheap for a structured extraction task over short texts.
- Graceful no-op design means the sequencer never blocks the orchestrator.

**Bad:**

- Requires `ANTHROPIC_API_KEY` even when using Bedrock or Gemini runtimes.
- LLM results are not authoritative — they reflect textual cues in descriptions, not actual code coupling.
- Results are in-memory only and not synced back to the tracker.
- A separate API call is required per scan; there is no incremental update as issues change.

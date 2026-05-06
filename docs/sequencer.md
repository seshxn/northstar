# LLM Dependency Sequencer

The dependency sequencer (`src/orchestrator/sequencer.ts`) detects cross-issue dependencies by asking a language model to analyze issue titles and descriptions.

## What It Does

Given a list of open issues, the sequencer produces a set of `DependencyResult` records:

```typescript
interface DependencyResult {
  issueId: string;
  blockedBy: string[]; // issueIds that must complete first
}
```

These results are stored in `state.detectedDependencies` (a `Map<string, string[]>`) and surfaced on each `BoardCard` as the `detectedDependencies` field. The board UI renders a `blocked` badge on any card with detected dependencies.

## When It Runs

The sequencer is **manual-trigger only**. It runs when an operator calls:

```bash
POST /api/v1/dependencies/scan
```

or clicks "Scan Dependencies" in the Settings page. The orchestrator enqueues the scan to avoid concurrent scans and processes it on the next tick.

## How It Works

The sequencer sends a single prompt to the Anthropic Messages API (`claude-haiku-4-5-20251001` by default). The prompt includes identifier, title, and description for each issue and asks for a JSON array of dependency relationships.

The model response is parsed as `DependencyResult[]`. Any parse error or network failure produces an empty result set — the sequencer is designed to be silent on failure rather than surface errors to operators.

## Configuration

The sequencer is only active when:

1. The workflow runtime is `claude_code` (or any runtime that provides an `ANTHROPIC_API_KEY`).
2. `ANTHROPIC_API_KEY` is set in the environment.
3. There are at least two open issues (fewer cannot have dependencies).

If any condition is not met, `analyzeDependencies()` returns `[]` immediately.

## Limitations

- Results reflect the LLM's understanding at the time of the scan; they are not updated automatically as issue content changes.
- The scan applies to all currently-tracked issues, not a filtered subset.
- Dependencies are stored in memory only and reset on process restart.
- The sequencer does not update tracker relationships — it only annotates the in-memory board view.

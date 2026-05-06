# ADR-010: Optimistic UI Updates for Kanban Drag-and-Drop

## Status

Accepted

## Context

Moving a card on the Kanban board requires a POST to `/api/v1/issues/:id/move`. On a slow connection the card would lag visibly before snapping to the target column, making the board feel unresponsive.

## Decision

Apply optimistic UI updates for drag-and-drop moves:

1. On `onDragEnd`, capture the current board snapshot.
2. Immediately compute the new board state with `moveCardOptimistically(board, cardId, targetColumnId)`.
3. Set the board to the optimistic state before making the API call.
4. On API success, call `refresh()` to sync with the server.
5. On API failure, revert the board to the captured snapshot.

```tsx
const snapshot = board;
setBoard(moveCardOptimistically(board, cardId, targetColumnId));
moveIssue(issueId, targetState)
  .then(refresh)
  .catch(() => setBoard(snapshot));
```

`moveCardOptimistically` is a pure function — it takes the board and returns a new board with the card relocated, making it easy to test and reason about.

## Consequences

**Good:**

- Card moves feel instant regardless of network latency.
- Failure reverts cleanly to the last known good state.
- The optimistic function is pure, so the actual board state always reflects server truth after a successful refresh.

**Bad:**

- If the server rejects the move (e.g., invalid state transition), there is a visible snap-back. This is acceptable; operators see the error toast and understand why the move was rejected.
- Multiple fast moves before the first `refresh()` completes can stack; only the last API call's result drives the final revert or commit.

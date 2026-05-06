# ADR-013: Tracker State as Source of Truth (No Bidirectional Sync)

## Status

Accepted

## Context

The Kanban board allows operators to drag cards between columns. Some columns correspond to tracker states (e.g., "In Progress", "Done"). The question arose: should a board column move also write back to the tracker and update the issue state?

Additionally, after a run completes Northstar already posts a result comment to the tracker. Should it also transition the issue to a "Done" or "Completed" state automatically?

## Decision

**Tracker state is the source of truth.** Northstar does not automatically transition tracker issue states in response to board moves or run completion.

The one exception is the explicit `feedback.state_transition` config option, which allows operators to configure an optional state transition when Northstar posts a result comment. This is opt-in and only fires on comment-capable trackers.

Board moves via `POST /api/v1/issues/:id/move` call the tracker's `updateIssueState` method when the target column has a `moveState` configured. This is an operator action, not an automatic orchestrator action.

## Rationale

- Trackers are the authoritative record of issue status. Engineering managers, PMs, and other stakeholders read them. Automatic state transitions by an orchestrator would surprise these readers.
- State transition semantics differ per tracker: Linear has a finite set of workflow states, Jira has configurable workflows, GitHub has binary open/closed. A single automatic transition rule cannot be correct for all cases.
- Explicit operator board moves give control without removing the affordance entirely.

## Consequences

**Good:**

- No unexpected tracker state changes for stakeholders not watching the orchestrator.
- Tracker workflow rules (required fields on transition, approver roles) are not bypassed.
- Simple mental model: Northstar reads tracker state and writes comments; operators drive state changes.

**Bad:**

- Completed issues stay in active tracker states until an operator moves them, which can pollute the active issue backlog if the board is not monitored.
- Teams that want fully automated state management must configure `feedback.state_transition` carefully and accept the limitations around tracker-specific workflow enforcement.

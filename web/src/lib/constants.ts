export const AUDIT_KIND_LABELS: Record<string, string> = {
  issue_dispatched: "Dispatched",
  run_started: "Run started",
  plan_created: "Plan created",
  dependency_detected: "Dependency detected",
  run_completed: "Completed",
  run_failed: "Failed",
  approval_triggered: "Approved",
  feedback_triggered: "Feedback",
  rejection_triggered: "Rejected",
  retry_scheduled: "Retry scheduled",
  issue_stopped: "Stopped"
};

export const AUDIT_KIND_TONE: Record<string, "neutral" | "good" | "bad" | "warn" | "info"> = {
  run_completed: "good",
  approval_triggered: "good",
  run_failed: "bad",
  rejection_triggered: "bad",
  dependency_detected: "bad",
  issue_stopped: "bad",
  retry_scheduled: "warn",
  feedback_triggered: "warn",
  run_started: "info",
  plan_created: "info",
  issue_dispatched: "info"
};

export const ROUTES = [
  { path: "/", label: "Dashboard" },
  { path: "/board", label: "Board" },
  { path: "/runs", label: "Runs" },
  { path: "/prs", label: "PRs" },
  { path: "/activity", label: "Activity" },
  { path: "/topology", label: "Topology" },
  { path: "/settings", label: "Settings" }
] as const;

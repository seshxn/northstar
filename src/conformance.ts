export const conformanceChecklist = [
  { section: "17.1", tests: ["test/workflow/workflow.test.ts"] },
  { section: "17.2", tests: ["test/workspace/workspace.test.ts"] },
  { section: "17.3", tests: ["test/tracker/tracker.test.ts"] },
  { section: "17.4", tests: ["test/orchestrator/orchestrator.test.ts"] },
  { section: "17.5", tests: ["test/runtime/runtime.test.ts"] },
  { section: "17.6", tests: ["test/observability/observability.test.ts"] },
  { section: "17.7", tests: ["test/cli.test.ts"] },
  { section: "17.8", tests: ["test/integration/*.test.ts"] },
  { section: "18.1", tests: ["test/conformance.test.ts"] }
] as const;

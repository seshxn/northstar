# ADR-0004: Adapter and registry pattern for runtimes and trackers

## Status

Accepted

## Date

2025-04-01

## Context

Northstar must support multiple issue trackers (Linear, Jira, and potentially others) and multiple agent runtimes (Codex, Claude Code, Bedrock, Gemini). Each combination has different authentication, API shapes, and tool schemas. We need an architecture that:

- Lets the core orchestrator remain ignorant of provider specifics.
- Makes adding a new tracker or runtime a self-contained change.
- Gives TypeScript a single interface to type-check against throughout the codebase.
- Does not require a plugin system or dynamic module loading.

## Decision

Define narrow interfaces (`Tracker` in `src/tracker/types.ts`, `Runtime` in `src/runtime/types.ts`) and implement each provider as a concrete adapter class. Registry functions (`trackerForConfig` in `src/tracker/registry.ts`, `runtimeForConfig` in `src/runtime/registry.ts`) read the discriminated-union config and construct the appropriate adapter.

The orchestrator and service layer only ever hold `Tracker` and `Runtime` references, never provider-specific types.

## Alternatives Considered

### Class inheritance hierarchy

- Pros: Standard OOP pattern; IDE autocomplete for overrides.
- Cons: Inheritance couples the base class to all subclasses; TypeScript interface plus standalone class achieves the same contract without the coupling. Rejected; composition over inheritance.

### Dynamic module loading (`import()` by provider name)

- Pros: True plugin system; third-party providers without rebuilding.
- Cons: No static type safety for dynamically loaded modules; `import()` paths are harder to audit. Rejected; the fixed provider set does not justify the complexity.

### Strategy objects passed at runtime

- Pros: More functional style.
- Cons: In practice identical to interface + class; adds no benefit. Rejected; the adapter class pattern is more idiomatic TypeScript.

## Consequences

- Adding a new tracker requires: a new adapter class implementing `Tracker`, a case in `trackerForConfig`, and a schema entry in `workflow/schema.ts`. No changes to the orchestrator are needed.
- Adding a new runtime requires: a new harness class implementing `Runtime`, a case in `runtimeForConfig`, and a schema entry. Tool adapters (converting `Tool[]` to the provider's tool schema) live in `src/tools/adapters/`.
- The `Tracker` interface uses optional methods (`createComment?`, `updateIssueState?`) so adapters can omit features they don't support without breaking the contract.
- Integration tool adapters (`src/tools/adapters/`) follow the same pattern: a per-runtime function that converts the generic `Tool` list into the provider's tool-spec format.

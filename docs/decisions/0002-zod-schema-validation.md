# ADR-0002: Zod for workflow configuration schema

## Status
Accepted

## Date
2025-04-01

## Context
Northstar's primary user input is a `WORKFLOW.md` file containing YAML front matter. The YAML is deserialized and then validated/coerced into a typed `NorthstarConfig` object before any runtime or tracker code runs. We need:

- Strict validation with clear error messages for missing or mistyped fields.
- Default values so minimal workflows don't require every field.
- TypeScript types derived from the schema (not manually maintained in parallel).
- Environment-variable interpolation (resolving `$ENV_VAR` strings before validation).
- Discriminated unions for `runtime.kind` and `tracker.kind` so each provider variant has its own type.

## Decision
Use [Zod](https://github.com/colinhacks/zod) for schema definition, validation, and type inference. The canonical schema lives in `src/workflow/schema.ts`. The exported `NorthstarConfig` type is `z.infer<typeof workflowSchema>`.

## Alternatives Considered

### Manual validation + handwritten types
- Pros: No dependency; complete control over error messages.
- Cons: Schema and types diverge over time; adding a new config field requires changes in three places (schema, types, defaults). Rejected; maintenance cost is too high.

### JSON Schema + `ajv`
- Pros: Standard format; tooling support (VS Code YAML extension can validate against JSON Schema).
- Cons: TypeScript types must be generated separately or maintained by hand; `ajv` output types are not as ergonomic as Zod's. Acceptable tradeoff but Zod is more ergonomic for our use case.

### `io-ts`
- Pros: Functional composition style; mature.
- Cons: Steeper learning curve; more verbose for discriminated unions. Rejected in favour of Zod's simpler API.

## Consequences
- Adding a new workflow config field requires only a schema change in `schema.ts`; the TypeScript type updates automatically.
- Validation errors surface to the user via `formatWorkflowValidationError` in `cli.ts`, which filters Zod issues down to the most actionable ones.
- Deep `$ENV_VAR` interpolation happens before Zod parsing (`deepResolveEnv` in `src/config/env.ts`), so schema types see the resolved string values.
- The discriminated-union approach for `runtime` and `tracker` means TypeScript narrows the type correctly inside provider-specific code paths.

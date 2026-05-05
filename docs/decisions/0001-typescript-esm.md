# ADR-0001: TypeScript with native ESM

## Status
Accepted

## Date
2025-04-01

## Context
Northstar is a Node.js CLI and library. We needed to choose an implementation language and module system. The project targets Node.js 22+, ships as an npm package with a `bin` entry, and needs first-class TypeScript types for its public API.

Node.js 22 ships with native ES module support and V8 type-stripping under the `--experimental-strip-types` flag, but the ecosystem of tools we rely on (Zod, Commander, Fastify, LiquidJS) all publish proper ESM packages.

## Decision
Use TypeScript compiled to native ESM (`"type": "module"` in `package.json`, `"module": "NodeNext"` in `tsconfig.json`). Source files use `.ts` extensions; compiled output uses `.js` with explicit relative imports.

## Alternatives Considered

### CommonJS (`"type": "commonjs"`)
- Pros: No `.js` import extension requirement; simpler interop with older tooling.
- Cons: Cannot statically import pure-ESM packages; Node.js CJS-to-ESM interop has edge cases with `__dirname` and top-level `await`. Rejected because our dependencies are moving ESM-first.

### Bundled output (esbuild / tsup)
- Pros: Single-file output; no `.js` extension ceremony; tree-shaking.
- Cons: Debugging is harder with bundled output; the CLI and library use-case doesn't benefit meaningfully from bundling. Rejected as unnecessary complexity.

### JavaScript (no TypeScript)
- Pros: No build step; simpler CI.
- Cons: The public API (`NorthstarConfig`, `Issue`, `Runtime`, etc.) benefits substantially from type-checking, and the Zod schemas already generate types. Rejected; the type safety pays for the build step.

## Consequences
- All relative imports in source files must use `.js` extensions (TypeScript resolves them to `.ts` at compile time).
- `tsc -p tsconfig.json` is the only build step; no bundler configuration to maintain.
- `tsx` is used as a dev-only runner for scripts (`scripts/spec-checklist.ts`) to avoid a full build cycle.
- Consumers importing Northstar as a library get accurate TypeScript types from the compiled output.

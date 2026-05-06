# ADR-0003: LiquidJS for prompt templating

## Status

Accepted

## Date

2025-04-01

## Context

The `WORKFLOW.md` prompt body is a template that is rendered once per issue before being sent to the agent runtime. The template receives an `issue` object (identifier, title, URL, priority, labels, description, blockers) and a `northstar` object (assembled context, skill sequence). We need a template engine that:

- Has clear, readable syntax familiar to non-engineers writing workflow files.
- Supports filters (`| default:`, `| join:`) for safe rendering of optional fields.
- Is sandboxed by default (no arbitrary code execution in templates).
- Works well in an async Node.js context.
- Has minimal overhead — templates are small and rendering happens once per issue.

## Decision

Use [LiquidJS](https://liquidjs.com/) (`liquidjs` npm package). Templates use `{{ variable }}` syntax and Liquid filters. Rendering is async via `liquid.parseAndRender`.

## Alternatives Considered

### Handlebars

- Pros: Widely known; good ecosystem.
- Cons: Less safe by default — helpers can execute arbitrary code if misconfigured. The `{{ }}` syntax is the same as Liquid, but Liquid's filter syntax (`| default:`) is more concise for our use case. Rejected; LiquidJS is a better fit.

### Mustache

- Pros: Logic-less; very simple.
- Cons: No filter support; cannot express `{{ issue.labels | join: ", " }}` idiom. Rejected; too limited for prompt templates.

### Template literals (JavaScript)

- Pros: No dependency; full language power.
- Cons: Workflow files would need to embed JavaScript expressions, breaking the intent of user-authored Markdown files. Rejected; not suitable for config-driven use.

### Nunjucks

- Pros: Jinja2-compatible; powerful.
- Cons: Template syntax is more complex; designed for HTML, not plain text. Rejected in favour of Liquid's simpler model.

## Consequences

- Workflow authors write standard Liquid syntax in the Markdown body of `WORKFLOW.md`.
- Unknown variables render as empty strings (Liquid's default), not errors, which is appropriate for optional issue fields.
- The `| default:` filter is the idiomatic way to provide fallback text for missing fields.
- `src/workflow/prompt.ts` exposes a thin `renderPrompt` wrapper; any future change to the template engine is isolated there.

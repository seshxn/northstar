# ADR-008: Frontend Design System — Tailwind CSS v4 + Radix UI

## Status

Accepted

## Context

Northstar needed an operator dashboard. Key requirements:

- Ship fast with a small component surface that is easy to extend.
- Consistent visual language without a full component library vendor lock-in.
- Accessible interactive primitives (dialog, dropdown, select, checkbox, tabs).
- Works with Vite and React 19 without a build-time PostCSS pipeline.

## Decision

Use **Tailwind CSS v4** with the `@tailwindcss/vite` plugin, a custom `@theme` block for design tokens, and handwritten CSS classes for repeated patterns (`.btn`, `.badge`, `.panel`, etc.). Pair with **Radix UI** primitives for interactive components that require accessibility semantics and keyboard navigation.

We explicitly did not adopt a pre-packaged component library (shadcn/ui, Chakra, MUI) to avoid bundling unused components and to retain full control over styling.

## Consequences

**Good:**

- Zero-runtime CSS — all styles compile to plain CSS at build time.
- Radix primitives provide ARIA roles, keyboard navigation, and focus management with no custom implementation required.
- The design token layer (`--background`, `--foreground`, etc.) makes light/dark theming straightforward.
- Tailwind v4 `@theme` block lets us use utility classes like `bg-background` that refer to our custom properties.

**Bad:**

- Handwritten CSS classes require discipline to keep consistent; there is no automatic variant generation like shadcn provides.
- Tailwind v4 `@theme` / `@utility` API is newer than v3 and not all community plugins are compatible.

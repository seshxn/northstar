# ADR-009: Animated Sheet and Card Transitions with framer-motion

## Status

Accepted

## Context

The IssueSheet detail drawer needs a smooth slide-in/out animation so operators can keep spatial context when opening and closing issues. Board card entrance animations help users scan which cards changed after a refresh. CSS transitions alone are insufficient because Radix Dialog unmounts the DOM node on close by default, which cuts off any exit animation before it completes.

## Decision

Use **framer-motion** (`AnimatePresence` + `motion.*`) for Sheet open/close transitions and TicketCard entrance animations.

For the Sheet, apply `forceMount` on Radix Dialog Portal, Overlay, and Content to prevent Radix from managing the mount lifecycle. Wrap the conditional render in `AnimatePresence`:

```tsx
<AnimatePresence>
  {open && (
    <DialogPrimitive.Portal key="ns-sheet" forceMount>
      <DialogPrimitive.Overlay asChild forceMount>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content asChild forceMount>
        <motion.div
          initial={{ x: "100%", opacity: 0.7 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 280, mass: 0.9 }}
        />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )}
</AnimatePresence>
```

For board cards, use `motion.article` with `initial={{ opacity: 0, y: 6 }}` and a stagger delay of `index * 0.03` seconds.

## Consequences

**Good:**

- Exit animations complete before the DOM node is removed.
- Spring physics give the sheet a natural feel without hand-tuning easing curves.
- `AnimatePresence` handles unmounting automatically — no imperative animation cleanup needed.

**Bad:**

- `framer-motion` adds ~45 KB gzipped to the bundle.
- The `forceMount` pattern means Radix does not manage focus-trap teardown on close; the motion `exit` must complete before the portal unmounts, which is handled correctly by `AnimatePresence`.

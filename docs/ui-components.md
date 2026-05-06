# UI Components Guide

The Northstar dashboard is a React 19 + Vite 7 app in `web/`. It uses Tailwind CSS v4, Radix UI primitives, framer-motion, and @dnd-kit for drag-and-drop.

## Design System

Styles live in `web/src/styles.css`. The design uses CSS custom properties for all tokens:

```css
--background, --foreground          /* page surface and text */
--card, --card-foreground           /* raised panel surface */
--primary, --primary-foreground     /* action color */
--muted, --muted-foreground         /* secondary text */
--border, --input, --ring           /* form chrome */
--radius                            /* border-radius token */
```

The Tailwind CSS v4 `@theme` block maps these to Tailwind utility classes so you can write `bg-background`, `text-muted-foreground`, etc.

## Component Inventory (`web/src/ui.tsx`)

### `Button`

```tsx
<Button variant="default | secondary | ghost | danger" />
```

Maps to `.btn .btn-{variant}` CSS classes.

### `Badge`

```tsx
<Badge tone="neutral | good | warn | bad | info | blocked" />
```

Maps to `.badge .badge-{tone}`. Use `blocked` for dependency-blocked issues.

### `Input`

Full-width text input with focus ring. Accepts all native `<input>` props.

### `Card`

Thin wrapper around `.panel` — a raised surface with border and padding.

### `Tabs`

Re-exported Radix UI tabs: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. Style via `.tabs-*` classes.

### `Sheet`

Animated slide-in panel for issue detail views.

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetTitle>Issue ENG-101</SheetTitle>
  {/* content */}
  <SheetClose asChild>
    <Button>Close</Button>
  </SheetClose>
</Sheet>
```

Uses framer-motion for entrance/exit — see [Animation Patterns](#animation-patterns) below.

### `DropdownMenu` / `DropdownItem`

Radix dropdown with portal-mounted content. `trigger` is the element that opens it.

```tsx
<DropdownMenu trigger={<Button>Actions</Button>}>
  <DropdownItem onSelect={() => approve()}>Approve</DropdownItem>
</DropdownMenu>
```

### `Select` / `SelectItem`

Radix select with portal-mounted popover. Controlled via `value` / `onValueChange`.

### `Checkbox`

Radix checkbox with a `label` for accessibility.

### `ToastProvider` / `useToast`

Wrap the app tree in `<ToastProvider>`. Call `useToast().push({ title, description?, tone? })` from anywhere.

```tsx
const toast = useToast();
toast.push({ title: "Plan approved", tone: "default" });
toast.push({ title: "Request failed", description: err.message, tone: "error" });
```

Toasts auto-dismiss after 3600 ms and can be manually closed.

## Animation Patterns

### Sheet Slide-In/Out

The `Sheet` component uses `AnimatePresence` with Radix Dialog `forceMount` to hand off mount/unmount control to framer-motion:

```tsx
<DialogPrimitive.Portal key="ns-sheet" forceMount>
  <DialogPrimitive.Overlay asChild forceMount>
    <motion.div className="sheet-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
  </DialogPrimitive.Overlay>
  <DialogPrimitive.Content asChild forceMount>
    <motion.div
      className="sheet-content"
      initial={{ x: "100%", opacity: 0.7 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 280, mass: 0.9 }}
    />
  </DialogPrimitive.Content>
</DialogPrimitive.Portal>
```

`forceMount` prevents Radix from unmounting immediately; `AnimatePresence` with `{open && (...)}` drives the lifecycle.

### TicketCard Entrance

Board cards use `motion.article` with a stagger delay based on column position:

```tsx
<motion.article initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: index * 0.03 }} />
```

## Optimistic Drag-and-Drop

The Board uses `@dnd-kit/core` and `@dnd-kit/sortable`. On drag end, the UI updates immediately and the API call runs in the background. On failure, the board reverts to the pre-drag snapshot:

```tsx
const snapshot = board;
setBoard(moveCardOptimistically(board, cardId, targetColumnId));
moveIssue(issueId, targetState)
  .then(refresh)
  .catch(() => setBoard(snapshot));
```

The `moveCardOptimistically` pure function takes the current board, removes the card from its source column, and appends it to the target column.

## Page Structure

| Route       | Component       | Description                                     |
| ----------- | --------------- | ----------------------------------------------- |
| `/`         | `DashboardPage` | Metrics overview, audit log feed                |
| `/board`    | `BoardPage`     | Kanban board with DnD                           |
| `/runs`     | `RunsPage`      | Completed and failed run history with telemetry |
| `/settings` | `SettingsPage`  | Runtime model and tracker JQL settings          |

The `IssueSheet` drawer is shared across pages — clicking any ticket card opens it. It contains:

- Issue description (Markdown-rendered)
- Plan output for awaiting-review issues
- Telemetry panel (tokens, tool usage, event feed)
- Audit timeline filtered to the issue
- Add comment form

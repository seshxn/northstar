import React from "react";
import { cn } from "../ui";

// ─── Tooltip (pure CSS, no Radix tooltip dep) ────────────────────────────────
//
// Wraps children in a relative container and shows a styled tooltip bubble
// above them on hover/focus-within using CSS ::after on a sibling element.
// The `content` prop is forwarded as a data attribute so CSS can read it.

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  className?: string;
}

export const Tooltip = ({ content, children, side = "top", className }: TooltipProps) => (
  <span
    className={cn("ns-tooltip-wrap", side === "bottom" && "ns-tooltip-bottom", className)}
    data-tooltip={content}
    style={{ position: "relative", display: "inline-flex" }}
  >
    {children}
  </span>
);

Tooltip.displayName = "Tooltip";

// ─── KbdBadge ────────────────────────────────────────────────────────────────

export const KbdBadge = ({ keys }: { keys: string[] }) => (
  <span className="inline-flex items-center gap-0.5">
    {keys.map((key, i) => (
      <kbd
        key={i}
        className="inline-flex items-center justify-center rounded border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)] font-mono text-[10px] font-medium leading-none px-1.5 py-1 min-w-[20px]"
      >
        {key}
      </kbd>
    ))}
  </span>
);

KbdBadge.displayName = "KbdBadge";

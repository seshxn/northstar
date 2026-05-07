import { motion } from "framer-motion";
import React from "react";
import { Button } from "../ui";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <motion.div
    className="flex flex-col items-center justify-center w-full py-12 px-6 rounded-[var(--radius)] border border-dashed border-[var(--border)]"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2, ease: "easeOut" }}
  >
    <div
      className="flex items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] text-[var(--muted-foreground)]"
      style={{ width: 48, height: 48 }}
    >
      {icon}
    </div>

    <div className="flex flex-col items-center gap-1 mt-3 text-center">
      <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
      {description && (
        <span className="text-xs text-[var(--muted-foreground)] max-w-[280px]">{description}</span>
      )}
    </div>

    {action && (
      <div className="mt-3">
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      </div>
    )}
  </motion.div>
);

EmptyState.displayName = "EmptyState";

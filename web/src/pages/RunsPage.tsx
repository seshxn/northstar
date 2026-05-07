import React from "react";
import type { StateSnapshot } from "../api";
import { retryIssue } from "../api";
import { Button, Card } from "../ui";
import { formatTokenCount } from "../hooks/useNorthstarState";
import { ChangeLogVisual } from "../components/ChangeLogVisual";
import { RunPanel } from "../components/RunPanel";
import { cn } from "../ui";

export const RunsPage = ({
  state,
  onCardAction
}: {
  state: StateSnapshot | null;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => (
  <section className="grid grid-cols-1 gap-4">
    <RunPanel state={state} onCardAction={onCardAction} />
    <Card className="p-4 shadow-[var(--shadow)]">
      <h2 className="mb-3 mt-0 text-base font-semibold">Recent Results</h2>
      {(state?.results ?? []).length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">No completed runs</p> : null}
      {(state?.results ?? [])
        .slice(-10)
        .reverse()
        .map((result) => (
          <div className="mt-3 border-t border-[var(--border)] pt-3 first:mt-0 first:border-t-0 first:pt-0" key={result.issueId}>
            <div
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3",
                result.events?.length ? "mb-2" : ""
              )}
            >
              <strong>{result.issue}</strong>
              <span className="min-w-0 truncate text-sm text-[var(--muted-foreground)]">{result.status}</span>
              <div className="flex items-center gap-2">
                {result.tokens ? (
                  <span className="token-counter text-xs text-[var(--muted-foreground)]">
                    {formatTokenCount(result.tokens.total)} tokens
                  </span>
                ) : null}
                {result.status !== "completed" ? (
                  <Button variant="secondary" onClick={() => onCardAction(`Retried ${result.issue}`, () => retryIssue(result.issueId))}>
                    Retry
                  </Button>
                ) : null}
              </div>
            </div>
            {result.events && result.events.length > 0 ? (
              <ChangeLogVisual result={result} />
            ) : null}
          </div>
        ))}
    </Card>
  </section>
);

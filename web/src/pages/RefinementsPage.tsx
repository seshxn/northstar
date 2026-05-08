import React, { useState } from "react";
import { CheckCircle2, ChevronDown, FileText, Pencil, XCircle } from "lucide-react";
import type { StateSnapshot } from "../api";
import { retryIssue } from "../api";
import { Badge, Button, Card, cn } from "../ui";
import { RunPanel } from "../components/RunPanel";
import { formatTokenCount, formatDuration } from "../hooks/useNorthstarState";

type Result = StateSnapshot["results"][number];

const RefinementResultCard = ({
  result,
  onCardAction
}: {
  result: Result;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const failed = result.status !== "completed";
  const durationMs =
    result.startedAt && result.completedAt
      ? new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime()
      : null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border p-4 transition-all",
        failed
          ? "border-[var(--destructive)] bg-[oklch(from_var(--destructive)_l_c_h_/_0.05)]"
          : "border-[var(--border)] bg-[var(--background)]"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {failed ? (
            <XCircle size={16} className="text-[var(--destructive)]" />
          ) : (
            <CheckCircle2 size={16} className="text-[var(--success)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{result.issue}</strong>
            <Badge tone={failed ? "bad" : "good"}>{result.status}</Badge>
            {result.tokens ? (
              <span className="token-counter text-xs text-[var(--muted-foreground)]">
                {formatTokenCount(result.tokens.total)} tokens
              </span>
            ) : null}
            {durationMs !== null ? (
              <span className="text-xs text-[var(--muted-foreground)]">{formatDuration(durationMs)}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {failed ? (
            <Button variant="secondary" onClick={() => onCardAction(`Retried ${result.issue}`, () => retryIssue(result.issueId))}>
              Retry
            </Button>
          ) : null}
          {result.output ? (
            <button
              aria-label={expanded ? "Collapse description" : "View description"}
              className="inline-flex size-8 items-center justify-center rounded-[calc(var(--radius)-4px)] border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
              onClick={() => setExpanded((v) => !v)}
            >
              <ChevronDown size={14} className={cn("transition-transform", expanded && "rotate-180")} />
            </button>
          ) : null}
        </div>
      </div>

      {expanded && result.output ? (
        <div className="mt-3">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)]">
            <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-3 py-2">
              <FileText size={12} className="text-[var(--muted-foreground)]" />
              <span className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">Refined Description</span>
            </div>
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words p-3 text-[13px] leading-5 text-[var(--foreground)]">
              {result.output}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const RefinementsPage = ({
  state,
  onCardAction
}: {
  state: StateSnapshot | null;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const activeRuns = (state?.running ?? []).filter((r) => r.mode === "refinement");
  const allResults = [...(state?.results ?? [])].reverse().slice(0, 20).filter((r) => r.mode === "refinement");
  const failed = allResults.filter((r) => r.status !== "completed");
  const succeeded = allResults.filter((r) => r.status === "completed");

  return (
    <section className="grid grid-cols-1 gap-4">
      <Card className="p-4 shadow-[var(--shadow)]">
        <div className="mb-3 flex items-center gap-2">
          <Pencil size={16} className="text-[var(--muted-foreground)]" />
          <h2 className="m-0 text-base font-semibold">Active Refinements</h2>
          {activeRuns.length > 0 ? (
            <span className="ml-auto font-mono-geist text-xs text-[var(--info)]">{activeRuns.length} live</span>
          ) : null}
        </div>
        {activeRuns.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No active refinements</p>
        ) : (
          <div className="grid gap-2">
            {activeRuns.map((run) => (
              <div className="flex items-center gap-2" key={run.issueId}>
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--info)] opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-[var(--info)]" />
                </span>
                <strong className="text-sm">{run.issue}</strong>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--muted-foreground)]">{run.lastEvent || "Refining…"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {failed.length > 0 ? (
        <Card className="p-4 shadow-[var(--shadow)]">
          <h2 className="mb-3 mt-0 text-base font-semibold text-[var(--destructive)]">Failed Refinements</h2>
          <div className="grid gap-3">
            {failed.map((result) => (
              <RefinementResultCard key={result.issueId} result={result} onCardAction={onCardAction} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-4 shadow-[var(--shadow)]">
        <h2 className="mb-3 mt-0 text-base font-semibold">Completed Refinements</h2>
        {succeeded.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No completed refinements yet</p>
        ) : (
          <div className="grid gap-3">
            {succeeded.map((result) => (
              <RefinementResultCard key={result.issueId} result={result} onCardAction={onCardAction} />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
};

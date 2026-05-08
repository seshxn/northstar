import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { type StateSnapshot, type BoardCard, stopIssue } from "../api";
import { Badge, Button, Card } from "../ui";

const useElapsed = (startedAt: string | undefined): string => {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const s = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
      const m = Math.floor(s / 60);
      setElapsed(m > 0 ? `${m}m ${s % 60}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
};

const LiveRunRow = ({
  run,
  onCardAction
}: {
  run: StateSnapshot["running"][number];
  onCardAction?: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const elapsed = useElapsed(run.startedAt);
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--info)] opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-[var(--info)]" />
        </span>
        <strong className="text-sm">{run.issue}</strong>
        {run.mode ? <Badge tone="info">{run.mode}</Badge> : null}
        {elapsed ? <span className="ml-auto font-mono-geist text-xs tabular-nums text-[var(--muted-foreground)]">{elapsed}</span> : null}
      </div>
      <p className="font-mono-geist mb-2 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">
        {run.lastEvent || "Initialising…"}
      </p>
      {run.toolNames && run.toolNames.length > 0 ? (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {run.toolNames.slice(0, 6).map((tool) => (
            <Badge key={tool}>{tool}</Badge>
          ))}
          {run.toolNames.length > 6 ? <Badge>+{run.toolNames.length - 6}</Badge> : null}
        </div>
      ) : null}
      {onCardAction ? (
        <div className="flex justify-end">
          <Button
            variant="danger"
            onClick={() => onCardAction(`Stopped ${run.issue}`, () => stopIssue({ issueId: run.issueId } as BoardCard))}
          >
            Stop
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export const RunPanel = ({
  state,
  compact = false,
  onCardAction
}: {
  state: StateSnapshot | null;
  compact?: boolean;
  onCardAction?: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const runs = state?.running ?? [];
  return (
    <Card className="p-4 shadow-[var(--shadow)]" id="runs">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={16} className="text-[var(--muted-foreground)]" />
        <h2 className="m-0 text-base font-semibold">Active Runs</h2>
        {runs.length > 0 ? (
          <span className="ml-auto font-mono-geist text-xs text-[var(--info)]">{runs.length} live</span>
        ) : null}
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No active runs</p>
      ) : compact ? (
        <div className="grid gap-2">
          {runs.map((run) => (
            <div className="flex min-w-0 items-center gap-2" key={run.issueId}>
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--info)] opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-[var(--info)]" />
              </span>
              <strong className="shrink-0 text-sm">{run.issue}</strong>
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--muted-foreground)]">{run.lastEvent || "Running…"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {runs.map((run) => (
            <LiveRunRow key={run.issueId} run={run} onCardAction={onCardAction} />
          ))}
        </div>
      )}
    </Card>
  );
};

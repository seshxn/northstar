import { type StateSnapshot, type BoardCard } from "../api";
import { Badge, Button, Card } from "../ui";
import { stopIssue } from "../api";

// RunPanel shows active runs - used in both Dashboard and RunsPage
export const RunPanel = ({
  state,
  compact = false,
  onCardAction
}: {
  state: StateSnapshot | null;
  compact?: boolean;
  onCardAction?: (label: string, action: () => Promise<unknown>) => void;
}) => (
  <Card className="p-4 shadow-[var(--shadow)]" id="runs">
    <h2 className="mb-3 mt-0 text-base font-semibold">Active Runs</h2>
    {(state?.running ?? []).length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">No active runs</p> : null}
    {(state?.running ?? []).map((run) => (
      <div className="mt-2.5 border-t border-[var(--border)] pt-2.5 first:mt-0 first:border-t-0 first:pt-0" key={run.issueId}>
        <div className="flex items-center justify-between gap-2">
          <strong>{run.issue}</strong>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--muted-foreground)]">
            {run.lastEvent || "Waiting for events"}
          </span>
          {!compact && onCardAction ? (
            <Button
              variant="danger"
              onClick={() => onCardAction(`Stopped ${run.issue}`, () => stopIssue({ issueId: run.issueId } as BoardCard))}
            >
              Stop
            </Button>
          ) : null}
        </div>
        {!compact && run.toolNames && run.toolNames.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {run.toolNames.slice(0, 5).map((tool) => (
              <Badge key={tool}>{tool}</Badge>
            ))}
            {run.toolNames.length > 5 ? <Badge>+{run.toolNames.length - 5}</Badge> : null}
          </div>
        ) : null}
      </div>
    ))}
  </Card>
);

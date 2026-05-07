import { TokenHeatmap } from "../components/TokenHeatmap";
import { MiniAgentTerminal } from "../components/AgentTerminal";
import { DonutRing } from "../components/DonutRing";
import { RunPanel } from "../components/RunPanel";
import { AUDIT_KIND_LABELS, AUDIT_KIND_TONE } from "../lib/constants";
import { formatRelativeTime, formatDuration } from "../hooks/useNorthstarState";
import { type BoardCard, type BoardSnapshot, type AuditEvent, type StateSnapshot, type SettingsSnapshot } from "../api";
import { Badge, Card, cn } from "../ui";

const AuditCard = ({ events, onViewAll }: { events: AuditEvent[]; onViewAll?: () => void }) => (
  <Card className="p-4 shadow-[var(--shadow)]">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="m-0 text-base font-semibold">Audit Trail</h2>
      {onViewAll ? (
        <button
          className="border-0 bg-transparent p-0 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          onClick={onViewAll}
        >
          View all →
        </button>
      ) : null}
    </div>
    {events.length === 0 ? (
      <p className="text-sm text-[var(--muted-foreground)]">No activity recorded yet</p>
    ) : (
      <div className="grid gap-3">
        {events.map((event) => (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3" key={event.id}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={AUDIT_KIND_TONE[event.kind] ?? "neutral"}>{AUDIT_KIND_LABELS[event.kind] ?? event.kind}</Badge>
              {event.issueIdentifier ? <span className="text-xs font-semibold">{event.issueIdentifier}</span> : null}
              <span className="text-xs text-[var(--muted-foreground)]">{formatRelativeTime(event.timestamp)}</span>
            </div>
            <p className="m-0 text-sm leading-6 text-[var(--foreground)]">{event.message}</p>
          </div>
        ))}
      </div>
    )}
  </Card>
);

const RetryQueuePanel = ({
  state,
  board,
  onSelectCard
}: {
  state: StateSnapshot | null;
  board: BoardSnapshot | null;
  onSelectCard: (card: BoardCard) => void;
}) => {
  const retries = state?.retryAttempts ?? [];
  const allCards = board?.columns.flatMap((col) => col.cards) ?? [];
  if (retries.length === 0) return null;
  return (
    <Card className="p-4 shadow-[var(--shadow)]">
      <h2 className="mb-3 mt-0 text-base font-semibold">Retry Queue</h2>
      {retries.map((retry) => {
        const card = allCards.find((c) => c.issueId === retry.issueId);
        const dueMs = new Date(retry.dueAt).getTime() - Date.now();
        return (
          <div
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0",
              card ? "cursor-pointer" : "cursor-default"
            )}
            key={retry.issueId}
            onClick={() => {
              if (card) onSelectCard(card);
            }}
          >
            <strong>{card?.identifier ?? retry.issueId}</strong>
            <span className="min-w-0 truncate text-sm text-[var(--muted-foreground)]">Attempt #{retry.attempt}</span>
            <Badge tone="warn">{dueMs > 0 ? `in ${formatDuration(dueMs)}` : "due now"}</Badge>
          </div>
        );
      })}
    </Card>
  );
};

export const DashboardPage = ({
  board,
  state,
  settings,
  onSelectCard,
  onNavigate
}: {
  board: BoardSnapshot;
  state: StateSnapshot | null;
  settings: SettingsSnapshot | null;
  onSelectCard: (card: BoardCard) => void;
  onNavigate: (path: string) => void;
}) => {
  const allCards = board.columns.flatMap((col) => col.cards);
  const awaitingCards = allCards.filter((c) => c.runtimeStatus === "awaiting_review");
  const completed = allCards.filter((c) => c.runtimeStatus === "completed").length;
  const failed = allCards.filter((c) => c.runtimeStatus === "failed").length;
  const total = completed + failed;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : null;

  return (
    <>
      <TokenHeatmap board={board} state={state} successRate={successRate} />
      <section className="mb-4">
        <MiniAgentTerminal state={state} />
      </section>
      <section className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <Card className="p-4 shadow-[var(--shadow)] glass-card">
          <h2 className="mb-3 mt-0 text-base font-semibold">Human Review</h2>
          {awaitingCards.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No plans awaiting review</p>
          ) : (
            awaitingCards.map((card) => (
              <div
                className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0"
                key={card.issueId}
                onClick={() => onSelectCard(card)}
              >
                <strong>{card.identifier}</strong>
                <span className="min-w-0 truncate text-sm text-[var(--muted-foreground)]">{card.title}</span>
                <Badge tone="warn">Review</Badge>
              </div>
            ))
          )}
        </Card>
        <Card className="p-4 shadow-[var(--shadow)]">
          <h2 className="mb-3 mt-0 text-base font-semibold">Model Split</h2>
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-2 text-sm">
            <span>Runtime</span>
            <strong>{settings?.runtime.kind ?? "—"}</strong>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-2 text-sm">
            <span>Planning model</span>
            <strong>{settings?.runtime.planningModel ?? "Not configured"}</strong>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-2 text-sm">
            <span>Execution model</span>
            <strong>{settings?.runtime.executionModel ?? "Not configured"}</strong>
          </div>
          {settings?.tracker ? (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-2 text-sm">
                <span>Tracker</span>
                <strong>{settings.tracker.kind}</strong>
              </div>
              {settings.tracker.jql ? (
                <div className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span>JQL</span>
                  <strong className="text-right text-[11px]">{settings.tracker.jql}</strong>
                </div>
              ) : null}
            </>
          ) : null}
        </Card>
        <RunPanel state={state} compact />
        <RetryQueuePanel state={state} board={board} onSelectCard={onSelectCard} />
        <AuditCard events={(state?.auditLog ?? []).slice(-5).reverse()} onViewAll={() => onNavigate("/activity")} />
      </section>
    </>
  );
};

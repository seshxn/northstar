import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { BoardCard, BoardSnapshot, StateSnapshot } from "../api";
import { Badge, Card, Select, SelectItem } from "../ui";
import { formatRelativeTime } from "../hooks/useNorthstarState";
import { AUDIT_KIND_LABELS, AUDIT_KIND_TONE } from "../lib/constants";

export const ActivityPage = ({
  state,
  board,
  onSelectCard
}: {
  state: StateSnapshot | null;
  board: BoardSnapshot | null;
  onSelectCard: (card: BoardCard) => void;
}) => {
  const [kindFilter, setKindFilter] = useState("all");
  const [textFilter, setTextFilter] = useState("");
  const allCards = board?.columns.flatMap((col) => col.cards) ?? [];

  const events = useMemo(() => {
    let items = (state?.auditLog ?? []).slice().reverse();
    if (kindFilter !== "all") items = items.filter((e) => e.kind === kindFilter);
    if (textFilter.trim()) {
      const needle = textFilter.toLowerCase();
      items = items.filter((e) => (e.issueIdentifier ?? "").toLowerCase().includes(needle) || e.message.toLowerCase().includes(needle));
    }
    return items;
  }, [state?.auditLog, kindFilter, textFilter]);

  return (
    <section className="grid grid-cols-1 gap-4">
      <Card className="p-4 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold">Activity Log</h2>
          <span className="text-[13px] text-[var(--muted-foreground)]">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="mb-4 flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
          <Select value={kindFilter} onValueChange={setKindFilter} placeholder="All events">
            <SelectItem value="all">All events</SelectItem>
            {Object.entries(AUDIT_KIND_LABELS).map(([kind, label]) => (
              <SelectItem key={kind} value={kind}>
                {label}
              </SelectItem>
            ))}
          </Select>
          <div className="focus-ring flex min-h-10 flex-1 items-center gap-2 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-[var(--muted-foreground)] transition-all">
            <Search size={15} />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Filter by issue or message…"
            />
          </div>
        </div>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            {state ? "No matching activity — try adjusting the filters." : "Connecting to Northstar…"}
          </p>
        ) : (
          <div className="grid gap-3">
            {events.map((event) => {
              const card = event.issueId ? allCards.find((c) => c.issueId === event.issueId) : null;
              return (
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3" key={event.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={AUDIT_KIND_TONE[event.kind] ?? "neutral"}>{AUDIT_KIND_LABELS[event.kind] ?? event.kind}</Badge>
                    {event.issueIdentifier ? (
                      <button
                        className="border-0 bg-transparent p-0 text-xs font-semibold text-[var(--foreground)] disabled:cursor-default"
                        disabled={!card}
                        onClick={() => {
                          if (card) onSelectCard(card);
                        }}
                      >
                        {event.issueIdentifier}
                      </button>
                    ) : null}
                    <span className="text-xs text-[var(--muted-foreground)]">{formatRelativeTime(event.timestamp)}</span>
                  </div>
                  <p className="m-0 text-sm leading-6 text-[var(--foreground)]">{event.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
};

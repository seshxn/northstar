import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CheckCircle2, ChevronDown, CircleAlert, Clock3, Ellipsis, GripVertical, Inbox, Lock, XCircle } from "lucide-react";
import React, { useState } from "react";
import type { BoardCard, BoardColumn, BoardSnapshot } from "../api";
import { createPullRequest, retryIssue, stopIssue } from "../api";
import { Badge, Button, Card, Checkbox, DropdownItem, DropdownMenu, cn } from "../ui";
import { EmptyState } from "../components/EmptyState";
import { statusTone } from "../hooks/useNorthstarState";

export const BoardPage = ({
  board,
  selectedIds,
  onSelectCard,
  onToggleCard,
  onCardAction
}: {
  board: BoardSnapshot;
  selectedIds: Set<string>;
  onSelectCard: (card: BoardCard) => void;
  onToggleCard: (card: BoardCard, checked: boolean) => void;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => (
  <>
    <Metrics board={board} />
    <section className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4" id="board">
      {board.columns.map((column) => (
        <KanbanColumn column={column} key={column.id}>
          <SortableContext items={column.cards.map((c) => c.issueId)}>
            <div className="grid gap-3">
              {column.cards.length === 0 ? (
                <EmptyState
                  icon={<Inbox size={20} />}
                  title="No tickets"
                  description="Drag cards here or wait for the runtime to assign issues."
                />
              ) : null}
              {column.cards.map((card, i) => (
                <TicketCard
                  card={card}
                  checked={selectedIds.has(card.issueId)}
                  key={card.issueId}
                  index={i}
                  onAction={onCardAction}
                  onSelect={onSelectCard}
                  onToggleChecked={(checked) => onToggleCard(card, checked)}
                />
              ))}
            </div>
          </SortableContext>
        </KanbanColumn>
      ))}
    </section>
  </>
);

const KanbanColumn = ({ column, children }: { column: BoardColumn; children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { column } });
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "bg-column min-h-[420px] rounded-[var(--radius)] border border-[var(--border)] p-3 transition-colors",
        isOver && "drop-ring",
        isOver && !column.acceptsManualMoves && "drop-ring-destructive",
        collapsed && "kanban-column-collapsed"
      )}
      ref={setNodeRef}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-sm font-bold">{column.title}</h2>
          <span className="text-xs text-[var(--muted-foreground)]">
            {column.startsAgent ? "Agent start" : column.acceptsManualMoves ? "Tracker state" : "Runtime"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <b className="rounded-full bg-[var(--background)] px-2 py-0.5 text-xs">{column.cards.length}</b>
          <button
            aria-label={collapsed ? `Expand ${column.title}` : `Collapse ${column.title}`}
            className="inline-flex size-6 items-center justify-center rounded-[calc(var(--radius)-4px)] border-0 bg-transparent text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={() => setCollapsed((c) => !c)}
          >
            <ChevronDown
              size={14}
              className={cn("transition-transform", collapsed && "rotate-180")}
            />
          </button>
        </div>
      </div>
      <div className="kanban-column-body" data-collapsed={collapsed ? "true" : "false"}>
        {children}
      </div>
    </div>
  );
};

const Metrics = ({ board }: { board: BoardSnapshot }) => (
  <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3" id="overview">
    <Metric icon={<Activity />} label="Running" value={board.metrics.running} />
    <Metric icon={<Clock3 />} label="Awaiting" value={board.metrics.awaitingReview} />
    <Metric icon={<CircleAlert />} label="Retrying" value={board.metrics.retrying} />
    <Metric icon={<CheckCircle2 />} label="Completed" value={board.metrics.completed} />
    <Metric icon={<XCircle />} label="Failed" value={board.metrics.failed} />
  </section>
);

const Metric = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <Card className="p-3.5">
    <div className="mb-3 text-[var(--muted-foreground)]">{icon}</div>
    <span className="block text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">{label}</span>
    <strong className="mt-1 block text-3xl leading-none">{value}</strong>
  </Card>
);

const VISIBLE_LABEL_COUNT = 3;

const TicketCard = ({
  card,
  checked,
  index,
  onAction,
  onSelect,
  onToggleChecked
}: {
  card: BoardCard;
  checked: boolean;
  index: number;
  onAction: (label: string, action: () => Promise<unknown>) => void;
  onSelect: (card: BoardCard) => void;
  onToggleChecked: (checked: boolean) => void;
}) => {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.issueId,
    data: { card }
  });
  const visibleLabels = card.labels.slice(0, VISIBLE_LABEL_COUNT);
  const overflowCount = card.labels.length - VISIBLE_LABEL_COUNT;
  const isBlocked = card.detectedDependencies.length > 0;

  const isRunning = ["planning", "implementation", "execution"].includes(card.runtimeStatus);
  const isFailedOrStalled = card.runtimeStatus === "failed" || card.runtimeStatus === "stalled";

  return (
    <motion.article
      className={cn(
        "hover-ring rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all glass-card",
        isDragging && "scale-[0.99] opacity-70 shadow-[var(--shadow)]",
        isRunning && "animate-breathe glow-running",
        card.runtimeStatus === "awaiting_review" && "glow-awaiting",
        card.runtimeStatus === "completed" && "glow-completed",
        isFailedOrStalled && "glow-failed"
      )}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut", delay: index * 0.03 }}
      data-ticket-id={card.issueId}
    >
      <div className="mb-2 flex items-center gap-2">
        <button
          className="inline-flex size-7 cursor-grab items-center justify-center rounded-[calc(var(--radius)-4px)] border border-[var(--border)] bg-transparent text-[var(--muted-foreground)] active:cursor-grabbing"
          ref={setActivatorNodeRef}
          aria-label={`Drag ${card.identifier}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>
        <Checkbox checked={checked} label={`Select ${card.identifier}`} onCheckedChange={onToggleChecked} />
        <span className="text-xs font-bold">{card.identifier}</span>
        <Badge tone={statusTone(card.runtimeStatus)}>{card.runtimeStatus.replace("_", " ")}</Badge>
        {isBlocked ? (
          <Badge tone="blocked">
            <Lock size={10} /> Blocked
          </Badge>
        ) : null}
        <IssueActions card={card} onAction={onAction} />
      </div>
      <button className="block w-full border-0 bg-transparent p-0 text-left" onClick={() => onSelect(card)}>
        <h3 className="mb-2 mt-0 text-[15px] font-semibold leading-snug">{card.title}</h3>
        <p className="mb-3 mt-0 line-clamp-2 text-[13px] leading-5 text-[var(--muted-foreground)]">
          {card.lastEvent || card.state || "No recent activity"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleLabels.map((label) => (
            <Badge key={label}>{label}</Badge>
          ))}
          {overflowCount > 0 ? <Badge>+{overflowCount}</Badge> : null}
        </div>
      </button>
    </motion.article>
  );
};

const IssueActions = ({ card, onAction }: { card: BoardCard; onAction: (label: string, action: () => Promise<unknown>) => void }) => (
  <DropdownMenu
    trigger={
      <Button aria-label={`${card.identifier} actions`} className="ml-auto size-8 min-h-8 p-0" variant="ghost">
        <Ellipsis size={16} />
      </Button>
    }
  >
    {["planning", "implementation", "execution"].includes(card.runtimeStatus) ? (
      <DropdownItem onSelect={() => onAction(`Stopped ${card.identifier}`, () => stopIssue(card))}>Stop run</DropdownItem>
    ) : null}
    {["failed", "retrying"].includes(card.runtimeStatus) ? (
      <DropdownItem onSelect={() => onAction(`Retried ${card.identifier}`, () => retryIssue(card.issueId))}>Retry</DropdownItem>
    ) : null}
    <DropdownItem
      onSelect={() => {
        const head = window.prompt(`Branch for ${card.identifier}`);
        if (head) onAction(`Creating PR for ${card.identifier}`, () => createPullRequest(card.issueId, head));
      }}
    >
      Create PR
    </DropdownItem>
  </DropdownMenu>
);

import { DndContext, type DragEndEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cpu,
  Ellipsis,
  GitPullRequest,
  GripVertical,
  Lock,
  Moon,
  PanelRightClose,
  RefreshCcw,
  Save,
  ScanLine,
  Search,
  Settings,
  Sparkles,
  Sun,
  Terminal,
  Wrench,
  XCircle,
  Zap
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  addComment,
  approvePlan,
  type AuditEvent,
  type BoardCard,
  type BoardColumn,
  type BoardSnapshot,
  createPullRequest,
  fetchBoard,
  fetchSettings,
  fetchState,
  moveIssue,
  refreshService,
  rejectPlan,
  retryIssue,
  scanDependencies,
  sendPlanFeedback,
  type SettingsSnapshot,
  type SettingsUpdatePayload,
  type StateSnapshot,
  stopIssue,
  updateSettings
} from "./api";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DropdownItem,
  DropdownMenu,
  Input,
  Select,
  SelectItem,
  Sheet,
  SheetClose,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  ToastProvider,
  cn,
  useToast
} from "./ui";

type Theme = "light" | "dark";

const ROUTES = [
  { path: "/", label: "Dashboard" },
  { path: "/board", label: "Board" },
  { path: "/runs", label: "Runs" },
  { path: "/prs", label: "PRs" },
  { path: "/activity", label: "Activity" },
  { path: "/settings", label: "Settings" }
];

const AUDIT_KIND_LABELS: Record<string, string> = {
  issue_dispatched: "Dispatched",
  run_started: "Run started",
  plan_created: "Plan created",
  dependency_detected: "Dependency detected",
  run_completed: "Completed",
  run_failed: "Failed",
  approval_triggered: "Approved",
  feedback_triggered: "Feedback",
  rejection_triggered: "Rejected",
  retry_scheduled: "Retry scheduled",
  issue_stopped: "Stopped"
};

const AUDIT_KIND_TONE: Record<string, "neutral" | "good" | "bad" | "warn" | "info"> = {
  run_completed: "good",
  approval_triggered: "good",
  run_failed: "bad",
  rejection_triggered: "bad",
  dependency_detected: "bad",
  issue_stopped: "bad",
  retry_scheduled: "warn",
  feedback_triggered: "warn",
  run_started: "info",
  plan_created: "info",
  issue_dispatched: "info"
};

export const App = () => (
  <ToastProvider>
    <NorthstarApp />
  </ToastProvider>
);

const NorthstarApp = () => {
  const [location, setLocation] = useLocation();
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("northstar-theme") === "light" ? "light" : "dark"));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { push } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const refresh = async () => {
    const [nextBoard, nextState, nextSettings] = await Promise.all([fetchBoard(), fetchState(), fetchSettings().catch(() => null)]);
    setBoard(nextBoard);
    setState(nextState);
    setSettings(nextSettings);
    setLoading(false);
    if (selectedCard) {
      setSelectedCard(nextBoard.columns.flatMap((col) => col.cards).find((c) => c.issueId === selectedCard.issueId) ?? null);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("northstar-theme", theme);
  }, [theme]);

  useEffect(() => {
    refresh().catch((err) => {
      setLoading(false);
      push({ title: "Unable to load Northstar", description: messageForError(err), tone: "error" });
    });
    const interval = setInterval(() => refresh().catch(() => undefined), 3500);
    return () => clearInterval(interval);
  }, []);

  const filteredBoard = useMemo(() => filterBoard(board, query), [board, query]);
  const selectedCards = useMemo(() => {
    const cards = board?.columns.flatMap((col) => col.cards) ?? [];
    return cards.filter((card) => selectedIds.has(card.issueId));
  }, [board, selectedIds]);
  const awaitingPlan = state?.awaitingReview.find((e) => e.issueId === selectedCard?.issueId || e.issue === selectedCard?.identifier);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshService();
    } catch {
      /* backend poll trigger is best-effort */
    }
    await refresh();
    setRefreshing(false);
  };

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      await refresh();
      push({ title: label });
    } catch (err) {
      push({ title: "Action failed", description: messageForError(err), tone: "error" });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const cardId = String(event.active.id);
    if (!event.over || !board) return;
    const targetColumn = columnForDrop(board.columns, String(event.over.id));
    const card = board.columns.flatMap((col) => col.cards).find((c) => c.issueId === cardId);
    if (!targetColumn || !card) return;
    if (!targetColumn.acceptsManualMoves || !targetColumn.moveState) {
      push({ title: "Move blocked", description: `${targetColumn.title} is managed by the runtime.`, tone: "error" });
      return;
    }
    const snapshot = board;
    setBoard(moveCardOptimistically(board, cardId, targetColumn.id));
    moveIssue(card.issueId, targetColumn.moveState ?? targetColumn.title)
      .then(() => refresh())
      .catch((err) => {
        setBoard(snapshot);
        push({ title: `Failed to move ${card.identifier}`, description: messageForError(err), tone: "error" });
      });
  };

  return (
    <div className="min-h-screen bg-transparent">
      <header className="bg-header sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--border)] px-6 py-3.5 backdrop-blur-md max-lg:grid-cols-1 max-lg:items-stretch">
        <div className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-normal">
          <Sparkles size={18} /> Northstar
        </div>
        <Tabs value={normalizedLocation(location)} onValueChange={setLocation}>
          <TabsList>
            {ROUTES.map((route) => (
              <TabsTrigger key={route.path} value={route.path}>
                {route.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center justify-end gap-2.5 max-lg:justify-start">
          <div className="focus-ring flex min-h-10 min-w-[260px] flex-1 items-center gap-2 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-[var(--muted-foreground)] transition-all max-sm:min-w-0">
            <Search size={16} />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
              aria-label="Search tickets, labels, status"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickets, labels, status"
            />
          </div>
          <Button variant="secondary" disabled={refreshing} onClick={() => void handleRefresh()}>
            <RefreshCcw size={15} className={refreshing ? "spin" : undefined} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="ghost" aria-label="Toggle theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-6 py-6 max-sm:px-4">
        <PageHeading location={location} board={board} state={state} onAction={runAction} />
        {loading ? <SkeletonBoard /> : null}
        {filteredBoard ? (
          <AnimatePresence mode="wait">
            {normalizedLocation(location) === "/" && (
              <PageTransition id="/">
                <DashboardPage
                  board={filteredBoard}
                  state={state}
                  settings={settings}
                  onSelectCard={setSelectedCard}
                  onNavigate={setLocation}
                />
              </PageTransition>
            )}
            {normalizedLocation(location) === "/board" && (
              <PageTransition id="/board">
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <BoardPage
                    board={filteredBoard}
                    selectedIds={selectedIds}
                    onSelectCard={setSelectedCard}
                    onToggleCard={(card, checked) => setSelectedIds(toggleSelected(selectedIds, card.issueId, checked))}
                    onCardAction={runAction}
                  />
                </DndContext>
              </PageTransition>
            )}
            {normalizedLocation(location) === "/runs" && (
              <PageTransition id="/runs">
                <RunsPage state={state} onCardAction={runAction} />
              </PageTransition>
            )}
            {normalizedLocation(location) === "/prs" && (
              <PageTransition id="/prs">
                <PullRequestPage board={filteredBoard} state={state} onCardAction={runAction} />
              </PageTransition>
            )}
            {normalizedLocation(location) === "/activity" && (
              <PageTransition id="/activity">
                <ActivityPage state={state} board={filteredBoard} onSelectCard={setSelectedCard} />
              </PageTransition>
            )}
            {normalizedLocation(location) === "/settings" && (
              <PageTransition id="/settings">
                <SettingsPage settings={settings} onSaved={refresh} onAction={runAction} />
              </PageTransition>
            )}
          </AnimatePresence>
        ) : null}
      </main>

      <BulkActionBar board={board} selectedCards={selectedCards} onClear={() => setSelectedIds(new Set())} onAction={runAction} />
      <IssueSheet
        awaitingPlan={awaitingPlan}
        card={selectedCard}
        state={state}
        onClose={() => setSelectedCard(null)}
        onAction={runAction}
      />
    </div>
  );
};

const PageHeading = ({
  location,
  board,
  state,
  onAction
}: {
  location: string;
  board: BoardSnapshot | null;
  state: StateSnapshot | null;
  onAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const label = ROUTES.find((route) => route.path === normalizedLocation(location))?.label ?? "Dashboard";
  return (
    <section className="mb-5 flex items-end justify-between gap-4 max-sm:flex-col max-sm:items-start">
      <div>
        <h1 className="m-0 text-[clamp(1.65rem,3vw,2.35rem)] font-bold tracking-normal">
          {label === "Dashboard" ? "Agent Workbench" : label}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {board ? `Updated ${new Date(board.updatedAt).toLocaleTimeString()}` : "Connecting to Northstar"}
        </p>
      </div>
      {location === "/board" ? (
        <Button variant="secondary" onClick={() => onAction("Scanning dependencies", () => scanDependencies())}>
          <ScanLine size={15} /> Scan Dependencies
        </Button>
      ) : null}
      {location === "/" && state ? (
        <div className="text-right max-sm:text-left">
          <span className="text-xs text-[var(--muted-foreground)]">Total tokens</span>
          <div className="token-counter text-lg font-bold">{formatTokenCount(state.tokenTotals.total)}</div>
        </div>
      ) : null}
    </section>
  );
};

const DashboardPage = ({
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
      <ExtendedMetrics board={board} state={state} successRate={successRate} />
      <section className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <Card className="p-4 shadow-[var(--shadow)]">
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

const ExtendedMetrics = ({
  board,
  state,
  successRate
}: {
  board: BoardSnapshot;
  state: StateSnapshot | null;
  successRate: number | null;
}) => (
  <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
    <Metric icon={<Activity />} label="Running" value={board.metrics.running} />
    <Metric icon={<Clock3 />} label="Awaiting" value={board.metrics.awaitingReview} />
    <Metric icon={<CircleAlert />} label="Retrying" value={board.metrics.retrying} />
    <Metric icon={<CheckCircle2 />} label="Completed" value={board.metrics.completed} />
    <Metric icon={<XCircle />} label="Failed" value={board.metrics.failed} />
    <Card className="p-3.5">
      <div className="flex items-center justify-between">
        <div className="h-6 text-[var(--muted-foreground)]">
          <Zap size={20} />
        </div>
        {successRate !== null ? <DonutRing value={successRate} size={52} stroke={5} color="var(--success)" /> : null}
      </div>
      <span className="mt-3 block text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">Token Burn</span>
      <strong className="token-counter mt-2 block text-[28px] font-semibold leading-none">
        {state ? formatTokenCount(state.tokenTotals.total) : "—"}
      </strong>
      {state ? (
        <div className="mt-1.5 text-xs text-[var(--muted-foreground)]">
          {formatTokenCount(state.tokenTotals.input)} in · {formatTokenCount(state.tokenTotals.output)} out
        </div>
      ) : null}
    </Card>
  </section>
);

const DonutRing = ({ value, size, stroke, color }: { value: number; size: number; stroke: number; color: string }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="donut-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (value / 100) * circumference}
          strokeLinecap="round"
        />
      </svg>
      <span className="donut-ring-label" style={{ fontSize: size < 60 ? 11 : 15, color }}>
        {value}%
      </span>
    </div>
  );
};

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

const ActivityPage = ({
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

const BoardPage = ({
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
                <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
                  No tickets
                </div>
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
  return (
    <div
      className={cn(
        "bg-column min-h-[420px] rounded-[var(--radius)] border border-[var(--border)] p-3 transition-colors",
        isOver && "drop-ring",
        isOver && !column.acceptsManualMoves && "drop-ring-destructive"
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
        <b className="rounded-full bg-[var(--background)] px-2 py-0.5 text-xs">{column.cards.length}</b>
      </div>
      {children}
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

  return (
    <motion.article
      className={cn(
        "hover-ring rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all",
        isDragging && "scale-[0.99] opacity-70 shadow-[var(--shadow)]"
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

const IssueSheet = ({
  awaitingPlan,
  card,
  state,
  onClose,
  onAction
}: {
  awaitingPlan: StateSnapshot["awaitingReview"][number] | undefined;
  card: BoardCard | null;
  state: StateSnapshot | null;
  onClose: () => void;
  onAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const [feedback, setFeedback] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    setFeedback("");
    setRejectReason("");
    setComment("");
  }, [card?.issueId]);

  const result = card ? state?.results.find((r) => r.issueId === card.issueId) : undefined;
  const auditEvents = card ? (state?.auditLog ?? []).filter((e) => e.issueId === card.issueId) : [];

  return (
    <Sheet
      open={Boolean(card)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {card ? (
        <>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <span className="mb-1 block text-xs font-bold uppercase text-[var(--muted-foreground)]">{card.identifier}</span>
              <SheetTitle>{card.title}</SheetTitle>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" aria-label="Close issue sheet">
                <PanelRightClose size={18} />
              </Button>
            </SheetClose>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(card.runtimeStatus)}>{card.runtimeStatus.replace("_", " ")}</Badge>
            {card.detectedDependencies.length > 0 ? (
              <Badge tone="blocked">
                <Lock size={10} /> Blocked
              </Badge>
            ) : null}
            {card.labels.map((label) => (
              <Badge key={label}>{label}</Badge>
            ))}
          </div>

          {card.description ? (
            <div className="mb-5 border-t border-[var(--border)] pt-4">
              <h3 className="mb-2 mt-0 text-sm font-semibold">Description</h3>
              <div className="plan-markdown prose prose-invert">
                <ReactMarkdown>{card.description}</ReactMarkdown>
              </div>
            </div>
          ) : null}

          {card.detectedDependencies.length > 0 ? (
            <div className="mb-5 border-t border-[var(--border)] pt-4">
              <h3 className="mb-2 mt-0 text-sm font-semibold">Detected Dependencies</h3>
              <p className="mb-2 text-sm text-[var(--muted-foreground)]">
                LLM analysis flagged this issue as potentially blocked by:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {card.detectedDependencies.map((dep) => (
                  <Badge key={dep} tone="bad">
                    {dep}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {result?.tokens ? (
            <TelemetryPanel
              tokens={result.tokens}
              toolNames={result.toolNames ?? []}
              events={result.events ?? []}
              startedAt={result.startedAt}
              completedAt={result.completedAt}
            />
          ) : null}

          <div className="mb-5 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2 mt-0 text-sm font-semibold">Audit Timeline</h3>
            {auditEvents.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No activity recorded for this issue yet</p>
            ) : (
              <div className="grid gap-3">
                {auditEvents.map((event) => (
                  <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3" key={event.id}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={AUDIT_KIND_TONE[event.kind] ?? "neutral"}>{AUDIT_KIND_LABELS[event.kind] ?? event.kind}</Badge>
                      <span className="text-xs text-[var(--muted-foreground)]">{formatRelativeTime(event.timestamp)}</span>
                    </div>
                    <p className="m-0 text-sm leading-6">{event.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-5 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2 mt-0 text-sm font-semibold">Latest Activity</h3>
            <p className="m-0 text-sm text-[var(--muted-foreground)]">{card.lastEvent || "No runtime event captured yet."}</p>
          </div>
          <div className="mb-5 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2 mt-0 text-sm font-semibold">Workspace</h3>
            <code className="font-mono-geist rounded-[calc(var(--radius)-4px)] bg-[var(--background)] px-2 py-1 text-xs">
              {card.workspacePath || "Not assigned"}
            </code>
          </div>

          {card.runtimeStatus === "awaiting_review" ? (
            <div className="mb-5 grid gap-2 border-t border-[var(--border)] pt-4">
              <h3 className="mb-0 mt-0 text-sm font-semibold">Plan Review</h3>
              <div className="plan-markdown prose prose-invert">
                <ReactMarkdown>{awaitingPlan?.planOutput ?? "No plan output available yet."}</ReactMarkdown>
              </div>
              <Button onClick={() => onAction(`Approved ${card.identifier}`, () => approvePlan(card))}>Approve Plan</Button>
              <textarea
                aria-label="Request specific changes"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Request specific changes"
                className="min-h-24 w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] p-3 text-sm outline-none focus-ring"
              />
              <Button
                variant="secondary"
                disabled={!feedback.trim()}
                onClick={() => onAction(`Sent feedback for ${card.identifier}`, () => sendPlanFeedback(card, feedback))}
              >
                Request Changes
              </Button>
              <textarea
                aria-label="Optional rejection reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Optional rejection reason"
                className="min-h-24 w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] p-3 text-sm outline-none focus-ring"
              />
              <Button variant="danger" onClick={() => onAction(`Rejected ${card.identifier}`, () => rejectPlan(card, rejectReason))}>
                Reject
              </Button>
            </div>
          ) : null}

          {["planning", "implementation", "execution"].includes(card.runtimeStatus) ? (
            <div className="mb-5 border-t border-[var(--border)] pt-4">
              <Button variant="danger" onClick={() => onAction(`Stopped ${card.identifier}`, () => stopIssue(card))}>
                Stop Run
              </Button>
            </div>
          ) : null}

          <div className="mb-5 border-t border-[var(--border)] pt-4">
            <h3 className="mb-2 mt-0 text-sm font-semibold">Add Comment</h3>
            <textarea
              aria-label="Write a comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a comment to post to the tracker…"
              className="min-h-24 w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] p-3 text-sm outline-none focus-ring"
            />
            <Button
              variant="secondary"
              disabled={!comment.trim()}
              className="mt-2"
              onClick={() =>
                onAction(`Commented on ${card.identifier}`, async () => {
                  await addComment(card.issueId, comment);
                  setComment("");
                })
              }
            >
              Post Comment
            </Button>
          </div>
        </>
      ) : null}
    </Sheet>
  );
};

const TelemetryPanel = ({
  tokens,
  toolNames,
  events,
  startedAt,
  completedAt
}: {
  tokens: { input: number; output: number; total: number };
  toolNames: string[];
  events: Array<{ type: string; message?: string }>;
  startedAt?: string;
  completedAt?: string;
}) => {
  const durationMs = startedAt && completedAt ? new Date(completedAt).getTime() - new Date(startedAt).getTime() : null;

  return (
    <div className="mb-5 border-t border-[var(--border)] pt-4">
      <h3 className="mb-2 mt-0 text-sm font-semibold">Run Telemetry</h3>
      <div className="mb-3.5 grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
        <TelemetryStat icon={<Zap size={14} />} label="Total tokens" value={formatTokenCount(tokens.total)} />
        <TelemetryStat
          icon={<Cpu size={14} />}
          label="Input / Output"
          value={`${formatTokenCount(tokens.input)} / ${formatTokenCount(tokens.output)}`}
        />
        {durationMs !== null ? <TelemetryStat icon={<Clock3 size={14} />} label="Duration" value={formatDuration(durationMs)} /> : null}
      </div>
      {toolNames.length > 0 ? (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
            <Wrench size={12} /> Tools used
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {toolNames.map((tool) => (
              <Badge key={tool}>{tool}</Badge>
            ))}
          </div>
        </div>
      ) : null}
      {events.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
            <Terminal size={12} /> Last events
          </div>
          <div className="grid gap-1.5">
            {events.slice(-8).map((event, i) => (
              <div className="rounded-[calc(var(--radius)-4px)] border border-[var(--border)] bg-[var(--background)] px-2.5 py-2" key={i}>
                <div className="font-mono-geist text-xs leading-5 text-[var(--muted-foreground)]">{event.message ?? event.type}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const TelemetryStat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2.5">
    <div className="mb-1 flex items-center gap-1.5 text-[var(--muted-foreground)]">{icon}</div>
    <div className="mb-1 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">{label}</div>
    <div className="token-counter text-sm font-semibold">{value}</div>
  </div>
);

const RunsPage = ({
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
              <div className="grid gap-1.5">
                {result.events.slice(-5).map((event, i) => (
                  <div className="rounded-[calc(var(--radius)-4px)] border border-[var(--border)] bg-[var(--background)] px-2.5 py-2" key={i}>
                    <div className="font-mono-geist text-xs leading-5 text-[var(--muted-foreground)]">{event.message ?? event.type}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
    </Card>
  </section>
);

const RunPanel = ({
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

const PullRequestPage = ({
  board,
  state,
  onCardAction
}: {
  board: BoardSnapshot;
  state: StateSnapshot | null;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const cards = board.columns
    .flatMap((col) => col.cards)
    .filter((c) => c.runtimeStatus === "completed" || c.state.toLowerCase().includes("done"));
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
      <Card className="p-4 shadow-[var(--shadow)]" id="prs">
        <h2 className="mb-3 mt-0 text-base font-semibold">PR Candidates</h2>
        {cards.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">No PR-ready tickets</p> : null}
        {cards.map((card) => (
          <div
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0"
            key={card.issueId}
          >
            <strong>{card.identifier}</strong>
            <span className="min-w-0 truncate text-sm text-[var(--muted-foreground)]">{card.title}</span>
            <Button
              variant="secondary"
              onClick={() => {
                const head = window.prompt(`Branch for ${card.identifier}`);
                if (head) onCardAction(`Creating PR for ${card.identifier}`, () => createPullRequest(card.issueId, head));
              }}
            >
              <GitPullRequest size={15} /> Create PR
            </Button>
          </div>
        ))}
      </Card>
      <Card className="p-4 shadow-[var(--shadow)]">
        <h2 className="mb-3 mt-0 text-base font-semibold">Recent Results</h2>
        {(state?.results ?? [])
          .slice(-8)
          .reverse()
          .map((result) => (
            <div
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0"
              key={result.issueId}
            >
              <strong>{result.issue}</strong>
              <span className="min-w-0 truncate text-sm text-[var(--muted-foreground)]">{result.status}</span>
              {result.status !== "completed" ? (
                <Button variant="secondary" onClick={() => onCardAction(`Retried ${result.issue}`, () => retryIssue(result.issueId))}>
                  Retry
                </Button>
              ) : null}
            </div>
          ))}
      </Card>
    </section>
  );
};

const SettingsPage = ({
  settings,
  onSaved,
  onAction
}: {
  settings: SettingsSnapshot | null;
  onSaved: () => Promise<void>;
  onAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const [executionModel, setExecutionModel] = useState(settings?.runtime.executionModel ?? "");
  const [planningModel, setPlanningModel] = useState(settings?.runtime.planningModel ?? "");
  const [jql, setJql] = useState(settings?.tracker.jql ?? "");
  const [saving, setSaving] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (settings) {
      setExecutionModel(settings.runtime.executionModel ?? "");
      setPlanningModel(settings.runtime.planningModel ?? "");
      setJql(settings.tracker.jql ?? "");
    }
  }, [settings?.runtime.executionModel, settings?.runtime.planningModel, settings?.tracker.jql]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: SettingsUpdatePayload = {};
      if (executionModel !== (settings?.runtime.executionModel ?? "")) payload.runtime = { ...payload.runtime, executionModel };
      if (planningModel !== (settings?.runtime.planningModel ?? "")) payload.runtime = { ...payload.runtime, planningModel };
      if (jql !== (settings?.tracker.jql ?? "") && settings?.tracker.kind === "jira") payload.tracker = { jql };
      await updateSettings(payload);
      await onSaved();
      push({ title: "Settings saved (in-memory)" });
    } catch (err) {
      push({ title: "Save failed", description: messageForError(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid grid-cols-[minmax(0,1fr)_minmax(280px,380px)] gap-4 max-lg:grid-cols-1">
      <Card className="p-4 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-[var(--muted-foreground)]" />
            <h2 className="m-0 text-base font-semibold">Configuration</h2>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={15} /> {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
        <p className="mb-4 text-sm text-[var(--muted-foreground)]">
          Changes are applied in-memory and revert on restart. Edit WORKFLOW.md for persistent configuration.
        </p>
        <div className="grid gap-3">
          <p className="mb-0 mt-2 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Tracker</p>
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Tracker kind</label>
            <Input value={settings?.tracker.kind ?? "—"} disabled />
          </div>
          {settings?.tracker.kind === "jira" ? (
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold">JQL Filter</label>
              <Input value={jql} onChange={(e) => setJql(e.target.value)} placeholder="project = MYPROJECT AND status = 'To Do'" />
            </div>
          ) : null}
          {settings?.tracker.project_key ? (
            <div className="grid gap-1.5">
              <label className="text-sm font-semibold">Project key</label>
              <Input value={settings.tracker.project_key} disabled />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Active states</label>
            <Input value={settings?.tracker.active_states.join(", ") ?? ""} disabled />
          </div>

          <p className="mb-0 mt-2 text-[11px] font-bold uppercase text-[var(--muted-foreground)]">Runtime Models</p>
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Runtime kind</label>
            <Input value={settings?.runtime.kind ?? "—"} disabled />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Execution model</label>
            <Input
              value={executionModel}
              onChange={(e) => setExecutionModel(e.target.value)}
              placeholder="e.g. claude-sonnet-4-6"
              disabled={settings?.runtime.kind !== "claude_code"}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-semibold">Planning model</label>
            <Input
              value={planningModel}
              onChange={(e) => setPlanningModel(e.target.value)}
              placeholder="e.g. claude-opus-4-7"
              disabled={settings?.runtime.kind !== "claude_code"}
            />
          </div>
          {settings?.runtime.kind !== "claude_code" ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Model editing is only available for the claude_code runtime.
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="self-start p-4 shadow-[var(--shadow)]">
        <h2 className="mb-3 mt-0 text-base font-semibold">Dependency Analysis</h2>
        <p className="mb-3 text-sm text-[var(--muted-foreground)]">
          LLM scan of open issues to detect implicit blockers. Results appear as "Blocked" badges on cards.
        </p>
        <Button variant="secondary" onClick={() => onAction("Scanning dependencies", () => scanDependencies())}>
          <ScanLine size={15} /> Scan Now
        </Button>
      </Card>
    </section>
  );
};

const BulkActionBar = ({
  board,
  selectedCards,
  onAction,
  onClear
}: {
  board: BoardSnapshot | null;
  selectedCards: BoardCard[];
  onAction: (label: string, action: () => Promise<unknown>) => void;
  onClear: () => void;
}) => {
  const [targetColumnId, setTargetColumnId] = useState("");
  const movableColumns = (board?.columns ?? []).filter((col) => col.acceptsManualMoves && col.moveState);
  if (selectedCards.length === 0) return null;
  const target = movableColumns.find((col) => col.id === targetColumnId);
  return (
    <div className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] p-2 shadow-[var(--shadow)] max-sm:w-[calc(100vw-2rem)] max-sm:flex-wrap">
      <strong>{selectedCards.length} selected</strong>
      <Select value={targetColumnId} onValueChange={setTargetColumnId} placeholder="Move state">
        {movableColumns.map((col) => (
          <SelectItem key={col.id} value={col.id}>
            {col.title}
          </SelectItem>
        ))}
      </Select>
      <Button
        disabled={!target}
        variant="secondary"
        onClick={() =>
          target &&
          onAction(`Moved ${selectedCards.length} tickets`, () =>
            Promise.all(selectedCards.map((card) => moveIssue(card.issueId, target.moveState ?? target.title)))
          )
        }
      >
        Move
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          onAction(`Retried ${selectedCards.length} tickets`, () => Promise.all(selectedCards.map((card) => retryIssue(card.issueId))))
        }
      >
        Retry
      </Button>
      <Button
        variant="danger"
        onClick={() => onAction(`Stopped ${selectedCards.length} tickets`, () => Promise.all(selectedCards.map((card) => stopIssue(card))))}
      >
        Stop
      </Button>
      <Button variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
};

const SkeletonBoard = () => (
  <section className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div className="bg-column min-h-[420px] animate-pulse rounded-[var(--radius)] border border-[var(--border)]" key={i} />
    ))}
  </section>
);

// ---- Pure helpers ----

const filterBoard = (board: BoardSnapshot | null, query: string): BoardSnapshot | null => {
  if (!board || query.trim() === "") return board;
  const needle = query.toLowerCase();
  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.filter((card) =>
        [card.identifier, card.title, card.state, card.runtimeStatus, ...card.labels].join(" ").toLowerCase().includes(needle)
      )
    }))
  };
};

const moveCardOptimistically = (board: BoardSnapshot, cardId: string, targetColumnId: string): BoardSnapshot => {
  let movedCard: BoardCard | undefined;
  const columns = board.columns.map((col) => ({
    ...col,
    cards: col.cards.filter((card) => {
      if (card.issueId === cardId) {
        movedCard = card;
        return false;
      }
      return true;
    })
  }));
  if (!movedCard) return board;
  return {
    ...board,
    columns: columns.map((col) => (col.id === targetColumnId ? { ...col, cards: [...col.cards, movedCard!] } : col))
  };
};

const columnForDrop = (columns: BoardColumn[], overId: string): BoardColumn | null =>
  columns.find((col) => col.id === overId) ?? columns.find((col) => col.cards.some((card) => card.issueId === overId)) ?? null;

const PageTransition = ({ children, id }: { children: ReactNode; id: string }) => (
  <motion.div
    key={id}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -4 }}
    transition={{ duration: 0.18, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

const normalizedLocation = (location: string): string => {
  if (location === "" || location === "/") return "/";
  return ROUTES.some((route) => route.path === location) ? location : "/";
};

const toggleSelected = (current: Set<string>, issueId: string, checked: boolean): Set<string> => {
  const next = new Set(current);
  if (checked) next.add(issueId);
  else next.delete(issueId);
  return next;
};

const statusTone = (status: BoardCard["runtimeStatus"]): "neutral" | "good" | "warn" | "bad" | "info" => {
  if (status === "completed") return "good";
  if (status === "failed" || status === "stalled") return "bad";
  if (status === "retrying" || status === "awaiting_review") return "warn";
  if (status === "planning" || status === "implementation" || status === "execution") return "info";
  return "neutral";
};

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const formatDuration = (ms: number): string => {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1_000)}s`;
};

const formatRelativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
};

const messageForError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

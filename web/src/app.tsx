import { DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  Command,
  Moon,
  RefreshCcw,
  ScanLine,
  Search,
  Share2,
  Sparkles,
  Sun
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CommandPalette, useCommandPalette } from "./components/CommandPalette";
import { IssueSheet } from "./components/IssueSheet";
import { TopologyPage } from "./pages/TopologyPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BoardPage } from "./pages/BoardPage";
import { RunsPage } from "./pages/RunsPage";
import { PullRequestPage } from "./pages/PullRequestPage";
import { ActivityPage } from "./pages/ActivityPage";
import { RefinementsPage } from "./pages/RefinementsPage";
import { SettingsPage } from "./pages/SettingsPage";
import {
  approvePlan,
  type BoardCard,
  type BoardSnapshot,
  type StateSnapshot,
  moveIssue,
  refreshService,
  retryIssue,
  scanDependencies,
  stopIssue,
} from "./api";
import {
  Badge,
  Button,
  Select,
  SelectItem,
  Tabs,
  TabsList,
  TabsTrigger,
  ToastProvider,
  cn,
  useToast
} from "./ui";
import {
  useNorthstarState,
  columnForDrop,
  moveCardOptimistically,
  toggleSelected,
} from "./hooks/useNorthstarState";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { ROUTES } from "./lib/constants";

type Theme = "light" | "dark";

export const App = () => (
  <ToastProvider>
    <NorthstarApp />
  </ToastProvider>
);

const NorthstarApp = () => {
  const [location, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("northstar-theme") === "light" ? "light" : "dark"));

  const {
    board,
    state,
    settings,
    selectedCard,
    setSelectedCard,
    selectedIds,
    setSelectedIds,
    loading,
    refreshing,
    filteredBoard: getFilteredBoard,
    refresh,
    handleRefresh,
    runAction,
    optimisticMoveCard,
    setDragging,
  } = useNorthstarState();

  const { push } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();

  useKeyboardNav(setLocation);

  const cmdApiActions = useMemo(() => ({
    stopIssue: (issueId: string) => stopIssue({ issueId } as BoardCard),
    retryIssue,
    approvePlan: (issueId: string) => {
      const card = board?.columns.flatMap((c) => c.cards).find((c) => c.issueId === issueId);
      return card ? approvePlan(card) : Promise.resolve();
    },
    scanDependencies,
    refreshService,
  }), [board]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("northstar-theme", theme);
  }, [theme]);

  const filteredBoard = useMemo(() => getFilteredBoard(query), [board, query]);
  const selectedCards = useMemo(() => {
    const cards = board?.columns.flatMap((col) => col.cards) ?? [];
    return cards.filter((card) => selectedIds.has(card.issueId));
  }, [board, selectedIds]);
  const awaitingPlan = state?.awaitingReview.find(
    (e) => e.issueId === selectedCard?.issueId || e.issue === selectedCard?.identifier
  );

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
    optimisticMoveCard(cardId, targetColumn.id);
    moveIssue(card.issueId, targetColumn.moveState)
      .then(() => refresh())
      .catch((err: unknown) => {
        refresh();
        push({ title: `Failed to move ${card.identifier}`, description: err instanceof Error ? err.message : String(err), tone: "error" });
      });
  };

  return (
    <div className="min-h-screen bg-transparent">
      <header
        className="bg-header sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--border)] px-6 py-3.5 max-lg:grid-cols-1 max-lg:items-stretch"
        style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
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
          <Button variant="ghost" aria-label="Open command palette" onClick={() => setCmdOpen(true)} title="Cmd+K">
            <Command size={16} />
          </Button>
          <Button variant="ghost" aria-label="Toggle theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </Button>
        </div>
      </header>

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        board={board}
        state={state}
        onNavigate={setLocation}
        onAction={runAction}
        apiActions={cmdApiActions}
      />

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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={() => setDragging(true)}
                  onDragEnd={(e) => { setDragging(false); handleDragEnd(e); }}
                  onDragCancel={() => setDragging(false)}
                >
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
            {normalizedLocation(location) === "/refinements" && (
              <PageTransition id="/refinements">
                <RefinementsPage state={state} onCardAction={runAction} />
              </PageTransition>
            )}
            {normalizedLocation(location) === "/activity" && (
              <PageTransition id="/activity">
                <ActivityPage state={state} board={filteredBoard} onSelectCard={setSelectedCard} />
              </PageTransition>
            )}
            {normalizedLocation(location) === "/topology" && (
              <PageTransition id="/topology">
                <TopologyPage board={filteredBoard} onSelectCard={setSelectedCard} />
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

      <BulkActionBar
        board={board}
        selectedCards={selectedCards}
        onClear={() => setSelectedIds(new Set())}
        onAction={runAction}
      />
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

// ── Page Heading ──────────────────────────────────────────────────────────────

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

// ── Bulk Action Bar ───────────────────────────────────────────────────────────

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
          onAction(`Retried ${selectedCards.length} tickets`, () =>
            Promise.all(selectedCards.map((card) => retryIssue(card.issueId)))
          )
        }
      >
        Retry
      </Button>
      <Button
        variant="danger"
        onClick={() =>
          onAction(`Stopped ${selectedCards.length} tickets`, () =>
            Promise.all(selectedCards.map((card) => stopIssue(card)))
          )
        }
      >
        Stop
      </Button>
      <Button variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

const SkeletonBoard = () => (
  <section className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div className="bg-column min-h-[420px] animate-pulse rounded-[var(--radius)] border border-[var(--border)]" key={i} />
    ))}
  </section>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

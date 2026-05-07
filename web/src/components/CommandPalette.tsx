import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Command,
  GitPullRequest,
  LayoutDashboard,
  RefreshCcw,
  RotateCcw,
  ScanLine,
  Settings,
  Share2,
  Square,
  Terminal,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardSnapshot, StateSnapshot } from "../api";
import { cn } from "../ui";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  section: "navigate" | "agent" | "global";
  onSelect: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  board: BoardSnapshot | null;
  state: StateSnapshot | null;
  onNavigate: (path: string) => void;
  onAction: (label: string, action: () => Promise<unknown>) => void;
  apiActions: {
    stopIssue: (issueId: string) => Promise<void>;
    retryIssue: (issueId: string) => Promise<void>;
    approvePlan: (issueId: string) => Promise<void>;
    scanDependencies: () => Promise<void>;
    refreshService: () => Promise<void>;
  };
}

const NAV_ITEMS: Array<{ path: string; label: string; icon: React.ReactNode }> = [
  { path: "/", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
  { path: "/board", label: "Board", icon: <Activity size={15} /> },
  { path: "/runs", label: "Runs", icon: <Zap size={15} /> },
  { path: "/prs", label: "Pull Requests", icon: <GitPullRequest size={15} /> },
  { path: "/activity", label: "Activity", icon: <Terminal size={15} /> },
  { path: "/topology", label: "Swarm Topology", icon: <Share2 size={15} /> },
  { path: "/settings", label: "Settings", icon: <Settings size={15} /> },
];

export const CommandPalette = ({ open, onClose, board, state, onNavigate, onAction, apiActions }: Props) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Navigation
    for (const nav of NAV_ITEMS) {
      cmds.push({
        id: `nav-${nav.path}`,
        label: nav.label,
        description: "Go to page",
        icon: nav.icon,
        section: "navigate",
        onSelect: () => { onNavigate(nav.path); onClose(); },
      });
    }

    // Per-agent actions
    const running = state?.running ?? [];
    for (const run of running) {
      cmds.push({
        id: `stop-${run.issueId}`,
        label: `Stop ${run.issue}`,
        description: "Halt running agent",
        icon: <Square size={15} className="text-[var(--destructive)]" />,
        section: "agent",
        onSelect: () => {
          onAction(`Stopped ${run.issue}`, () => apiActions.stopIssue(run.issueId));
          onClose();
        },
      });
    }

    const retrying = state?.retryAttempts ?? [];
    for (const retry of retrying) {
      const card = board?.columns.flatMap((c) => c.cards).find((c) => c.issueId === retry.issueId);
      if (!card) continue;
      cmds.push({
        id: `retry-${retry.issueId}`,
        label: `Retry ${card.identifier}`,
        description: `Attempt #${retry.attempt + 1}`,
        icon: <RotateCcw size={15} className="text-[var(--warning)]" />,
        section: "agent",
        onSelect: () => {
          onAction(`Retried ${card.identifier}`, () => apiActions.retryIssue(retry.issueId));
          onClose();
        },
      });
    }

    const awaiting = state?.awaitingReview ?? [];
    for (const plan of awaiting) {
      cmds.push({
        id: `approve-${plan.issueId}`,
        label: `Approve plan for ${plan.issue}`,
        description: "Unblock awaiting agent",
        icon: <CheckCircle2 size={15} className="text-[var(--success)]" />,
        section: "agent",
        onSelect: () => {
          onAction(`Approved ${plan.issue}`, () => apiActions.approvePlan(plan.issueId));
          onClose();
        },
      });
    }

    const failed = board?.columns.flatMap((c) => c.cards).filter((c) => c.runtimeStatus === "failed") ?? [];
    for (const card of failed) {
      cmds.push({
        id: `retry-failed-${card.issueId}`,
        label: `Retry ${card.identifier}`,
        description: card.title,
        icon: <RotateCcw size={15} className="text-[var(--warning)]" />,
        section: "agent",
        onSelect: () => {
          onAction(`Retried ${card.identifier}`, () => apiActions.retryIssue(card.issueId));
          onClose();
        },
      });
    }

    // Global actions
    cmds.push({
      id: "global-stop-all",
      label: "Stop all running agents",
      description: `${running.length} active runs`,
      icon: <XCircle size={15} className="text-[var(--destructive)]" />,
      section: "global",
      onSelect: () => {
        onAction("Stopped all agents", () => Promise.all(running.map((r) => apiActions.stopIssue(r.issueId))));
        onClose();
      },
    });
    cmds.push({
      id: "global-retry-all",
      label: "Retry all failed agents",
      description: `${failed.length} failed`,
      icon: <RotateCcw size={15} />,
      section: "global",
      onSelect: () => {
        onAction("Retried all failed", () => Promise.all(failed.map((c) => apiActions.retryIssue(c.issueId))));
        onClose();
      },
    });
    cmds.push({
      id: "global-scan",
      label: "Scan dependencies",
      description: "LLM analysis of blockers",
      icon: <ScanLine size={15} />,
      section: "global",
      onSelect: () => {
        onAction("Scanning dependencies", () => apiActions.scanDependencies());
        onClose();
      },
    });
    cmds.push({
      id: "global-refresh",
      label: "Refresh board",
      description: "Poll tracker for latest state",
      icon: <RefreshCcw size={15} />,
      section: "global",
      onSelect: () => {
        onAction("Refreshed", () => apiActions.refreshService());
        onClose();
      },
    });

    return cmds;
  }, [board, state, onNavigate, onAction, onClose, apiActions]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Clamp activeIndex to filtered length
  const safeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  useEffect(() => { setActiveIndex(0); }, [query]);
  useEffect(() => {
    if (open) { setQuery(""); setActiveIndex(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[safeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [safeIndex]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); filtered[safeIndex]?.onSelect(); }
    if (e.key === "Escape")    { onClose(); }
  };

  const sections: Array<{ key: Command["section"]; label: string }> = [
    { key: "navigate", label: "Navigate" },
    { key: "agent", label: "Agent Actions" },
    { key: "global", label: "Global" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cmd-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="cmd-panel"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onKeyDown={handleKey}
          >
            {/* Search bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--glass-border)]">
              <Command size={16} className="shrink-0 text-[var(--muted-foreground)]" />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent border-0 outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                placeholder="Type a command or navigate…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd className="hidden sm:inline-flex items-center rounded border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted-foreground)]">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto py-1" ref={listRef}>
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">No matching commands</div>
              ) : (
                query.trim()
                  ? filtered.map((cmd, i) => (
                      <CmdItem key={cmd.id} cmd={cmd} active={i === safeIndex} onSelect={cmd.onSelect} />
                    ))
                  : sections.map(({ key, label }) => {
                      const items = filtered.filter((c) => c.section === key);
                      if (items.length === 0) return null;
                      return (
                        <div key={key}>
                          <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                            {label}
                          </div>
                          {items.map((cmd) => {
                            const globalIdx = filtered.indexOf(cmd);
                            return (
                              <CmdItem key={cmd.id} cmd={cmd} active={globalIdx === safeIndex} onSelect={cmd.onSelect} />
                            );
                          })}
                        </div>
                      );
                    })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--glass-border)] px-4 py-2 flex items-center gap-4 text-[10px] text-[var(--muted-foreground)]">
              <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
              <span><kbd className="font-semibold">↵</kbd> select</span>
              <span><kbd className="font-semibold">esc</kbd> close</span>
              <span className="ml-auto inline-flex items-center gap-1"><Command size={10} /> K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const CmdItem = ({ cmd, active, onSelect }: { cmd: Command; active: boolean; onSelect: () => void }) => (
  <button
    className={cn(
      "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left border-0 bg-transparent cursor-pointer transition-colors duration-100",
      active
        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
        : "text-[var(--foreground)] hover:bg-[var(--accent)]"
    )}
    onMouseEnter={onSelect !== undefined ? undefined : undefined}
    onMouseDown={(e) => { e.preventDefault(); onSelect(); }}
  >
    <span className="shrink-0 text-[var(--muted-foreground)]">{cmd.icon}</span>
    <span className="flex-1 min-w-0">
      <span className="font-medium">{cmd.label}</span>
      {cmd.description ? (
        <span className="ml-2 text-[12px] text-[var(--muted-foreground)] truncate">{cmd.description}</span>
      ) : null}
    </span>
    {active && <ChevronRight size={14} className="shrink-0 text-[var(--muted-foreground)]" />}
  </button>
);

// ── Global keyboard listener hook ────────────────────────────────────────────

export const useCommandPalette = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
};

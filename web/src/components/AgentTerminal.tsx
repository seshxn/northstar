import { AnimatePresence, motion } from "framer-motion";
import { Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StateSnapshot } from "../api";

// ── Syntax highlighter ──────────────────────────────────────────────────────

const TOOL_KEYWORDS = [
  "Bash", "Read", "Write", "Edit", "Agent", "WebFetch", "WebSearch",
  "TodoWrite", "NotebookEdit", "TaskCreate", "TaskUpdate",
];
const PATH_RE = /(\/?[\w.-]+\/[\w./-]+)/g;
const TOOL_RE = new RegExp(`\\b(${TOOL_KEYWORDS.join("|")})\\b`, "g");
const ERROR_RE = /\b(error|Error|failed|Failed|exception|Exception|TypeError|ReferenceError)\b/gi;

const highlight = (text: string): React.ReactNode[] => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Replace in order: errors, tools, paths
  const tokens: Array<{ index: number; length: number; cls: string; text: string }> = [];

  let m: RegExpExecArray | null;
  const addMatches = (re: RegExp, cls: string) => {
    re.lastIndex = 0;
    while ((m = re.exec(remaining)) !== null) {
      tokens.push({ index: m.index, length: m[0].length, cls, text: m[0] });
    }
  };

  addMatches(ERROR_RE, "terminal-error");
  addMatches(TOOL_RE, "terminal-keyword");
  addMatches(PATH_RE, "terminal-path");

  tokens.sort((a, b) => a.index - b.index);

  let cursor = 0;
  for (const tok of tokens) {
    if (tok.index < cursor) continue;
    if (tok.index > cursor) {
      parts.push(<span key={key++}>{remaining.slice(cursor, tok.index)}</span>);
    }
    parts.push(<span key={key++} className={tok.cls}>{tok.text}</span>);
    cursor = tok.index + tok.length;
  }
  if (cursor < remaining.length) {
    parts.push(<span key={key++}>{remaining.slice(cursor)}</span>);
  }
  return parts;
};

// ── Typing animation for a single line ──────────────────────────────────────

const TerminalLine = ({ text, delay = 0, instant = false }: { text: string; delay?: number; instant?: boolean }) => {
  const [displayed, setDisplayed] = useState(instant ? text : "");

  useEffect(() => {
    if (instant) { setDisplayed(text); return; }
    setDisplayed("");
    const chars = text.split("");
    let i = 0;
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(chars.slice(0, i).join(""));
        if (i >= chars.length) clearInterval(interval);
      }, 12);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timer);
  }, [text, delay, instant]);

  return (
    <div className="leading-6 whitespace-pre-wrap break-all">
      {highlight(displayed)}
      {displayed.length < text.length && <span className="terminal-cursor" />}
    </div>
  );
};

// ── Mini terminal (dashboard) ────────────────────────────────────────────────

interface MiniTerminalProps {
  state: StateSnapshot | null;
}

export const MiniAgentTerminal = ({ state }: MiniTerminalProps) => {
  const activeRun = state?.running[0] ?? null;
  const events = activeRun ? [] : [];
  const results = state?.results ?? [];
  const lastResult = results[results.length - 1];

  const lines = activeRun
    ? buildRunLines(activeRun)
    : lastResult
    ? buildResultLines(lastResult)
    : [];

  if (!activeRun && !lastResult) {
    return (
      <div className="terminal-window p-3">
        <TerminalHeader label="Agent Brain" active={false} />
        <div className="terminal-dim text-xs mt-2 px-1">No active agents. Waiting for dispatch…</div>
      </div>
    );
  }

  return (
    <div className="terminal-window p-3">
      <TerminalHeader label={activeRun ? `${activeRun.issue} — live` : `${lastResult?.issue} — last run`} active={!!activeRun} />
      <div className="mt-2 px-1 max-h-[180px] overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          {lines.slice(-6).map((line, i) => (
            <motion.div
              key={`${line}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <TerminalLine text={line} instant={i < lines.length - 1} delay={i === lines.length - 1 ? 80 : 0} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ── Full terminal (issue sheet) ──────────────────────────────────────────────

interface FullTerminalProps {
  issueId: string;
  issue: string;
  state: StateSnapshot | null;
}

export const FullAgentTerminal = ({ issueId, issue, state }: FullTerminalProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const run = state?.running.find((r) => r.issueId === issueId);
  const result = state?.results.find((r) => r.issueId === issueId);
  const events = result?.events ?? [];
  const isLive = !!run;

  const lines: string[] = isLive
    ? buildRunLines(run!)
    : events.map((e) => e.message ?? e.type);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div className="terminal-window">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[oklch(0_0_0/0.3)]">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[oklch(0.7_0.18_22)]" />
          <span className="size-3 rounded-full bg-[oklch(0.78_0.17_85)]" />
          <span className="size-3 rounded-full bg-[oklch(0.72_0.17_152)]" />
        </div>
        <span className="ml-2 text-[10px] text-[var(--terminal-dim,oklch(0.5_0_0))] font-semibold uppercase tracking-widest">
          {issue}
        </span>
        {isLive && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--terminal-fg)]">
            <span className="size-1.5 rounded-full bg-[var(--terminal-fg)] animate-pulse" />
            LIVE
          </span>
        )}
      </div>
      <div ref={scrollRef} className="px-3 py-2 max-h-[320px] overflow-y-auto">
        <AnimatePresence mode="popLayout" initial={false}>
          {lines.length === 0 ? (
            <div className="terminal-dim text-xs">Waiting for events…<span className="terminal-cursor" /></div>
          ) : (
            lines.map((line, i) => (
              <motion.div
                key={`${i}-${line.slice(0, 20)}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.12 }}
              >
                <TerminalLine
                  text={line}
                  instant={!isLive || i < lines.length - 1}
                  delay={isLive && i === lines.length - 1 ? 60 : 0}
                />
              </motion.div>
            ))
          )}
        </AnimatePresence>
        {isLive && <div className="terminal-cursor mt-1" />}
      </div>
    </div>
  );
};

// ── Shared helpers ───────────────────────────────────────────────────────────

const TerminalHeader = ({ label, active }: { label: string; active: boolean }) => (
  <div className="flex items-center gap-2 mb-1">
    <Terminal size={12} className={active ? "text-[var(--terminal-fg)]" : "terminal-dim"} />
    <span className="text-[10px] font-semibold uppercase tracking-widest terminal-dim">{label}</span>
    {active && <span className="ml-auto size-1.5 rounded-full bg-[var(--terminal-fg)] animate-pulse" />}
  </div>
);

const buildRunLines = (run: StateSnapshot["running"][number]): string[] => {
  const lines: string[] = [];
  if (run.startedAt) lines.push(`$ started at ${new Date(run.startedAt).toLocaleTimeString()}`);
  if (run.skillSequence?.length) lines.push(`$ skills: ${run.skillSequence.join(" → ")}`);
  if (run.toolNames?.length) lines.push(`$ tools: ${run.toolNames.join(", ")}`);
  if (run.lastEvent) lines.push(run.lastEvent);
  return lines.filter(Boolean);
};

const buildResultLines = (result: StateSnapshot["results"][number]): string[] => {
  const lines: string[] = [];
  if (result.startedAt) lines.push(`$ run started at ${new Date(result.startedAt).toLocaleTimeString()}`);
  if (result.toolNames?.length) lines.push(`$ tools used: ${result.toolNames.join(", ")}`);
  const last = result.events?.slice(-4) ?? [];
  for (const e of last) if (e.message) lines.push(e.message);
  lines.push(`$ status: ${result.status}`);
  return lines.filter(Boolean);
};

import { Clock3, Cpu, Wrench, Zap } from "lucide-react";
import type { StateSnapshot } from "../api";
import { Badge } from "../ui";

interface Props {
  result: StateSnapshot["results"][number];
}

export const ChangeLogVisual = ({ result }: Props) => {
  const { tokens, toolNames, events, startedAt, completedAt } = result;
  const durationMs =
    startedAt && completedAt ? new Date(completedAt).getTime() - new Date(startedAt).getTime() : null;

  const toolCounts = countTools(toolNames ?? []);
  const phases = extractPhases(events ?? []);

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[oklch(from_var(--muted)_l_c_h_/_0.4)]">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--muted-foreground)]">Change Summary</span>
        {durationMs !== null && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
            <Clock3 size={11} /> {formatDuration(durationMs)}
          </span>
        )}
      </div>

      <div className="p-3 grid gap-3">
        {/* Token distribution */}
        {tokens && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
              <Zap size={11} /> Token Distribution
            </div>
            <div className="grid grid-cols-3 gap-2">
              <TokenStat label="Total" value={formatTokenCount(tokens.total)} color="var(--foreground)" />
              <TokenStat label="Input" value={formatTokenCount(tokens.input)} color="var(--info)" />
              <TokenStat label="Output" value={formatTokenCount(tokens.output)} color="var(--success)" />
            </div>
            <TokenDistributionBar tokens={tokens} />
          </div>
        )}

        {/* Phase timeline */}
        {phases.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
              <Cpu size={11} /> Phase Timeline
            </div>
            <PhaseTimeline phases={phases} />
          </div>
        )}

        {/* Tool usage */}
        {toolCounts.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
              <Wrench size={11} /> Tools Used
            </div>
            <div className="flex flex-wrap gap-1.5">
              {toolCounts.map(({ tool, count }) => (
                <span
                  key={tool}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted-foreground)]"
                >
                  {tool}
                  {count > 1 && (
                    <span className="rounded-full bg-[var(--accent)] px-1 text-[10px]">{count}×</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <Badge tone={result.status === "completed" ? "good" : "bad"}>{result.status}</Badge>
          {result.eventCount > 0 && (
            <span className="text-[11px] text-[var(--muted-foreground)]">{result.eventCount} events</span>
          )}
        </div>
      </div>
    </div>
  );
};

const TokenStat = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="rounded-[calc(var(--radius)-4px)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2">
    <div className="text-[10px] font-semibold uppercase text-[var(--muted-foreground)]">{label}</div>
    <div className="token-counter text-sm font-bold mt-0.5" style={{ color }}>{value}</div>
  </div>
);

const TokenDistributionBar = ({ tokens }: { tokens: { input: number; output: number; total: number } }) => {
  const inputPct = Math.round((tokens.input / tokens.total) * 100);
  const outputPct = 100 - inputPct;
  return (
    <div className="mt-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${inputPct}%`, background: "oklch(from var(--info) l c h / 0.7)" }}
        />
        <div
          className="h-full flex-1"
          style={{ background: "oklch(from var(--success) l c h / 0.7)" }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted-foreground)]">
        <span>Input {inputPct}%</span>
        <span>Output {outputPct}%</span>
      </div>
    </div>
  );
};

interface Phase {
  label: string;
  weight: number;
  color: string;
}

const PhaseTimeline = ({ phases }: { phases: Phase[] }) => {
  const total = phases.reduce((s, p) => s + p.weight, 0);
  return (
    <div className="flex h-5 w-full overflow-hidden rounded-[4px] gap-px">
      {phases.map((phase) => (
        <div
          key={phase.label}
          className="flex items-center justify-center text-[9px] font-bold text-white overflow-hidden transition-all duration-500"
          style={{
            flex: phase.weight / total,
            background: phase.color,
            minWidth: phase.weight / total > 0.08 ? undefined : 0,
          }}
          title={`${phase.label}: ${phase.weight} events`}
        >
          {phase.weight / total > 0.12 ? phase.label.toUpperCase() : ""}
        </div>
      ))}
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const countTools = (toolNames: string[]) => {
  const counts: Record<string, number> = {};
  for (const t of toolNames) counts[t] = (counts[t] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tool, count]) => ({ tool, count }));
};

const PHASE_COLORS: Record<string, string> = {
  planning:       "oklch(0.6 0.18 250)",
  implementation: "oklch(0.65 0.18 200)",
  execution:      "oklch(0.65 0.18 152)",
  unknown:        "oklch(0.5 0 0)",
};

const extractPhases = (events: Array<{ type: string; message?: string }>): Phase[] => {
  const counts: Record<string, number> = { planning: 0, implementation: 0, execution: 0, unknown: 0 };
  for (const e of events) {
    const t = e.type?.toLowerCase() ?? "";
    if (t.includes("plan")) counts.planning++;
    else if (t.includes("impl") || t.includes("edit") || t.includes("write")) counts.implementation++;
    else if (t.includes("exec") || t.includes("bash") || t.includes("run")) counts.execution++;
    else counts.unknown++;
  }
  return Object.entries(counts)
    .filter(([, w]) => w > 0)
    .map(([label, weight]) => ({ label, weight, color: PHASE_COLORS[label] ?? PHASE_COLORS.unknown }));
};

const formatDuration = (ms: number): string => {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.round(ms / 1_000)}s`;
};

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

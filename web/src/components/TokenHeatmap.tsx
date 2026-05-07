import { Activity, CheckCircle2, CircleAlert, Clock3, XCircle, Zap } from "lucide-react";
import { type ReactNode } from "react";
import type { AuditEvent, BoardSnapshot, StateSnapshot } from "../api";
import { Card } from "../ui";
import { DonutRing } from "./DonutRing";
import { cn } from "../ui";

interface Props {
  board: BoardSnapshot;
  state: StateSnapshot | null;
  successRate: number | null;
}

export const TokenHeatmap = ({ board, state, successRate }: Props) => {
  const auditLog = state?.auditLog ?? [];

  return (
    <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
      <HeatMetric
        icon={<Activity />}
        label="Running"
        value={board.metrics.running}
        tone="info"
        auditLog={auditLog}
        kindFilter={["run_started"]}
        active={board.metrics.running > 0}
      />
      <HeatMetric
        icon={<Clock3 />}
        label="Awaiting"
        value={board.metrics.awaitingReview}
        tone="warn"
        auditLog={auditLog}
        kindFilter={["plan_created"]}
        active={false}
      />
      <HeatMetric
        icon={<CircleAlert />}
        label="Retrying"
        value={board.metrics.retrying}
        tone="bad"
        auditLog={auditLog}
        kindFilter={["retry_scheduled"]}
        active={false}
        hazard={board.metrics.retrying >= 2}
      />
      <HeatMetric
        icon={<CheckCircle2 />}
        label="Completed"
        value={board.metrics.completed}
        tone="good"
        auditLog={auditLog}
        kindFilter={["run_completed"]}
        active={false}
      />
      <HeatMetric
        icon={<XCircle />}
        label="Failed"
        value={board.metrics.failed}
        tone="bad"
        auditLog={auditLog}
        kindFilter={["run_failed"]}
        active={false}
        hazard={board.metrics.failed > 0}
      />
      <TokenBurnCard state={state} successRate={successRate} />
    </section>
  );
};

const TONE_GLOW: Record<string, string> = {
  info: "glow-running",
  warn: "glow-awaiting",
  good: "glow-completed",
  bad: "glow-failed",
};

interface HeatMetricProps {
  icon: ReactNode;
  label: string;
  value: number;
  tone: "info" | "warn" | "good" | "bad";
  auditLog: AuditEvent[];
  kindFilter: string[];
  active: boolean;
  hazard?: boolean;
}

const HeatMetric = ({ icon, label, value, tone, auditLog, kindFilter, active, hazard }: HeatMetricProps) => {
  const bars = buildSparkline(auditLog, kindFilter);

  return (
    <Card
      className={cn(
        "p-3.5 transition-all duration-500 glass-card relative overflow-hidden",
        active && TONE_GLOW[tone],
        active && "animate-breathe",
        hazard && "animate-hazard"
      )}
    >
      <div className="relative z-10">
        <div className={cn("mb-3 text-[var(--muted-foreground)]", active && toneTextClass(tone))}>{icon}</div>
        <span className="block text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">{label}</span>
        <strong className="mt-1 block text-3xl leading-none">{value}</strong>
        <Sparkline bars={bars} tone={tone} />
      </div>
    </Card>
  );
};

const toneTextClass = (tone: string) => {
  if (tone === "info") return "text-[var(--info)]";
  if (tone === "warn") return "text-[var(--warning)]";
  if (tone === "good") return "text-[var(--success)]";
  return "text-[var(--destructive)]";
};

const Sparkline = ({ bars, tone }: { bars: number[]; tone: string }) => {
  if (bars.every((b) => b === 0)) return null;
  const max = Math.max(...bars, 1);
  const colorMap: Record<string, string> = {
    info: "oklch(from var(--info) l c h / 0.6)",
    warn: "oklch(from var(--warning) l c h / 0.6)",
    good: "oklch(from var(--success) l c h / 0.6)",
    bad: "oklch(from var(--destructive) l c h / 0.6)",
  };
  const color = colorMap[tone] ?? colorMap.info;

  return (
    <div className="mt-2.5 flex items-end gap-[2px]" style={{ height: 20 }}>
      {bars.map((v, i) => (
        <span
          key={i}
          className="sparkline-bar"
          style={{
            height: `${Math.max(3, Math.round((v / max) * 20))}px`,
            background: color,
          }}
        />
      ))}
    </div>
  );
};

const TokenBurnCard = ({ state, successRate }: { state: StateSnapshot | null; successRate: number | null }) => (
  <Card className="p-3.5 glass-card">
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
    {state && state.tokenTotals.total > 0 ? (
      <TokenBar input={state.tokenTotals.input} output={state.tokenTotals.output} total={state.tokenTotals.total} />
    ) : null}
  </Card>
);

const TokenBar = ({ input, output, total }: { input: number; output: number; total: number }) => {
  const inputPct = Math.round((input / total) * 100);
  return (
    <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
      <div
        className="h-full rounded-l-full transition-all duration-700"
        style={{ width: `${inputPct}%`, background: "oklch(from var(--info) l c h / 0.7)" }}
      />
      <div
        className="h-full flex-1 rounded-r-full"
        style={{ background: "oklch(from var(--success) l c h / 0.7)" }}
      />
    </div>
  );
};

const buildSparkline = (auditLog: AuditEvent[], kinds: string[]): number[] => {
  const buckets = new Array<number>(12).fill(0);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const bucketMs = windowMs / 12;

  for (const event of auditLog) {
    if (!kinds.includes(event.kind)) continue;
    const age = now - new Date(event.timestamp).getTime();
    if (age > windowMs) continue;
    const bucket = Math.min(11, Math.floor(age / bucketMs));
    buckets[11 - bucket]++;
  }
  return buckets;
};

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

import { useState, useRef, useEffect } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "../ui";
import type { StateSnapshot } from "../api";
import { formatDuration, formatTokenCount } from "../hooks/useNorthstarState";

// ── Layout constants ──────────────────────────────────────────────────────────

const PAD = { l: 44, r: 10, t: 14, b: 26 } as const;
const PW = 200;
const PH = 88;
const SW = PW + PAD.l + PAD.r; // 254
const SH = PH + PAD.t + PAD.b; // 128
const FONT = "var(--font-geist-sans, system-ui, sans-serif)";
const DIM = "var(--muted-foreground)";

// ── Scale helpers ─────────────────────────────────────────────────────────────

const scY = (v: number, max: number) => PAD.t + PH - (v / Math.max(max, 1)) * PH;
const scX = (i: number, n: number) => PAD.l + (n < 2 ? PW / 2 : (i / (n - 1)) * PW);

const niceMax = (v: number): number => {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 2, 2.5, 5, 10]) if (v <= f * mag) return f * mag;
  return 10 * mag;
};

const mkTicks = (max: number, n = 4): number[] => {
  if (max <= 0) return [0, 1];
  if (max <= n) return Array.from({ length: Math.floor(max) + 1 }, (_, i) => i);
  return Array.from({ length: n + 1 }, (_, i) => Math.round((max / n) * i));
};

const fmtDur = (ms: number) => {
  if (ms === 0) return "0";
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  return `${Math.round(ms / 60_000)}m`;
};

const calcTrend = (values: number[]): "up" | "down" | "flat" => {
  const n = values.length;
  if (n < 4) return "flat";
  const half = Math.floor(n / 2);
  const a = values.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const b = values.slice(half).reduce((s, v) => s + v, 0) / (n - half);
  if (b > a * 1.08) return "up";
  if (b < a * 0.92) return "down";
  return "flat";
};

const trendIcon = (trend: "up" | "down" | "flat", upIsBad: boolean) => {
  if (trend === "flat") return null;
  const bad = (trend === "up") === upIsBad;
  const cls = bad ? "text-[var(--destructive)]" : "text-[var(--success)]";
  return trend === "up" ? <TrendingUp size={13} className={cls} /> : <TrendingDown size={13} className={cls} />;
};

const runXLabels = (pts: { x: number }[], n: number) =>
  pts
    .map((p, i) => ({ x: p.x, label: String(i + 1), ok: i === 0 || i === n - 1 || (n > 5 && i % Math.ceil(n / 5) === 0) }))
    .filter((d) => d.ok)
    .map(({ x, label }) => ({ x, label }));

// ── SVG tooltip ───────────────────────────────────────────────────────────────

type Tip = { sx: number; sy: number; lines: string[] } | null;

const SvgTooltip = ({ tip }: { tip: Tip }) => {
  if (!tip) return null;
  const LH = 13, PX = 7, PY = 5;
  const w = Math.max(...tip.lines.map((l) => l.length)) * 5.5 + PX * 2;
  const h = tip.lines.length * LH + PY * 2;
  const tx = Math.min(tip.sx + 10, SW - w - 2);
  const ty = tip.sy - h - 8 < 2 ? tip.sy + 10 : tip.sy - h - 8;
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={h} rx="3"
        fill="var(--card)" stroke="var(--border)" strokeWidth="0.75" opacity="0.97" />
      {tip.lines.map((l, i) => (
        <text key={i} x={tx + PX} y={ty + PY + (i + 1) * LH - 2}
          fontSize="9" fill="var(--foreground)" fontFamily={FONT}>{l}</text>
      ))}
    </g>
  );
};

// ── Grid + axes ───────────────────────────────────────────────────────────────

const Axes = ({
  ticks, maxY, fmt, xLabels
}: {
  ticks: number[];
  maxY: number;
  fmt: (v: number) => string;
  xLabels?: Array<{ x: number; label: string }>;
}) => (
  <>
    {ticks.map((v) => {
      const y = scY(v, maxY);
      return (
        <g key={v}>
          <line x1={PAD.l} y1={y} x2={PAD.l + PW} y2={y}
            stroke="var(--border)" strokeWidth="0.5"
            strokeDasharray={v === 0 ? undefined : "3 3"} />
          <text x={PAD.l - 4} y={y + 3.5} textAnchor="end"
            fontSize="8.5" fill={DIM} fontFamily={FONT}>{fmt(v)}</text>
        </g>
      );
    })}
    <line x1={PAD.l} y1={PAD.t + PH} x2={PAD.l + PW} y2={PAD.t + PH}
      stroke="var(--border)" strokeWidth="0.5" />
    {xLabels?.map(({ x, label }) => (
      <text key={label + x} x={x} y={SH - 4} textAnchor="middle"
        fontSize="8.5" fill={DIM} fontFamily={FONT}>{label}</text>
    ))}
  </>
);

// ── Chart card wrapper ────────────────────────────────────────────────────────

const ChartCard = ({
  label, stat, trendNode, legend, children
}: {
  label: string;
  stat?: string;
  trendNode?: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Card className="p-3.5 glass-card shadow-[var(--shadow)]">
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">{label}</span>
        {legend}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {stat ? <span className="text-sm font-semibold tabular-nums">{stat}</span> : null}
        {trendNode}
      </div>
    </div>
    {children}
  </Card>
);

const NoData = () => (
  <div className="flex items-center justify-center" style={{ height: SH }}>
    <span className="text-xs text-[var(--muted-foreground)]">Not enough data yet</span>
  </div>
);

// ── 1. Token Burn per Run — area chart ───────────────────────────────────────

const TokenBurnChart = ({ results }: { results: StateSnapshot["results"] }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const data = results.slice(-20).map((r) => ({
    tokens: r.tokens?.total ?? 0,
    issue: r.issue,
    status: r.status,
  }));

  if (data.length < 2) return <ChartCard label="Token Burn / Run"><NoData /></ChartCard>;

  const n = data.length;
  const maxY = niceMax(Math.max(...data.map((d) => d.tokens)));
  const ticks = mkTicks(maxY, 3);
  const pts = data.map((d, i) => ({ x: scX(i, n), y: scY(d.tokens, maxY), ...d }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${pts.at(-1)!.x.toFixed(1)},${PAD.t + PH} L${PAD.l},${PAD.t + PH}Z`;
  const colW = n > 1 ? PW / (n - 1) : PW;
  const trend = calcTrend(data.map((d) => d.tokens));

  const activePt = activeIdx !== null ? pts[activeIdx] : null;
  const tip: Tip = activeIdx !== null
    ? { sx: pts[activeIdx].x, sy: pts[activeIdx].y, lines: [`Run ${activeIdx + 1} · ${data[activeIdx].issue}`, `Tokens: ${formatTokenCount(data[activeIdx].tokens)}`, `Status: ${data[activeIdx].status}`] }
    : null;

  return (
    <ChartCard
      label="Token Burn / Run"
      stat={results.at(-1)?.tokens?.total != null ? formatTokenCount(results.at(-1)!.tokens!.total) : undefined}
      trendNode={trendIcon(trend, true)}
    >
      <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`}
        onMouseLeave={() => setActiveIdx(null)} style={{ cursor: "crosshair" }}>
        <defs>
          <linearGradient id="g-tb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--info)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--info)" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id="cp-tb">
            <rect x={PAD.l} y={PAD.t} width={PW} height={PH} />
          </clipPath>
        </defs>
        <Axes ticks={ticks} maxY={maxY} fmt={formatTokenCount} xLabels={runXLabels(pts, n)} />
        <path d={areaPath} fill="url(#g-tb)" clipPath="url(#cp-tb)" />
        <path d={linePath} fill="none" stroke="var(--info)" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" clipPath="url(#cp-tb)" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={activeIdx === i ? 3.5 : 2}
            fill="var(--info)" opacity={activeIdx === i ? 1 : 0.6} />
        ))}
        {pts.map((p, i) => (
          <rect key={i}
            x={Math.max(PAD.l, p.x - colW / 2)} y={PAD.t}
            width={Math.min(colW, PAD.l + PW - Math.max(PAD.l, p.x - colW / 2))} height={PH}
            fill="transparent" onMouseEnter={() => setActiveIdx(i)} />
        ))}
        {activePt && (
          <line x1={activePt.x} y1={PAD.t} x2={activePt.x} y2={PAD.t + PH}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="2 2" pointerEvents="none" />
        )}
        <SvgTooltip tip={tip} />
      </svg>
    </ChartCard>
  );
};

// ── 2. Run Duration — bar chart ──────────────────────────────────────────────

const DurationChart = ({ results }: { results: StateSnapshot["results"] }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const data = results
    .filter((r) => r.startedAt && r.completedAt)
    .slice(-20)
    .map((r) => ({
      ms: new Date(r.completedAt).getTime() - new Date(r.startedAt!).getTime(),
      ok: r.status === "completed",
      issue: r.issue,
    }));

  if (data.length < 2) return <ChartCard label="Run Duration"><NoData /></ChartCard>;

  const n = data.length;
  const maxY = niceMax(Math.max(...data.map((d) => d.ms)));
  const ticks = mkTicks(maxY, 3);
  const avg = data.reduce((s, d) => s + d.ms, 0) / n;
  const avgY = scY(avg, maxY);
  const slotW = PW / n;
  const barW = Math.max(3, slotW * 0.65);
  const trend = calcTrend(data.map((d) => d.ms));

  const xLabels = data
    .map((_, i) => ({ x: PAD.l + (i + 0.5) * slotW, label: String(i + 1), ok: i === 0 || i === n - 1 || (n > 5 && i % Math.ceil(n / 5) === 0) }))
    .filter((d) => d.ok)
    .map(({ x, label }) => ({ x, label }));

  const tip: Tip = activeIdx !== null
    ? { sx: PAD.l + (activeIdx + 0.5) * slotW, sy: scY(data[activeIdx].ms, maxY), lines: [`Run ${activeIdx + 1} · ${data[activeIdx].issue}`, `Duration: ${formatDuration(data[activeIdx].ms)}`, `Status: ${data[activeIdx].ok ? "completed" : "failed"}`] }
    : null;

  return (
    <ChartCard label="Run Duration" stat={formatDuration(avg)} trendNode={trendIcon(trend, true)}>
      <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`}
        onMouseLeave={() => setActiveIdx(null)} style={{ cursor: "crosshair" }}>
        <Axes ticks={ticks} maxY={maxY} fmt={fmtDur} xLabels={xLabels} />
        {data.map((d, i) => {
          const bh = Math.max(2, (d.ms / maxY) * PH);
          const bx = PAD.l + i * slotW + (slotW - barW) / 2;
          const by = PAD.t + PH - bh;
          return (
            <rect key={i} x={bx} y={by} width={barW} height={bh} rx="1.5"
              opacity={activeIdx === null || activeIdx === i ? 1 : 0.45}
              fill={d.ok ? "oklch(from var(--success) l c h / 0.65)" : "oklch(from var(--destructive) l c h / 0.65)"}
              onMouseEnter={() => setActiveIdx(i)} />
          );
        })}
        <line x1={PAD.l} y1={avgY} x2={PAD.l + PW} y2={avgY}
          stroke={DIM} strokeWidth="1" strokeDasharray="4 2" opacity="0.55" pointerEvents="none" />
        <text x={PAD.l + 3} y={avgY - 3} fontSize="8" fill={DIM} fontFamily={FONT} opacity="0.7">avg</text>
        <SvgTooltip tip={tip} />
      </svg>
    </ChartCard>
  );
};

// ── 3. Daily Velocity — grouped bars ─────────────────────────────────────────

const VelocityChart = ({ auditLog }: { auditLog: NonNullable<StateSnapshot["auditLog"]> }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const DAYS = 7;
  const DAY_MS = 86_400_000;
  const now = Date.now();

  const buckets = Array.from({ length: DAYS }, (_, i) => ({
    label: new Date(now - (DAYS - 1 - i) * DAY_MS).toLocaleDateString("en", { weekday: "short" }).slice(0, 2),
    completed: 0,
    failed: 0,
  }));

  for (const ev of auditLog) {
    const idx = DAYS - 1 - Math.floor((now - new Date(ev.timestamp).getTime()) / DAY_MS);
    if (idx < 0 || idx >= DAYS) continue;
    if (ev.kind === "run_completed") buckets[idx].completed++;
    else if (ev.kind === "run_failed") buckets[idx].failed++;
  }

  const hasData = buckets.some((b) => b.completed > 0 || b.failed > 0);
  if (!hasData) return <ChartCard label="Daily Velocity"><NoData /></ChartCard>;

  const maxY = niceMax(Math.max(...buckets.flatMap((b) => [b.completed, b.failed]), 1));
  const ticks = mkTicks(maxY, Math.min(Math.floor(maxY), 4));
  const slotW = PW / DAYS;
  const barW = slotW * 0.28;
  const totalDone = buckets.reduce((s, b) => s + b.completed, 0);
  const xLabels = buckets.map((b, i) => ({ x: PAD.l + (i + 0.5) * slotW, label: b.label }));

  const tip: Tip = activeIdx !== null
    ? { sx: PAD.l + (activeIdx + 0.5) * slotW, sy: scY(Math.max(buckets[activeIdx].completed, buckets[activeIdx].failed), maxY), lines: [buckets[activeIdx].label, `Done: ${buckets[activeIdx].completed}`, `Failed: ${buckets[activeIdx].failed}`] }
    : null;

  const legend = (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: "oklch(from var(--success) l c h / 0.65)" }} />
      <span className="text-[9px] text-[var(--muted-foreground)]">done</span>
      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: "oklch(from var(--destructive) l c h / 0.65)" }} />
      <span className="text-[9px] text-[var(--muted-foreground)]">failed</span>
    </span>
  );

  return (
    <ChartCard label="Daily Velocity" stat={`${totalDone} done`} legend={legend}>
      <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`}
        onMouseLeave={() => setActiveIdx(null)} style={{ cursor: "crosshair" }}>
        <Axes ticks={ticks} maxY={maxY} fmt={String} xLabels={xLabels} />
        {buckets.map((b, i) => {
          const cx = PAD.l + (i + 0.5) * slotW;
          const cH = Math.max(b.completed > 0 ? 2 : 0, (b.completed / maxY) * PH);
          const fH = Math.max(b.failed > 0 ? 2 : 0, (b.failed / maxY) * PH);
          const dim = activeIdx !== null && activeIdx !== i;
          return (
            <g key={i}>
              <rect x={cx - slotW / 2} y={PAD.t} width={slotW} height={PH}
                fill="transparent" onMouseEnter={() => setActiveIdx(i)} />
              {cH > 0 && (
                <rect x={cx - barW - 1} y={PAD.t + PH - cH} width={barW} height={cH} rx="1.5"
                  opacity={dim ? 0.35 : 1}
                  fill="oklch(from var(--success) l c h / 0.65)" pointerEvents="none" />
              )}
              {fH > 0 && (
                <rect x={cx + 1} y={PAD.t + PH - fH} width={barW} height={fH} rx="1.5"
                  opacity={dim ? 0.35 : 1}
                  fill="oklch(from var(--destructive) l c h / 0.65)" pointerEvents="none" />
              )}
            </g>
          );
        })}
        <SvgTooltip tip={tip} />
      </svg>
    </ChartCard>
  );
};

// ── 4. Success Rate Trend — line chart ───────────────────────────────────────

const SuccessRateTrendChart = ({ results }: { results: StateSnapshot["results"] }) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const data = results.slice(-20);
  if (data.length < 2) return <ChartCard label="Success Rate"><NoData /></ChartCard>;

  const n = data.length;
  const rates = data.map((_, i) => {
    const w = data.slice(0, i + 1);
    return Math.round((w.filter((r) => r.status === "completed").length / w.length) * 100);
  });

  const ticks = [0, 25, 50, 75, 100];
  const pts = rates.map((v, i) => ({ x: scX(i, n), y: scY(v, 100), rate: v, issue: data[i].issue }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const current = rates.at(-1) ?? 0;
  const lineColor = current >= 80 ? "var(--success)" : current >= 50 ? "var(--warning)" : "var(--destructive)";
  const ref80Y = scY(80, 100);
  const colW = n > 1 ? PW / (n - 1) : PW;

  const trend: "up" | "down" | "flat" =
    rates.length >= 4
      ? rates.at(-1)! - rates[Math.floor(rates.length / 2)] > 5 ? "up"
      : rates.at(-1)! - rates[Math.floor(rates.length / 2)] < -5 ? "down" : "flat"
      : "flat";

  const tip: Tip = activeIdx !== null
    ? { sx: pts[activeIdx].x, sy: pts[activeIdx].y, lines: [`Run ${activeIdx + 1} · ${data[activeIdx].issue}`, `Rate: ${pts[activeIdx].rate}%`, `${data.slice(0, activeIdx + 1).filter((r) => r.status === "completed").length} / ${activeIdx + 1} runs`] }
    : null;

  return (
    <ChartCard label="Success Rate" stat={`${current}%`} trendNode={trendIcon(trend, false)}>
      <svg width="100%" height={SH} viewBox={`0 0 ${SW} ${SH}`}
        onMouseLeave={() => setActiveIdx(null)} style={{ cursor: "crosshair" }}>
        <Axes ticks={ticks} maxY={100} fmt={(v) => `${v}%`} xLabels={runXLabels(pts, n)} />
        <line x1={PAD.l} y1={ref80Y} x2={PAD.l + PW} y2={ref80Y}
          stroke={DIM} strokeWidth="1" strokeDasharray="4 2" opacity="0.45" />
        <text x={PAD.l + 3} y={ref80Y - 3} fontSize="7.5" fill={DIM} fontFamily={FONT} opacity="0.6">80%</text>
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y}
            r={activeIdx === i ? 4 : 2.5}
            fill={p.rate >= 80 ? "var(--success)" : p.rate >= 50 ? "var(--warning)" : "var(--destructive)"}
            opacity={activeIdx === i ? 1 : 0.8} />
        ))}
        {pts.map((p, i) => (
          <rect key={i}
            x={Math.max(PAD.l, p.x - colW / 2)} y={PAD.t}
            width={Math.min(colW, PAD.l + PW - Math.max(PAD.l, p.x - colW / 2))} height={PH}
            fill="transparent" onMouseEnter={() => setActiveIdx(i)} />
        ))}
        {activeIdx !== null && (
          <line x1={pts[activeIdx].x} y1={PAD.t} x2={pts[activeIdx].x} y2={PAD.t + PH}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="2 2" pointerEvents="none" />
        )}
        <SvgTooltip tip={tip} />
      </svg>
    </ChartCard>
  );
};

// ── MetricsPanel ──────────────────────────────────────────────────────────────

export const MetricsPanel = ({ state }: { state: StateSnapshot | null }) => (
  <section className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
    <TokenBurnChart results={state?.results ?? []} />
    <DurationChart results={state?.results ?? []} />
    <VelocityChart auditLog={state?.auditLog ?? []} />
    <SuccessRateTrendChart results={state?.results ?? []} />
  </section>
);

// ── LiveEventFeed ─────────────────────────────────────────────────────────────

export const LiveEventFeed = ({ issueId, state }: { issueId: string; state: StateSnapshot | null }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const run = state?.running.find((r) => r.issueId === issueId);
  const result = state?.results.find((r) => r.issueId === issueId);

  const items: string[] = run
    ? ([
        run.startedAt ? `Started at ${new Date(run.startedAt).toLocaleTimeString()}` : null,
        run.skillSequence?.length ? `Skills: ${run.skillSequence.join(" → ")}` : null,
        run.lastEvent || null,
      ].filter(Boolean) as string[])
    : (result?.events ?? []).slice(-12).map((e) => e.message ?? e.type);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items.length]);

  return (
    <div ref={scrollRef} className="max-h-[200px] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)]">
      {items.length === 0 ? (
        <p className="p-3 text-xs text-[var(--muted-foreground)]">Waiting for events…</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 p-2.5 text-xs leading-5">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${run && i === items.length - 1 ? "animate-pulse bg-[var(--info)]" : "bg-[var(--border)]"}`} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

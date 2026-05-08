import React from "react";
import { CheckCircle2, ChevronDown, Clock3, Cpu, Lock, PanelRightClose, ShieldCheck, Terminal, Wrench, XCircle, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
import type { BoardCard, StateSnapshot } from "../api";
import { addComment, approvePlan, rejectPlan, sendPlanFeedback, stopIssue } from "../api";
import { Badge, Button, Sheet, SheetClose, SheetTitle, cn } from "../ui";
import { ChangeLogVisual } from "./ChangeLogVisual";
import { LiveEventFeed } from "./MetricsPanel";
import { RichDiffViewer } from "./RichDiffViewer";
import { formatRelativeTime, formatTokenCount, formatDuration, statusTone } from "../hooks/useNorthstarState";
import { AUDIT_KIND_LABELS, AUDIT_KIND_TONE } from "../lib/constants";

interface Props {
  awaitingPlan: StateSnapshot["awaitingReview"][number] | undefined;
  card: BoardCard | null;
  state: StateSnapshot | null;
  onClose: () => void;
  onAction: (label: string, action: () => Promise<unknown>) => void;
}

export const IssueSheet = ({ awaitingPlan, card, state, onClose, onAction }: Props) => {
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
              <div className="plan-markdown prose">
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
                  <Badge key={dep} tone="bad">{dep}</Badge>
                ))}
              </div>
            </div>
          ) : null}

          {(card.runtimeStatus === "planning" || card.runtimeStatus === "implementation" || card.runtimeStatus === "execution" || card.runtimeStatus === "qa") ? (
            <div className="mb-5 border-t border-[var(--border)] pt-4">
              <h3 className="mb-2 mt-0 text-sm font-semibold">Live Activity</h3>
              <LiveEventFeed issueId={card.issueId} state={state} />
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

          {result && (result.events?.length ?? 0) > 0 ? (
            <div className="mb-5 border-t border-[var(--border)] pt-4">
              <h3 className="mb-2 mt-0 text-sm font-semibold">Change Summary</h3>
              <ChangeLogVisual result={result} />
            </div>
          ) : null}

          {result?.gateResults && result.gateResults.length > 0 ? (
            <div className="mb-5 border-t border-[var(--border)] pt-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck size={15} className="text-[var(--muted-foreground)]" />
                <h3 className="m-0 text-sm font-semibold">Quality Gates</h3>
              </div>
              <div className="grid gap-2">
                {result.gateResults.map((gr) => (
                  <div
                    key={gr.gate}
                    className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      {gr.status === "completed" ? (
                        <CheckCircle2 size={14} className="shrink-0 text-[var(--success,#22c55e)]" />
                      ) : (
                        <XCircle size={14} className="shrink-0 text-[var(--destructive,#ef4444)]" />
                      )}
                      <span className="text-sm font-medium capitalize">{gr.gate.replace(/_/g, " ")}</span>
                      <span className="ml-auto">
                        <Badge tone={gr.status === "completed" ? "good" : "bad"}>{gr.status}</Badge>
                      </span>
                    </div>
                    {gr.output ? (
                      <p className="m-0 mt-1.5 text-xs leading-5 text-[var(--muted-foreground)] line-clamp-3">{gr.output}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
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
            <div className="mb-5 border-t border-[var(--border)] pt-4">
              <h3 className="mb-2 mt-0 text-sm font-semibold">Plan Review</h3>
              {awaitingPlan?.planOutput ? (
                awaitingPlan.planOutput.includes("@@") ? (
                  <RichDiffViewer diff={awaitingPlan.planOutput} />
                ) : (
                  <div className="plan-markdown prose">
                    <ReactMarkdown>{awaitingPlan.planOutput}</ReactMarkdown>
                  </div>
                )
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">No plan output available yet.</p>
              )}
              <PlanReviewActions
                card={card}
                feedback={feedback}
                setFeedback={setFeedback}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                onAction={onAction}
              />
            </div>
          ) : null}

          {["planning", "implementation", "execution", "qa"].includes(card.runtimeStatus) ? (
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

// ── Telemetry Panel ───────────────────────────────────────────────────────────

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

// ── Plan Review Actions ───────────────────────────────────────────────────────

type ReviewMode = "approve" | "request_changes" | "reject";

const REVIEW_MODES: { mode: ReviewMode; label: string; placeholder: string; required: boolean }[] = [
  { mode: "approve",          label: "Approve Plan",     placeholder: "",                         required: false },
  { mode: "request_changes",  label: "Request Changes",  placeholder: "Describe the changes needed…", required: true  },
  { mode: "reject",           label: "Reject Plan",      placeholder: "Reason for rejection (optional)…", required: false },
];

const PlanReviewActions = ({
  card,
  feedback,
  setFeedback,
  rejectReason,
  setRejectReason,
  onAction
}: {
  card: BoardCard;
  feedback: string;
  setFeedback: (v: string) => void;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  onAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const [mode, setMode] = useState<ReviewMode>("approve");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const current = REVIEW_MODES.find((m) => m.mode === mode)!;
  const textValue = mode === "request_changes" ? feedback : rejectReason;
  const setText = mode === "request_changes" ? setFeedback : setRejectReason;
  const canSubmit = !current.required || textValue.trim().length > 0;

  const handleSubmit = () => {
    if (mode === "approve") {
      onAction(`Approved ${card.identifier}`, () => approvePlan(card));
    } else if (mode === "request_changes") {
      onAction(`Sent feedback for ${card.identifier}`, () => sendPlanFeedback(card, feedback));
    } else {
      onAction(`Rejected ${card.identifier}`, () => rejectPlan(card, rejectReason));
    }
  };

  // Close dropdown on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  return (
    <div className="mt-4 grid gap-2">
      {mode !== "approve" ? (
        <textarea
          aria-label={current.placeholder}
          value={textValue}
          onChange={(e) => setText(e.target.value)}
          placeholder={current.placeholder}
          className="min-h-24 w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] p-3 text-sm outline-none focus-ring"
        />
      ) : null}

      <div className="flex">
        <Button
          variant={mode === "reject" ? "danger" : mode === "approve" ? "default" : "secondary"}
          className="flex-1 rounded-r-none border-r-0"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {current.label}
        </Button>
        <div className="relative" ref={dropdownRef}>
          <button
            aria-label="Switch review action"
            className={cn(
              "flex h-full min-h-10 items-center justify-center rounded-l-none rounded-r-[var(--radius)] border px-2.5 transition-colors",
              mode === "reject"
                ? "border-[var(--destructive)] bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90"
                : mode === "approve"
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90"
                : "border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-[var(--accent)]"
            )}
            onClick={() => setDropdownOpen((v) => !v)}
          >
            <ChevronDown size={14} className={cn("transition-transform", dropdownOpen && "rotate-180")} />
          </button>
          {dropdownOpen ? (
            <div className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--popover)] p-1 shadow-[var(--shadow)]">
              {REVIEW_MODES.filter((m) => m.mode !== mode).map((m) => (
                <button
                  key={m.mode}
                  className="flex w-full items-center rounded-[calc(var(--radius)-4px)] px-3 py-2 text-left text-sm text-[var(--popover-foreground)] transition-colors hover:bg-[var(--accent)]"
                  onClick={() => { setMode(m.mode); setDropdownOpen(false); }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};


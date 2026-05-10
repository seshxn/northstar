import React from "react";
import { Clock3, Cpu, Lock, PanelRightClose, Terminal, Wrench, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useState } from "react";
import type { BoardCard, StateSnapshot } from "../api";
import { addComment, approvePlan, rejectPlan, sendPlanFeedback, stopIssue } from "../api";
import { Badge, Button, Sheet, SheetClose, SheetTitle } from "../ui";
import { ChangeLogVisual } from "./ChangeLogVisual";
import { FullAgentTerminal } from "./AgentTerminal";
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

          {(card.runtimeStatus === "planning" || card.runtimeStatus === "implementation" || card.runtimeStatus === "execution") ? (
            <div className="mb-5 border-t border-[var(--border)] pt-4">
              <h3 className="mb-2 mt-0 text-sm font-semibold">Agent Brain — Live</h3>
              <FullAgentTerminal issueId={card.issueId} issue={card.identifier} state={state} />
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
            <div className="grid gap-2">
              <code className="font-mono-geist rounded-[calc(var(--radius)-4px)] bg-[var(--background)] px-2 py-1 text-xs">
                {card.workspacePath || "Not assigned"}
              </code>
              {card.branchName ? (
                <code className="font-mono-geist rounded-[calc(var(--radius)-4px)] bg-[var(--background)] px-2 py-1 text-xs">
                  {card.branchName}
                </code>
              ) : null}
            </div>
          </div>

          {card.runtimeStatus === "awaiting_review" ? (
            <div className="mb-5 grid gap-2 border-t border-[var(--border)] pt-4">
              <h3 className="mb-0 mt-0 text-sm font-semibold">Plan Review</h3>
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

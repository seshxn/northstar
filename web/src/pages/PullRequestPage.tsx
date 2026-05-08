import React, { useState } from "react";
import { ExternalLink, GitMerge, GitPullRequest, GitPullRequestClosed, Lock } from "lucide-react";
import type { BoardCard, BoardSnapshot, StateSnapshot } from "../api";
import { createPullRequest, retryIssue } from "../api";
import { Badge, Button, Card, Dialog, Input, cn } from "../ui";

// ── PR Creation Dialog ────────────────────────────────────────────────────────

const CreatePRDialog = ({
  card,
  open,
  onOpenChange,
  onCardAction
}: {
  card: BoardCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const [head, setHead] = useState("");
  const [base, setBase] = useState("");

  const handleCreate = () => {
    if (!card || !head.trim()) return;
    onCardAction(`Creating PR for ${card.identifier}`, () =>
      createPullRequest(card.issueId, head.trim(), base.trim() || undefined)
    );
    onOpenChange(false);
    setHead("");
    setBase("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Create PR — ${card?.identifier ?? ""}`}>
      <p className="mb-4 text-sm text-[var(--muted-foreground)]">{card?.title}</p>
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <label className="text-sm font-semibold">
            Head branch <span className="text-[var(--destructive)]">*</span>
          </label>
          <Input
            autoFocus
            value={head}
            onChange={(e) => setHead(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="feature/my-branch"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-semibold">
            Base branch{" "}
            <span className="text-xs font-normal text-[var(--muted-foreground)]">(optional)</span>
          </label>
          <Input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="main"
          />
        </div>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!head.trim()} onClick={handleCreate}>
            <GitPullRequest size={15} /> Create PR
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const prStateIcon = (state: string) => {
  if (state === "merged") return <GitMerge size={14} className="text-[oklch(0.7_0.2_290)]" />;
  if (state === "closed") return <GitPullRequestClosed size={14} className="text-[var(--destructive)]" />;
  return <GitPullRequest size={14} className="text-[var(--success)]" />;
};

const prStateTone = (state: string): "good" | "bad" | "neutral" => {
  if (state === "open") return "good";
  if (state === "closed") return "bad";
  return "neutral";
};

// ── Active PR card ────────────────────────────────────────────────────────────

const ActivePRCard = ({ card }: { card: BoardCard }) => {
  const pr = card.pr!;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2">
        {prStateIcon(pr.state)}
        <strong className="text-sm">{card.identifier}</strong>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{card.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={prStateTone(pr.state)}>{pr.state}</Badge>
          <span className="text-xs text-[var(--muted-foreground)]">#{pr.number}</span>
          {card.labels.slice(0, 3).map((l) => (
            <Badge key={l}>{l}</Badge>
          ))}
        </div>
      </div>
      {pr.url ? (
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
        >
          <ExternalLink size={14} /> View
        </a>
      ) : null}
    </div>
  );
};

// ── Candidate card ────────────────────────────────────────────────────────────

const CandidateCard = ({
  card,
  onOpen
}: {
  card: BoardCard;
  onOpen: (card: BoardCard) => void;
}) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0">
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2">
        <strong className="text-sm">{card.identifier}</strong>
        {card.detectedDependencies.length > 0 ? (
          <Badge tone="blocked">
            <Lock size={10} /> Blocked
          </Badge>
        ) : null}
      </div>
      <p className="mb-2 truncate text-sm text-[var(--muted-foreground)]">{card.title}</p>
      {card.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {card.labels.slice(0, 4).map((l) => (
            <Badge key={l}>{l}</Badge>
          ))}
          {card.labels.length > 4 ? <Badge>+{card.labels.length - 4}</Badge> : null}
        </div>
      ) : null}
    </div>
    <Button
      variant="secondary"
      className={cn(card.detectedDependencies.length > 0 && "opacity-60")}
      onClick={() => onOpen(card)}
    >
      <GitPullRequest size={15} /> Create PR
    </Button>
  </div>
);

// ── Page ──────────────────────────────────────────────────────────────────────

export const PullRequestPage = ({
  board,
  state,
  onCardAction
}: {
  board: BoardSnapshot;
  state: StateSnapshot | null;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const [dialogCard, setDialogCard] = useState<BoardCard | null>(null);

  const completed = board.columns
    .flatMap((col) => col.cards)
    .filter((c) => c.runtimeStatus === "completed" || c.state.toLowerCase().includes("done"));

  const activePRs = completed.filter((c) => c.pr !== null);
  const candidates = completed.filter((c) => c.pr === null);
  const needsRetry = (state?.results ?? []).filter((r) => r.status !== "completed").slice(-6).reverse();

  return (
    <>
      <CreatePRDialog
        card={dialogCard}
        open={dialogCard !== null}
        onOpenChange={(open) => {
          if (!open) setDialogCard(null);
        }}
        onCardAction={onCardAction}
      />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        <Card className="p-4 shadow-[var(--shadow)]">
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--success)] opacity-50" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[var(--success)]" />
            </span>
            <h2 className="m-0 text-base font-semibold">Active PRs</h2>
            {activePRs.length > 0 ? <Badge tone="good">{activePRs.length}</Badge> : null}
          </div>
          {activePRs.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No open pull requests</p>
          ) : (
            activePRs.map((card) => <ActivePRCard key={card.issueId} card={card} />)
          )}
        </Card>

        <Card className="p-4 shadow-[var(--shadow)]">
          <div className="mb-3 flex items-center gap-2">
            <GitPullRequest size={16} className="text-[var(--muted-foreground)]" />
            <h2 className="m-0 text-base font-semibold">Candidates</h2>
            {candidates.length > 0 ? <Badge>{candidates.length}</Badge> : null}
          </div>
          {candidates.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No PR-ready tickets</p>
          ) : (
            candidates.map((card) => (
              <CandidateCard key={card.issueId} card={card} onOpen={setDialogCard} />
            ))
          )}
        </Card>

        {needsRetry.length > 0 ? (
          <Card className="p-4 shadow-[var(--shadow)]">
            <h2 className="mb-3 mt-0 text-base font-semibold text-[var(--destructive)]">Needs Retry</h2>
            {needsRetry.map((result) => (
              <div
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--border)] py-3 first:border-t-0 first:pt-0 last:pb-0"
                key={result.issueId}
              >
                <strong className="text-sm">{result.issue}</strong>
                <Badge tone="bad">{result.status}</Badge>
                <Button
                  variant="secondary"
                  onClick={() => onCardAction(`Retried ${result.issue}`, () => retryIssue(result.issueId))}
                >
                  Retry
                </Button>
              </div>
            ))}
          </Card>
        ) : null}
      </section>
    </>
  );
};

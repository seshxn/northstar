import React, { useMemo, useState } from "react";
import { GitPullRequest } from "lucide-react";
import type { BoardCard, BoardSnapshot, CreatePullRequestPayload, StateSnapshot } from "../api";
import { createPullRequest, retryIssue } from "../api";
import { Button, Card, Input } from "../ui";

export const PullRequestPage = ({
  board,
  state,
  onCardAction
}: {
  board: BoardSnapshot;
  state: StateSnapshot | null;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const cards = board.columns
    .flatMap((col) => col.cards)
    .filter((c) => c.runtimeStatus === "completed" || c.state.toLowerCase().includes("done"));
  const activeCard = useMemo(() => cards.find((card) => card.issueId === activeIssueId) ?? null, [activeIssueId, cards]);
  const activeResult = useMemo(
    () => (activeCard ? state?.results.find((result) => result.issueId === activeCard.issueId || result.issue === activeCard.identifier) ?? null : null),
    [activeCard, state]
  );
  return (
    <section className="grid grid-cols-[minmax(320px,0.95fr)_minmax(360px,1.05fr)] gap-4 max-[900px]:grid-cols-1">
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
            {card.pr ? (
              <Button variant="secondary" onClick={() => window.open(card.pr?.url, "_blank", "noopener,noreferrer")}>
                <GitPullRequest size={15} /> PR #{card.pr.number}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveIssueId(card.issueId);
                }}
              >
                <GitPullRequest size={15} /> Prepare
              </Button>
            )}
          </div>
        ))}
      </Card>
      <PullRequestForm
        card={activeCard}
        resultOutput={activeResult?.output ?? ""}
        onSubmit={(payload) => {
          if (!activeCard) return;
          onCardAction(`Creating PR for ${activeCard.identifier}`, async () => {
            await createPullRequest(activeCard.issueId, payload);
            setActiveIssueId(null);
          });
        }}
      />
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

const PullRequestForm = ({
  card,
  resultOutput,
  onSubmit
}: {
  card: BoardCard | null;
  resultOutput: string;
  onSubmit: (payload: CreatePullRequestPayload) => void;
}) => {
  const initial = useMemo(() => initialPullRequestForm(card, resultOutput), [card, resultOutput]);
  const [form, setForm] = useState(initial);

  React.useEffect(() => {
    setForm(initial);
  }, [initial]);

  return (
    <Card className="p-4 shadow-[var(--shadow)]">
      <h2 className="mb-3 mt-0 text-base font-semibold">Prepare Pull Request</h2>
      {!card ? (
        <p className="text-sm text-[var(--muted-foreground)]">Select a PR candidate to review branch and metadata before publishing.</p>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({
              head: form.head.trim() || undefined,
              base: form.base.trim() || undefined,
              title: form.title.trim() || undefined,
              body: form.body,
              draft: form.draft,
              labels: splitList(form.labels),
              reviewers: splitList(form.reviewers)
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
            <label className="grid gap-1.5 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Head branch
              <Input value={form.head} onChange={(event) => setForm((prev) => ({ ...prev, head: event.target.value }))} placeholder="feature/issue" />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Base branch
              <Input value={form.base} onChange={(event) => setForm((prev) => ({ ...prev, base: event.target.value }))} placeholder="main" />
            </label>
          </div>
          <label className="grid gap-1.5 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Title
            <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Body
            <textarea
              className="min-h-[180px] w-full resize-y rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm normal-case text-[var(--foreground)] outline-none transition-all duration-150 ease-in-out placeholder:text-[var(--muted-foreground)] focus-ring"
              value={form.body}
              onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
            <label className="grid gap-1.5 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Labels
              <Input value={form.labels} onChange={(event) => setForm((prev) => ({ ...prev, labels: event.target.value }))} placeholder="bug, frontend" />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Reviewers
              <Input value={form.reviewers} onChange={(event) => setForm((prev) => ({ ...prev, reviewers: event.target.value }))} placeholder="octocat, team/devs" />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input
              checked={form.draft}
              className="size-4"
              onChange={(event) => setForm((prev) => ({ ...prev, draft: event.target.checked }))}
              type="checkbox"
            />
            Draft PR
          </label>
          <Button disabled={!form.head.trim() && !card.branchName} type="submit">
            <GitPullRequest size={15} /> Create PR
          </Button>
        </form>
      )}
    </Card>
  );
};

const initialPullRequestForm = (card: BoardCard | null, resultOutput: string) => ({
  head: card?.branchName ?? "",
  base: card?.baseBranch ?? "",
  title: card ? `${card.identifier}: ${card.title}` : "",
  body: resultOutput || (card ? `Implements ${card.identifier}.` : ""),
  labels: "",
  reviewers: "",
  draft: true
});

const splitList = (value: string): string[] | undefined => {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
};

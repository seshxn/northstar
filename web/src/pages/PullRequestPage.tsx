import React from "react";
import { GitPullRequest } from "lucide-react";
import type { BoardSnapshot, StateSnapshot } from "../api";
import { createPullRequest, retryIssue } from "../api";
import { Button, Card } from "../ui";

export const PullRequestPage = ({
  board,
  state,
  onCardAction
}: {
  board: BoardSnapshot;
  state: StateSnapshot | null;
  onCardAction: (label: string, action: () => Promise<unknown>) => void;
}) => {
  const cards = board.columns
    .flatMap((col) => col.cards)
    .filter((c) => c.runtimeStatus === "completed" || c.state.toLowerCase().includes("done"));
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
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
            <Button
              variant="secondary"
              onClick={() => {
                const head = window.prompt(`Branch for ${card.identifier}`);
                if (head) onCardAction(`Creating PR for ${card.identifier}`, () => createPullRequest(card.issueId, head));
              }}
            >
              <GitPullRequest size={15} /> Create PR
            </Button>
          </div>
        ))}
      </Card>
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

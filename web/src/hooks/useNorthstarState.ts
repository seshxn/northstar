import { useEffect, useRef, useState } from "react";
import {
  type BoardCard, type BoardColumn, type BoardSnapshot, type SettingsSnapshot, type StateSnapshot,
  fetchBoard, fetchSettings, fetchState, refreshService,
} from "../api";
import { useToast } from "../ui";

export interface NorthstarState {
  board: BoardSnapshot | null;
  state: StateSnapshot | null;
  settings: SettingsSnapshot | null;
  selectedCard: BoardCard | null;
  setSelectedCard: (card: BoardCard | null) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  loading: boolean;
  refreshing: boolean;
  filteredBoard: (query: string) => BoardSnapshot | null;
  refresh: () => Promise<void>;
  handleRefresh: () => Promise<void>;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
  optimisticMoveCard: (cardId: string, targetColumnId: string) => void;
  setDragging: (dragging: boolean) => void;
}

export function useNorthstarState(): NorthstarState {
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const selectedCardRef = useRef<BoardCard | null>(null);
  selectedCardRef.current = selectedCard;
  const draggingRef = useRef(false);

  const { push } = useToast();

  const refresh = async (): Promise<void> => {
    const [nextBoard, nextState, nextSettings] = await Promise.all([
      fetchBoard(),
      fetchState(),
      fetchSettings(),
    ]);
    setBoard(nextBoard);
    setState(nextState);
    setSettings(nextSettings);
    setLoading(false);

    const current = selectedCardRef.current;
    if (current) {
      setSelectedCard(
        nextBoard.columns.flatMap(col => col.cards).find(c => c.issueId === current.issueId) ?? null
      );
    }
  };

  useEffect(() => {
    refresh().catch(err => {
      setLoading(false);
      push({ title: "Unable to load Northstar", description: messageForError(err), tone: "error" });
    });
    const interval = setInterval(() => {
      if (!draggingRef.current) refresh().catch(() => undefined);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await refreshService();
    await refresh();
    setRefreshing(false);
  };

  const runAction = async (label: string, action: () => Promise<unknown>): Promise<void> => {
    try {
      await action();
      await refresh();
      push({ title: label });
    } catch (err) {
      push({ title: "Action failed", description: messageForError(err), tone: "error" });
    }
  };

  const filteredBoard = (query: string): BoardSnapshot | null => filterBoard(board, query);

  const optimisticMoveCard = (cardId: string, targetColumnId: string): void => {
    setBoard(prev => prev ? moveCardOptimistically(prev, cardId, targetColumnId) : prev);
  };

  const setDragging = (dragging: boolean): void => {
    draggingRef.current = dragging;
  };

  return {
    board,
    state,
    settings,
    selectedCard,
    setSelectedCard,
    selectedIds,
    setSelectedIds,
    loading,
    refreshing,
    filteredBoard,
    refresh,
    handleRefresh,
    runAction,
    optimisticMoveCard,
    setDragging,
  };
}

const messageForError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const filterBoard = (board: BoardSnapshot | null, query: string): BoardSnapshot | null => {
  if (!board || query.trim() === "") return board;
  const needle = query.toLowerCase();
  return {
    ...board,
    columns: board.columns.map(col => ({
      ...col,
      cards: col.cards.filter(card =>
        [card.identifier, card.title, card.state, card.runtimeStatus, ...card.labels]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      ),
    })),
  };
};

export const moveCardOptimistically = (
  board: BoardSnapshot,
  cardId: string,
  targetColumnId: string
): BoardSnapshot => {
  let movedCard: BoardCard | undefined;
  const columns = board.columns.map(col => ({
    ...col,
    cards: col.cards.filter(card => {
      if (card.issueId === cardId) {
        movedCard = card;
        return false;
      }
      return true;
    }),
  }));
  if (!movedCard) return board;
  return {
    ...board,
    columns: columns.map(col =>
      col.id === targetColumnId ? { ...col, cards: [...col.cards, movedCard!] } : col
    ),
  };
};

export const columnForDrop = (columns: BoardColumn[], overId: string): BoardColumn | null =>
  columns.find(col => col.id === overId) ??
  columns.find(col => col.cards.some(card => card.issueId === overId)) ??
  null;

export const toggleSelected = (
  current: Set<string>,
  issueId: string,
  checked: boolean
): Set<string> => {
  const next = new Set(current);
  if (checked) next.add(issueId);
  else next.delete(issueId);
  return next;
};

export const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export const formatDuration = (ms: number): string => {
  if (ms >= 60_000)
    return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.round(ms / 1_000)}s`;
};

export const formatRelativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
};

export const statusTone = (
  status: BoardCard["runtimeStatus"]
): "neutral" | "good" | "warn" | "bad" | "info" => {
  if (status === "completed") return "good";
  if (status === "failed" || status === "stalled") return "bad";
  if (status === "retrying" || status === "awaiting_review") return "warn";
  if (status === "planning" || status === "implementation" || status === "execution") return "info";
  return "neutral";
};

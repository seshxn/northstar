import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect } from "react";
import type { BoardCard, BoardSnapshot } from "../api";
import { cn } from "../ui";

// ── Status colours ───────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  running:         "oklch(0.602 0.168 250.6)",
  planning:        "oklch(0.602 0.168 250.6)",
  implementation:  "oklch(0.602 0.168 250.6)",
  execution:       "oklch(0.602 0.168 250.6)",
  awaiting_review: "oklch(0.795 0.152 66.29)",
  retrying:        "oklch(0.795 0.152 66.29)",
  completed:       "oklch(0.723 0.17 152.1)",
  failed:          "oklch(0.704 0.191 22.216)",
  stalled:         "oklch(0.704 0.191 22.216)",
  idle:            "oklch(0.4 0 0)",
};

const isActive = (status: string) =>
  ["planning", "implementation", "execution"].includes(status);

// ── Custom node ──────────────────────────────────────────────────────────────

interface CardNodeData {
  card: BoardCard;
  onSelect: (card: BoardCard) => void;
}

const CardNode = ({ data }: NodeProps) => {
  const { card, onSelect } = data as unknown as CardNodeData;
  const color = STATUS_COLOR[card.runtimeStatus] ?? STATUS_COLOR.idle;
  const active = isActive(card.runtimeStatus);

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: color, border: "none", width: 8, height: 8 }} />
      <div
        className={cn(
          "rounded-xl border-2 bg-[var(--card)] p-3 shadow-lg cursor-pointer transition-all duration-300 min-w-[160px] max-w-[220px]",
          active && "animate-node-glow"
        )}
        style={{ borderColor: color }}
        onClick={() => onSelect(card)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onSelect(card)}
      >
        {/* Status dot + identifier */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={cn("size-2.5 rounded-full shrink-0", active && "animate-pulse")}
            style={{ background: color }}
          />
          <span className="text-[11px] font-bold text-[var(--muted-foreground)]">{card.identifier}</span>
        </div>
        {/* Title */}
        <p className="text-xs font-semibold leading-snug line-clamp-2 text-[var(--foreground)] mb-1.5">{card.title}</p>
        {/* Status badge */}
        <span
          className="inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
          style={{ background: color }}
        >
          {card.runtimeStatus.replace("_", " ")}
        </span>
        {card.detectedDependencies.length > 0 && (
          <div className="mt-1.5 text-[9px] text-[var(--destructive)] font-semibold">
            ⚠ {card.detectedDependencies.length} blocked
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: color, border: "none", width: 8, height: 8 }} />
    </>
  );
};

const nodeTypes = { card: CardNode };

// ── Layout: simple grid with dependency-driven layering ──────────────────────

const layoutNodes = (cards: BoardCard[]): Array<Node> => {
  const COLS = Math.ceil(Math.sqrt(cards.length));
  const X_GAP = 260;
  const Y_GAP = 160;

  return cards.map((card, i) => ({
    id: card.issueId,
    type: "card",
    position: { x: (i % COLS) * X_GAP, y: Math.floor(i / COLS) * Y_GAP },
    data: { card },
  }));
};

const buildEdges = (cards: BoardCard[]): Edge[] => {
  const edges: Edge[] = [];
  const idMap = new Map(cards.map((c) => [c.identifier, c.issueId]));

  for (const card of cards) {
    for (const dep of card.detectedDependencies) {
      const sourceId = idMap.get(dep);
      if (sourceId && sourceId !== card.issueId) {
        edges.push({
          id: `${sourceId}->${card.issueId}`,
          source: sourceId,
          target: card.issueId,
          animated: isActive(card.runtimeStatus),
          style: { stroke: "oklch(0.704 0.191 22.216)", strokeWidth: 2 },
          label: "blocks",
          labelStyle: { fill: "oklch(0.704 0.191 22.216)", fontSize: 10, fontWeight: 600 },
          labelBgStyle: { fill: "var(--card)" },
        });
      }
    }
  }
  return edges;
};

// ── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  board: BoardSnapshot | null;
  onSelectCard: (card: BoardCard) => void;
}

export const TopologyPage = ({ board, onSelectCard }: Props) => {
  const cards = board?.columns.flatMap((c) => c.cards) ?? [];

  const initialNodes = layoutNodes(cards).map((n) => ({
    ...n,
    data: { ...(n.data as object), onSelect: onSelectCard },
  }));
  const initialEdges = buildEdges(cards);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    const fresh = layoutNodes(cards).map((n) => ({
      ...n,
      data: { ...(n.data as object), onSelect: onSelectCard },
    }));
    setNodes(fresh);
    setEdges(buildEdges(cards));
  }, [board]);

  if (!board) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-[var(--muted-foreground)]">
        Connecting to Northstar…
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-[var(--muted-foreground)]">
        No issues to display — the board is empty.
      </div>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <Legend />
      </div>
      <div className="topology-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="oklch(from var(--border) l c h / 0.6)" variant={BackgroundVariant.Dots} gap={24} size={1} />
          <Controls
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
          />
          <MiniMap
            nodeColor={(node) => {
              const card = (node.data as unknown as CardNodeData).card;
              return STATUS_COLOR[card.runtimeStatus] ?? STATUS_COLOR.idle;
            }}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
            }}
            maskColor="oklch(from var(--background) l c h / 0.7)"
          />
        </ReactFlow>
      </div>
    </section>
  );
};

const LEGEND_ITEMS = [
  { label: "Running", color: STATUS_COLOR.planning },
  { label: "Awaiting Review", color: STATUS_COLOR.awaiting_review },
  { label: "Completed", color: STATUS_COLOR.completed },
  { label: "Failed", color: STATUS_COLOR.failed },
  { label: "Idle", color: STATUS_COLOR.idle },
];

const Legend = () => (
  <div className="flex flex-wrap items-center gap-3">
    {LEGEND_ITEMS.map(({ label, color }) => (
      <span key={label} className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
    ))}
    <span className="ml-2 text-xs text-[var(--muted-foreground)] italic">
      Red edges = detected dependencies · Click node to inspect
    </span>
  </div>
);

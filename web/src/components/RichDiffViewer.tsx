import React from "react";

interface Props {
  diff: string;
}

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  const result: DiffLine[] = [];
  let oldLineNo = 0;
  let newLineNo = 0;
  let hasHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      hasHunk = true;
      // Parse hunk header: @@ -a,b +c,d @@
      const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNo = parseInt(match[1], 10);
        newLineNo = parseInt(match[2], 10);
      }
      result.push({ type: "header", content: line, oldLineNo: null, newLineNo: null });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", content: line.slice(1), oldLineNo: null, newLineNo: newLineNo++ });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "remove", content: line.slice(1), oldLineNo: oldLineNo++, newLineNo: null });
    } else if (line.startsWith(" ") || (hasHunk && line !== "" && !line.startsWith("\\") && !line.startsWith("---") && !line.startsWith("+++"))) {
      result.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line, oldLineNo: oldLineNo++, newLineNo: newLineNo++ });
    }
  }

  return result;
}

const BG: Record<DiffLine["type"], string> = {
  add: "oklch(0.627 0.179 152.1 / 0.12)",
  remove: "oklch(0.577 0.245 27.325 / 0.12)",
  context: "transparent",
  header: "oklch(0.546 0.198 249.62 / 0.08)",
};

const LINE_NUM_STYLE: React.CSSProperties = {
  minWidth: 36,
  paddingRight: 8,
  paddingLeft: 8,
  textAlign: "right",
  color: "var(--muted-foreground)",
  userSelect: "none",
  fontSize: 11,
  opacity: 0.7,
};

const CODE_STYLE: React.CSSProperties = {
  flex: 1,
  fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  padding: "0 8px",
};

export const RichDiffViewer = ({ diff }: Props) => {
  if (!diff || !diff.includes("@@")) {
    return (
      <div
        style={{
          padding: "16px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          color: "var(--muted-foreground)",
          fontSize: 13,
          fontStyle: "italic",
        }}
      >
        No valid unified diff to display.
      </div>
    );
  }

  const lines = parseDiff(diff);

  return (
    <div
      style={{
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        overflow: "hidden",
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {lines.map((line, i) => {
        if (line.type === "header") {
          return (
            <div
              key={i}
              style={{
                background: BG.header,
                color: "var(--muted-foreground)",
                fontFamily: '"Geist Mono", ui-monospace, monospace',
                fontSize: 11,
                padding: "2px 12px",
                borderTop: i !== 0 ? "1px solid var(--border)" : undefined,
              }}
            >
              {line.content}
            </div>
          );
        }

        return (
          <div
            key={i}
            style={{
              display: "flex",
              background: BG[line.type],
              borderTop: "1px solid var(--border)",
            }}
          >
            {/* Old line number */}
            <span style={LINE_NUM_STYLE}>{line.oldLineNo ?? ""}</span>
            {/* New line number */}
            <span style={{ ...LINE_NUM_STYLE, borderRight: "1px solid var(--border)" }}>{line.newLineNo ?? ""}</span>
            {/* Gutter symbol */}
            <span
              style={{
                width: 20,
                textAlign: "center",
                color:
                  line.type === "add"
                    ? "var(--success)"
                    : line.type === "remove"
                    ? "var(--destructive)"
                    : "transparent",
                fontWeight: 700,
                fontSize: 13,
                lineHeight: "inherit",
              }}
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <code style={CODE_STYLE}>{line.content}</code>
          </div>
        );
      })}
    </div>
  );
};

RichDiffViewer.displayName = "RichDiffViewer";

import type { RuntimeEvent } from "../types.js";

export const normalizeCodexEvent = (raw: unknown): RuntimeEvent => {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    type: typeof record.type === "string" ? record.type : "codex_event",
    timestamp: new Date().toISOString(),
    message: typeof record.message === "string" ? record.message : undefined,
    data: record
  };
};

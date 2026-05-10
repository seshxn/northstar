import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NorthstarStore, PersistedNorthstarSnapshot } from "./store.js";

export class JsonNorthstarStore implements NorthstarStore {
  constructor(private readonly path: string) {}

  async loadSnapshot(): Promise<PersistedNorthstarSnapshot | null> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedSnapshot(parsed)) throw new Error(`Northstar state file is malformed: ${this.path}`);
    return parsed;
  }

  async saveSnapshot(snapshot: PersistedNorthstarSnapshot): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`);
    await rename(tmp, this.path);
  }
}

const isNotFound = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");

const isPersistedSnapshot = (value: unknown): value is PersistedNorthstarSnapshot => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.auditLog) &&
    typeof record.auditSeq === "number" &&
    record.tokenTotals !== null &&
    typeof record.tokenTotals === "object" &&
    Array.isArray(record.completed) &&
    Array.isArray(record.results) &&
    Array.isArray(record.retryAttempts) &&
    Array.isArray(record.awaitingReview) &&
    Array.isArray(record.detectedDependencies) &&
    Array.isArray(record.pullRequests)
  );
};

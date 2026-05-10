import { describe, expect, test } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonNorthstarStore } from "../../src/storage/json-store.js";

describe("northstar JSON storage", () => {
  test("persists and reloads operator state snapshots", async () => {
    const dir = await mkdtemp(join(tmpdir(), "northstar-storage-"));
    const store = new JsonNorthstarStore(join(dir, "state.json"));

    await store.saveSnapshot({
      auditLog: [
        {
          id: 1,
          timestamp: "2026-05-10T00:00:00.000Z",
          kind: "run_completed",
          message: "done"
        }
      ],
      auditSeq: 1,
      tokenTotals: { input: 1, output: 2, total: 3 },
      completed: ["SYM-1"],
      results: [],
      retryAttempts: [],
      awaitingReview: [],
      detectedDependencies: [],
      pullRequests: []
    });

    await expect(store.loadSnapshot()).resolves.toMatchObject({
      auditLog: [{ id: 1, kind: "run_completed" }],
      tokenTotals: { input: 1, output: 2, total: 3 },
      completed: ["SYM-1"]
    });
  });
});

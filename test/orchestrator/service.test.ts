import { afterEach, describe, expect, test, vi } from "vitest";
import { OrchestratorService } from "../../src/orchestrator/service.js";

describe("orchestrator service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("ticks immediately and then on the configured interval", async () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => undefined);
    const service = new OrchestratorService({
      state: { pollIntervalMs: 25 },
      tick
    });

    await service.start();
    expect(tick).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(25);
    expect(tick).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(25);
    expect(tick).toHaveBeenCalledTimes(3);

    await service.stop();
    await vi.advanceTimersByTimeAsync(50);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  test("serializes manual refreshes through the orchestrator", async () => {
    const calls: string[] = [];
    const tick = vi.fn(async () => {
      calls.push("start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      calls.push("end");
    });
    const service = new OrchestratorService({
      state: { pollIntervalMs: 1000 },
      tick
    });

    await Promise.all([service.refresh(), service.refresh()]);

    expect(tick).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["start", "end", "start", "end"]);
  });
});

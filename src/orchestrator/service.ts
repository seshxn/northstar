import type { OrchestratorState } from "./state.js";

export interface TickableOrchestrator {
  readonly state: Pick<OrchestratorState, "pollIntervalMs">;
  tick(): Promise<unknown>;
  waitForIdle?(): Promise<void>;
  stopAll?(): Promise<void>;
}

export class OrchestratorService {
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly orchestrator: TickableOrchestrator) {}

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.refresh();
    this.schedule();
  }

  async refresh(): Promise<void> {
    const next = this.queue.then(async () => {
      await this.orchestrator.tick();
    }, async () => {
      await this.orchestrator.tick();
    });
    this.queue = next.catch(() => undefined);
    await next;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.orchestrator.stopAll?.();
    await this.orchestrator.waitForIdle?.();
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      try {
        await this.refresh();
      } finally {
        this.schedule();
      }
    }, this.orchestrator.state.pollIntervalMs);
  }
}

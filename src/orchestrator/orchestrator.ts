import type { NorthstarConfig } from "../workflow/schema.js";
import type { Tracker } from "../tracker/types.js";
import type { Runtime } from "../runtime/types.js";
import { createInitialState, type OrchestratorState } from "./state.js";
import { dispatchCandidates } from "./tick.js";

export class Orchestrator {
  readonly state: OrchestratorState;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: NorthstarConfig,
    private readonly tracker: Tracker,
    private readonly runtime: Runtime
  ) {
    this.state = createInitialState({
      pollIntervalMs: config.polling.interval_ms,
      maxConcurrentAgents: config.agent.max_concurrent_agents,
      activeStates: config.tracker.active_states,
      terminalStates: config.tracker.terminal_states,
      maxConcurrentAgentsByState: config.agent.max_concurrent_agents_by_state
    });
  }

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  tick(): Promise<OrchestratorState> {
    return this.enqueue(async () => {
      const issues = await this.tracker.fetchCandidateIssues();
      await dispatchCandidates({
        state: this.state,
        issues,
        startRun: async (issue) => {
          const session = await this.runtime.startSession({ issue, workspacePath: "", tools: [] });
          return { threadId: session.threadId, stop: () => session.stop() };
        }
      });
      return this.state;
    });
  }
}

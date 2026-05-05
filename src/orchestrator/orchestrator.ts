import type { NorthstarConfig } from "../workflow/schema.js";
import type { Tracker } from "../tracker/types.js";
import type { Runtime, RuntimeEvent, TurnResult } from "../runtime/types.js";
import { createInitialState, type OrchestratorState } from "./state.js";
import { dispatchCandidates, type StartedRun } from "./tick.js";
import { WorkspaceManager } from "../workspace/manager.js";
import { buildTools } from "../tools/registry.js";
import { renderPrompt } from "../workflow/prompt.js";
import { reconcileRunningIssues, restartStalledIssues } from "./reconcile.js";
import { retryDelayMs } from "./retry.js";
import type { Issue } from "../tracker/issue.js";
import { assembleIssueContext } from "../context/assembler.js";
import { renderSkillInstructions, skillSequenceForIssue } from "../skills/profile.js";
import { filterToolsForIssue } from "../policy/tools.js";
import { qualityGateSequenceForIssue, renderQualityGatePrompt } from "../quality/gates.js";

export class Orchestrator {
  readonly state: OrchestratorState;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly workspaceManager: WorkspaceManager;
  private readonly activeRuns = new Set<Promise<void>>();

  constructor(
    private readonly config: NorthstarConfig,
    private readonly tracker: Tracker,
    private readonly runtime: Runtime,
    private promptTemplate = ""
  ) {
    this.workspaceManager = new WorkspaceManager({ root: config.workspace.root ?? "", hooks: config.hooks });
    this.state = createInitialState({
      pollIntervalMs: config.polling.interval_ms,
      maxConcurrentAgents: config.agent.max_concurrent_agents,
      activeStates: config.tracker.active_states,
      terminalStates: config.tracker.terminal_states,
      maxConcurrentAgentsByState: config.agent.max_concurrent_agents_by_state
    });
  }

  setPromptTemplate(template: string): void {
    this.promptTemplate = template;
  }

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  tick(): Promise<OrchestratorState> {
    return this.enqueue(async () => {
      const issues = await this.tracker.fetchCandidateIssues();
      await reconcileRunningIssues(this.state, issues);
      await restartStalledIssues(this.state, new Date(), this.stallTimeoutMs());
      await dispatchCandidates({
        state: this.state,
        issues,
        startRun: (issue) => this.prepareRun(issue),
        onStarted: (issue, started) => this.trackRun(issue, started)
      });
      return this.state;
    });
  }

  async waitForIdle(): Promise<void> {
    while (this.activeRuns.size > 0) {
      await Promise.all([...this.activeRuns]);
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.state.running.values()].map((entry) => entry.stop()));
  }

  async stopIssue(identifier: string): Promise<boolean> {
    const match = this.findRunning(identifier);
    if (!match) return false;
    await match.stop();
    this.state.running.delete(match.issue.id);
    this.state.claimed.delete(match.issue.id);
    return true;
  }

  async retryIssue(identifier: string): Promise<boolean> {
    const issueId = this.findIssueId(identifier);
    if (!issueId) return false;
    this.state.retryAttempts.delete(issueId);
    this.state.claimed.delete(issueId);
    this.state.completed.delete(identifier);
    return true;
  }

  private async prepareRun(issue: Issue): Promise<StartedRun> {
    const workspace = await this.workspaceManager.createForIssue(issue);
    await this.workspaceManager.runBeforeRun(workspace.path, issue);
    const tools = filterToolsForIssue(buildTools(this.config), this.config.policy, issue);
    const skillSequence = skillSequenceForIssue(this.config.skills, issue);
    const context = assembleIssueContext({
      issue,
      skillSequence,
      previousResult: this.state.results.get(issue.id)
    });
    const renderedPrompt = await renderPrompt(this.promptTemplate, {
      issue,
      northstar: {
        context,
        skills: skillSequence
      }
    });
    const skillInstructions = renderSkillInstructions(skillSequence);
    const prompt = [renderedPrompt, skillInstructions, context].filter(Boolean).join("\n\n");
    const abortController = new AbortController();
    const session = await this.runtime.startSession({ issue, workspacePath: workspace.path, tools });
    const attempt = this.state.retryAttempts.get(issue.id)?.attempt ?? 1;
    const stop = async () => {
      abortController.abort();
      await session.stop();
    };
    return {
      threadId: session.threadId,
      workspacePath: workspace.path,
      prompt,
      tools,
      attempt,
      skillSequence,
      stop,
      run: (turnPrompt = prompt) => session.runTurn({
        prompt: turnPrompt,
        issue,
        tools: [...tools],
        onEvent: (event) => this.recordEvent(issue.id, event),
        signal: abortController.signal
      })
    };
  }

  private trackRun(issue: Issue, started: StartedRun): void {
    const run = this.executeRun(issue, started);
    this.activeRuns.add(run);
    run.finally(() => this.activeRuns.delete(run));
  }

  private async executeRun(issue: Issue, started: StartedRun): Promise<void> {
    await this.comment(issue.id, `Northstar started ${issue.identifier} in ${started.threadId}.`);
    await this.transition(issue.id, this.config.feedback.transitions.started_state);
    const startedAt = this.state.running.get(issue.id)?.startedAt ?? new Date();
    let result: TurnResult;
    const gateResults: Array<{ gate: string; status: TurnResult["status"]; output?: string }> = [];
    const turnResults: TurnResult[] = [];
    try {
      result = started.run ? await started.run() : { status: "failed", output: "runtime did not provide a run function" };
      turnResults.push(result);
      if (result.status === "completed") {
        let previousOutput = result.output;
        for (const gate of qualityGateSequenceForIssue(this.config.quality_gates, issue)) {
          const gateResult = await started.run?.(renderQualityGatePrompt(gate, issue, previousOutput)) ?? { status: "failed" as const, output: `quality gate ${gate} could not run` };
          turnResults.push(gateResult);
          gateResults.push({ gate, status: gateResult.status, output: gateResult.output });
          previousOutput = [previousOutput, gateResult.output].filter(Boolean).join("\n\n");
          if (gateResult.status !== "completed") {
            result = { status: gateResult.status, output: `Quality gate ${gate} finished with status ${gateResult.status}: ${gateResult.output ?? ""}`, tokens: gateResult.tokens };
            break;
          }
        }
      }
    } catch (error) {
      result = { status: "failed", output: error instanceof Error ? error.message : String(error) };
      turnResults.push(result);
    } finally {
      if (started.workspacePath) await this.workspaceManager.runAfterRun(started.workspacePath, issue);
    }

    const running = this.state.running.get(issue.id);
    if (!running || running.threadId !== started.threadId) return;
    const completedAt = new Date();
    for (const turnResult of turnResults) {
      if (turnResult.tokens) this.addTokens(turnResult.tokens);
    }
    if (result.status === "completed") this.state.completed.add(issue.identifier);
    if (result.status === "failed" || result.status === "timeout") this.scheduleRetry(issue, started, result);
    this.state.results.set(issue.id, {
      issueId: issue.id,
      issue: issue.identifier,
      threadId: started.threadId,
      workspacePath: started.workspacePath ?? "",
      status: result.status,
      output: result.output,
      tokens: result.tokens,
      events: running?.events ?? [],
      startedAt,
      completedAt,
      attempt: started.attempt ?? 1,
      error: result.status === "failed" ? result.output : undefined,
      gateResults
    });
    this.state.running.delete(issue.id);
    this.state.claimed.delete(issue.id);
    if (result.status === "completed") this.state.retryAttempts.delete(issue.id);
    await this.transition(issue.id, result.status === "completed" ? this.config.feedback.transitions.completed_state : this.config.feedback.transitions.failed_state);
    await this.comment(issue.id, result.status === "completed"
      ? `Northstar completed ${issue.identifier}.`
      : `Northstar finished ${issue.identifier} with status ${result.status}.`);
  }

  private recordEvent(issueId: string, event: RuntimeEvent): void {
    const running = this.state.running.get(issueId);
    if (!running) return;
    running.lastActivityAt = new Date();
    running.events.push(event);
  }

  private addTokens(tokens: { input: number; output: number; total: number }): void {
    this.state.tokenTotals = {
      input: this.state.tokenTotals.input + tokens.input,
      output: this.state.tokenTotals.output + tokens.output,
      total: this.state.tokenTotals.total + tokens.total
    };
  }

  private async comment(issueId: string, body: string): Promise<void> {
    if (!this.config.feedback.comments_enabled) return;
    try {
      await this.tracker.createComment?.(issueId, body);
    } catch {
      // Tracker comments are operational feedback; they should not fail the run itself.
    }
  }

  private async transition(issueId: string, stateName: string | undefined): Promise<void> {
    if (!stateName) return;
    try {
      await this.tracker.updateIssueState?.(issueId, stateName);
    } catch {
      // State transitions are best-effort feedback because some trackers do not support them.
    }
  }

  private scheduleRetry(issue: Issue, started: StartedRun, result: TurnResult): void {
    const attempt = started.attempt ?? 1;
    this.state.retryAttempts.set(issue.id, {
      issueId: issue.id,
      attempt: attempt + 1,
      dueAt: new Date(Date.now() + retryDelayMs(attempt, this.config.agent.max_retry_backoff_ms)),
      metadata: {
        issue: issue.identifier,
        status: result.status,
        output: result.output
      }
    });
  }

  private findRunning(identifier: string) {
    return [...this.state.running.values()].find((entry) => entry.issue.id === identifier || entry.issue.identifier === identifier);
  }

  private findIssueId(identifier: string): string | null {
    const running = this.findRunning(identifier);
    if (running) return running.issue.id;
    for (const [issueId, result] of this.state.results) {
      if (issueId === identifier || result.issue === identifier) return issueId;
    }
    const retry = [...this.state.retryAttempts.values()].find((entry) => entry.issueId === identifier || entry.metadata.issue === identifier);
    return retry?.issueId ?? null;
  }

  private stallTimeoutMs(): number {
    return "stall_timeout_ms" in this.config.runtime ? this.config.runtime.stall_timeout_ms : 300_000;
  }
}

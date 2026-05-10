import type { NorthstarConfig } from "../workflow/schema.js";
import type { Tracker } from "../tracker/types.js";
import type { Runtime, RuntimeEvent, TurnResult } from "../runtime/types.js";
import { createInitialState, type AuditEventKind, type OrchestratorState, type RunMode } from "./state.js";
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
import type { TrackerComment } from "../tracker/types.js";
import { analyzeDependencies } from "./sequencer.js";
import {
  approvalAuthorAllowed,
  approvalGatesApply,
  commentsAfter,
  loadAwaitingReview,
  parseApprovalCommand,
  renderExecutionPrompt,
  renderPlanningPrompt,
  renderRevisionPrompt,
  saveAwaitingReview,
  type AwaitingReviewEntry
} from "./approval-gates.js";
import { boardColumnsForConfig } from "../board/columns.js";
import { resolveDispatchPolicy } from "./dispatch-policy.js";
import { applyPersistedSnapshot } from "../storage/rehydrate.js";
import { MemoryNorthstarStore, snapshotFromState, type NorthstarStore } from "../storage/store.js";

export class Orchestrator {
  readonly state: OrchestratorState;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly workspaceManager: WorkspaceManager;
  private readonly activeRuns = new Set<Promise<void>>();
  private awaitingReviewLoaded = false;

  constructor(
    private readonly config: NorthstarConfig,
    private readonly tracker: Tracker,
    private readonly runtime: Runtime,
    private promptTemplate = "",
    private readonly store: NorthstarStore = new MemoryNorthstarStore()
  ) {
    this.workspaceManager = new WorkspaceManager({
      root: config.workspace.root ?? "",
      hooks: config.hooks,
      strategy: config.workspace.strategy,
      repo: config.workspace.repo,
      baseBranch: config.workspace.base_branch,
      branchTemplate: config.workspace.branch_template,
      reuseExisting: config.workspace.reuse_existing
    });
    const dispatchPolicy = resolveDispatchPolicy(config, boardColumnsForConfig(config));
    this.state = createInitialState({
      pollIntervalMs: config.polling.interval_ms,
      maxConcurrentAgents: config.agent.max_concurrent_agents,
      activeStates: config.tracker.active_states,
      terminalStates: config.tracker.terminal_states,
      dispatchStates: dispatchPolicy.states,
      requireUnblocked: dispatchPolicy.requireUnblocked,
      requireReadyLabel: dispatchPolicy.requireReadyLabel,
      readyLabels: dispatchPolicy.readyLabels,
      blockedLabels: dispatchPolicy.blockedLabels,
      blockDetectedDependencies: config.sequencing.enabled && config.sequencing.mode === "block_dispatch",
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
      await this.ensureAwaitingReviewLoaded();
      const issues = await this.tracker.fetchCandidateIssues();
      if (this.config.sequencing.enabled && this.config.sequencing.scan_on_refresh) await this.runDependencyScan(issues);
      await this.processAwaitingReview(issues);
      await reconcileRunningIssues(this.state, issues);
      await restartStalledIssues(this.state, new Date(), this.stallTimeoutMs());
      await dispatchCandidates({
        state: this.state,
        issues,
        startRun: (issue) =>
          approvalGatesApply(this.config.approval_gates, issue)
            ? this.prepareRun(issue, { mode: "planning" })
            : this.prepareRun(issue, { mode: "implementation" }),
        onStarted: (issue, started) => this.trackRun(issue, started, started.mode ?? "implementation")
      });
      return this.state;
    });
  }

  scanDependencies(): Promise<void> {
    return this.enqueue(async () => {
      const issues = await this.tracker.fetchCandidateIssues();
      await this.runDependencyScan(issues);
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
    this.audit("issue_stopped", {
      issueId: match.issue.id,
      issueIdentifier: match.issue.identifier,
      message: `Run stopped for ${match.issue.identifier}`
    });
    this.state.running.delete(match.issue.id);
    this.state.claimed.delete(match.issue.id);
    await this.persistState();
    return true;
  }

  async approveIssue(identifier: string): Promise<boolean> {
    await this.ensureAwaitingReviewLoaded();
    const entry = this.findAwaiting(identifier);
    if (!entry) return false;
    this.audit("approval_triggered", { issueId: entry.issueId, issueIdentifier: entry.issue, message: `Plan approved for ${entry.issue}` });
    const issue = await this.issueForAwaiting(entry);
    await this.startApprovedRun(issue, entry);
    return true;
  }

  async feedbackIssue(identifier: string, message: string): Promise<boolean> {
    await this.ensureAwaitingReviewLoaded();
    const entry = this.findAwaiting(identifier);
    if (!entry || message.trim() === "") return false;
    this.audit("feedback_triggered", {
      issueId: entry.issueId,
      issueIdentifier: entry.issue,
      message: `Feedback submitted for ${entry.issue}: "${message.slice(0, 80)}"`
    });
    const issue = await this.issueForAwaiting(entry);
    await this.startRevisionRun(issue, entry, message.trim(), `dashboard-${Date.now()}`);
    return true;
  }

  async rejectIssue(identifier: string, message?: string): Promise<boolean> {
    await this.ensureAwaitingReviewLoaded();
    const entry = this.findAwaiting(identifier);
    if (!entry) return false;
    this.audit("rejection_triggered", {
      issueId: entry.issueId,
      issueIdentifier: entry.issue,
      message: `Plan rejected for ${entry.issue}${message ? `: ${message.slice(0, 80)}` : ""}`
    });
    this.state.awaitingReview.delete(entry.issueId);
    this.state.claimed.delete(entry.issueId);
    await this.persistAwaitingReview();
    await this.transition(entry.issueId, this.config.feedback.transitions.failed_state);
    const suffix = message?.trim() ? ` Reason: ${message.trim()}` : "";
    await this.comment(entry.issueId, `Northstar approval gate rejected ${entry.issue}.${suffix}`);
    return true;
  }

  async retryIssue(identifier: string): Promise<boolean> {
    const issueId = this.findIssueId(identifier);
    if (!issueId) return false;
    this.state.retryAttempts.delete(issueId);
    this.state.claimed.delete(issueId);
    this.state.completed.delete(identifier);
    await this.persistState();
    return true;
  }

  async recordPullRequest(issueId: string, pr: { url: string; number: number; state: "open" | "closed" | "merged" }): Promise<void> {
    this.state.pullRequests.set(issueId, { issueId, ...pr });
    await this.persistState();
  }

  private async prepareRun(
    issue: Issue,
    opts: { mode: RunMode; promptOverride?: string } = { mode: "implementation" }
  ): Promise<StartedRun> {
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
    const basePrompt = [renderedPrompt, skillInstructions, context].filter(Boolean).join("\n\n");
    const prompt = opts.promptOverride ?? (opts.mode === "planning" ? renderPlanningPrompt(basePrompt) : basePrompt);
    const abortController = new AbortController();
    const session = await this.runtime.startSession({ issue, workspacePath: workspace.path, tools });
    const attempt = this.state.retryAttempts.get(issue.id)?.attempt ?? 1;
    const stop = async () => {
      abortController.abort();
      await session.stop();
    };
    return {
      threadId: session.threadId,
      mode: opts.mode,
      workspacePath: workspace.path,
      prompt,
      tools,
      attempt,
      skillSequence,
      branchName: workspace.branchName ?? issue.branch_name,
      baseBranch: workspace.baseBranch,
      changedFiles: workspace.changedFiles ?? [],
      workspaceStrategy: workspace.strategy,
      repoPath: workspace.repoPath,
      stop,
      run: (turnPrompt = prompt) =>
        session.runTurn({
          prompt: turnPrompt,
          mode: opts.mode,
          issue,
          tools: [...tools],
          onEvent: (event) => this.recordEvent(issue.id, event),
          signal: abortController.signal
        })
    };
  }

  private async runDependencyScan(issues: Issue[]): Promise<void> {
    const results = await analyzeDependencies(issues, {
      model: planningModelForConfig(this.config),
      apiKey: apiKeyForConfig(this.config)
    });
    this.state.detectedDependencies.clear();
    for (const result of results) {
      if (result.blockedBy.length > 0) {
        this.state.detectedDependencies.set(result.issueId, result.blockedBy);
        const issue = issues.find((i) => i.id === result.issueId);
        this.audit("dependency_detected", {
          issueId: result.issueId,
          issueIdentifier: issue?.identifier,
          message: `LLM detected ${result.blockedBy.length} blocker(s) for ${issue?.identifier ?? result.issueId}: ${result.blockedBy.join(", ")}`,
          metadata: { blockedBy: result.blockedBy }
        });
      }
    }
    await this.persistState();
  }

  private trackRun(issue: Issue, started: StartedRun, mode: RunMode): void {
    const run = this.executeRun(issue, started, mode);
    this.activeRuns.add(run);
    run.finally(() => this.activeRuns.delete(run));
  }

  private async executeRun(issue: Issue, started: StartedRun, mode: RunMode): Promise<void> {
    if (mode === "planning" || mode === "revision") {
      await this.executePlanningRun(issue, started, mode);
      return;
    }
    if ((started.attempt ?? 1) === 1) {
      await this.comment(issue.id, `Northstar started ${issue.identifier}.`);
    }
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
          const gateResult = (await started.run?.(renderQualityGatePrompt(gate, issue, previousOutput))) ?? {
            status: "failed" as const,
            output: `quality gate ${gate} could not run`
          };
          turnResults.push(gateResult);
          gateResults.push({ gate, status: gateResult.status, output: gateResult.output });
          previousOutput = [previousOutput, gateResult.output].filter(Boolean).join("\n\n");
          if (gateResult.status !== "completed") {
            result = {
              status: gateResult.status,
              output: `Quality gate ${gate} finished with status ${gateResult.status}: ${gateResult.output ?? ""}`,
              tokens: gateResult.tokens
            };
            break;
          }
        }
      }
    } catch (error) {
      result = { status: "failed", output: error instanceof Error ? error.message : String(error) };
      turnResults.push(result);
    } finally {
      if (started.workspacePath) {
        await this.workspaceManager.runAfterRun(started.workspacePath, issue);
        await this.refreshStartedWorkspaceMetadata(started);
      }
    }

    const running = this.state.running.get(issue.id);
    if (!running || running.threadId !== started.threadId) return;
    const completedAt = new Date();
    for (const turnResult of turnResults) {
      if (turnResult.tokens) this.addTokens(turnResult.tokens);
    }
    if (result.status === "completed") this.state.completed.add(issue.identifier);
    if (result.status === "failed" || result.status === "timeout") this.scheduleRetry(issue, started, result);
    this.audit(result.status === "completed" ? "run_completed" : "run_failed", {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      message:
        result.status === "completed"
          ? `Run completed for ${issue.identifier} (${result.tokens?.total ?? 0} tokens)`
          : `Run ${result.status} for ${issue.identifier}: ${(result.output ?? "").slice(0, 120)}`,
      metadata: { status: result.status, tokens: result.tokens, attempt: started.attempt }
    });
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
      gateResults,
      branchName: started.branchName ?? issue.branch_name,
      baseBranch: started.baseBranch,
      changedFiles: started.changedFiles
    });
    this.state.running.delete(issue.id);
    this.state.claimed.delete(issue.id);
    if (result.status === "completed") this.state.retryAttempts.delete(issue.id);
    await this.transition(
      issue.id,
      result.status === "completed" ? this.config.feedback.transitions.completed_state : this.config.feedback.transitions.failed_state
    );
    await this.persistState();
    // Only comment on definitive outcomes: success, or a failure with no further retry queued.
    const willRetry = this.state.retryAttempts.has(issue.id);
    if (result.status === "completed") {
      await this.comment(issue.id, `Northstar completed ${issue.identifier}.`);
    } else if (!willRetry) {
      await this.comment(issue.id, `Northstar finished ${issue.identifier} with status ${result.status}.`);
    }
  }

  private async executePlanningRun(issue: Issue, started: StartedRun, mode: "planning" | "revision"): Promise<void> {
    const startedAt = this.state.running.get(issue.id)?.startedAt ?? new Date();
    let result: TurnResult;
    try {
      result = started.run ? await started.run() : { status: "failed", output: "runtime did not provide a run function" };
      if (result.tokens) this.addTokens(result.tokens);
    } catch (error) {
      result = { status: "failed", output: error instanceof Error ? error.message : String(error) };
    } finally {
      if (started.workspacePath) {
        await this.workspaceManager.runAfterRun(started.workspacePath, issue);
        await this.refreshStartedWorkspaceMetadata(started);
      }
    }

    const running = this.state.running.get(issue.id);
    if (!running || running.threadId !== started.threadId) return;
    this.state.running.delete(issue.id);
    this.state.claimed.delete(issue.id);

    if (result.status !== "completed") {
      this.scheduleRetry(issue, started, result);
      this.state.results.set(issue.id, {
        issueId: issue.id,
        issue: issue.identifier,
        threadId: started.threadId,
        workspacePath: started.workspacePath ?? "",
        status: result.status,
        output: result.output,
        tokens: result.tokens,
        events: running.events,
        startedAt,
        completedAt: new Date(),
        attempt: started.attempt ?? 1,
        error: result.status === "failed" ? result.output : undefined,
        gateResults: [],
        branchName: started.branchName ?? issue.branch_name,
        baseBranch: started.baseBranch,
        changedFiles: started.changedFiles
      });
      await this.persistState();
      return;
    }

    const planOutput = result.output ?? "";
    this.audit("plan_created", {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      message: `Plan created for ${issue.identifier} — awaiting review`,
      metadata: { tokens: result.tokens, attempt: started.attempt }
    });
    const planCommentId = await this.postCommentAndReadId(issue.id, formatPlanComment(issue, planOutput, this.config.approval_gates));
    const existing = this.state.awaitingReview.get(issue.id);
    const now = new Date();
    this.state.awaitingReview.set(issue.id, {
      issueId: issue.id,
      issue: issue.identifier,
      title: issue.title,
      workspacePath: started.workspacePath ?? existing?.workspacePath ?? "",
      planOutput,
      planCommentId,
      lastProcessedCommentId: mode === "revision" ? (existing?.lastProcessedCommentId ?? null) : planCommentId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      attempt: started.attempt ?? existing?.attempt ?? 1
    });
    await this.persistAwaitingReview();
    await this.transition(issue.id, this.config.approval_gates.awaiting_state);
  }

  private async processAwaitingReview(candidateIssues: Issue[]): Promise<void> {
    if (!this.tracker.fetchComments) return;
    for (const entry of [...this.state.awaitingReview.values()]) {
      if (this.state.running.has(entry.issueId)) continue;
      const issue = candidateIssues.find((candidate) => candidate.id === entry.issueId) ?? (await this.issueForAwaiting(entry));
      const comments = await this.tracker.fetchComments(entry.issueId);
      for (const comment of commentsAfter(comments, entry.lastProcessedCommentId)) {
        const command = parseApprovalCommand(comment.body, {
          approvalTrigger: this.config.approval_gates.approval_trigger,
          rejectionTrigger: this.config.approval_gates.rejection_trigger,
          revisionTrigger: this.config.approval_gates.revision_trigger
        });
        if (!command) continue;
        entry.lastProcessedCommentId = comment.id;
        entry.updatedAt = new Date();
        await this.persistAwaitingReview();
        if (!approvalAuthorAllowed(comment, this.config.approval_gates.approvers)) continue;
        if (command.kind === "approve") {
          await this.startApprovedRun(issue, entry);
          break;
        }
        if (command.kind === "revise") {
          await this.startRevisionRun(issue, entry, command.message, comment.id);
          break;
        }
        if (command.kind === "reject") {
          this.state.awaitingReview.delete(entry.issueId);
          this.state.claimed.delete(entry.issueId);
          await this.persistAwaitingReview();
          await this.transition(entry.issueId, this.config.feedback.transitions.failed_state);
          await this.comment(entry.issueId, `Northstar approval gate rejected ${entry.issue}.`);
          break;
        }
      }
    }
  }

  private async startApprovedRun(issue: Issue, entry: AwaitingReviewEntry): Promise<void> {
    this.state.awaitingReview.delete(entry.issueId);
    await this.persistAwaitingReview();
    const basePrompt = await this.basePromptForIssue(issue);
    const started = await this.prepareRun(issue, {
      mode: "execution",
      promptOverride: renderExecutionPrompt(basePrompt, entry.planOutput)
    });
    this.registerStartedRun(issue, started);
    this.trackRun(issue, started, "execution");
  }

  private async startRevisionRun(
    issue: Issue,
    entry: AwaitingReviewEntry,
    feedback: string,
    lastProcessedCommentId: string
  ): Promise<void> {
    entry.lastProcessedCommentId = lastProcessedCommentId;
    entry.updatedAt = new Date();
    await this.persistAwaitingReview();
    const basePrompt = await this.basePromptForIssue(issue);
    const started = await this.prepareRun(issue, {
      mode: "revision",
      promptOverride: renderRevisionPrompt(basePrompt, entry.planOutput, feedback)
    });
    this.registerStartedRun(issue, started);
    this.trackRun(issue, started, "revision");
  }

  private registerStartedRun(issue: Issue, started: StartedRun): void {
    this.state.running.set(issue.id, {
      issue,
      threadId: started.threadId,
      mode: started.mode,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      stop: started.stop,
      attempt: started.attempt,
      workspacePath: started.workspacePath,
      prompt: started.prompt,
      toolNames: started.tools?.map((tool) => tool.name) ?? [],
      events: [],
      skillSequence: started.skillSequence,
      branchName: started.branchName ?? issue.branch_name,
      baseBranch: started.baseBranch,
      changedFiles: started.changedFiles
    });
    this.state.claimed.add(issue.id);
    this.audit("run_started", {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      message: `Run started for ${issue.identifier} (mode: ${started.mode ?? "implementation"}, attempt ${started.attempt ?? 1})`,
      metadata: { mode: started.mode, attempt: started.attempt, tools: started.tools?.map((t) => t.name) }
    });
  }

  private async basePromptForIssue(issue: Issue): Promise<string> {
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
    return [renderedPrompt, renderSkillInstructions(skillSequence), context].filter(Boolean).join("\n\n");
  }

  private async issueForAwaiting(entry: AwaitingReviewEntry): Promise<Issue> {
    const [fetched] = await this.tracker.fetchIssueStatesByIds([entry.issueId]);
    return (
      fetched ?? {
        id: entry.issueId,
        identifier: entry.issue,
        title: entry.title,
        description: null,
        priority: null,
        state: this.config.approval_gates.awaiting_state ?? "",
        branch_name: null,
        url: null,
        labels: [],
        blocked_by: [],
        created_at: null,
        updated_at: null
      }
    );
  }

  private findAwaiting(identifier: string): AwaitingReviewEntry | null {
    return [...this.state.awaitingReview.values()].find((entry) => entry.issueId === identifier || entry.issue === identifier) ?? null;
  }

  private async refreshStartedWorkspaceMetadata(started: StartedRun): Promise<void> {
    if (!started.workspacePath || !started.workspaceStrategy) return;
    const inspected = await this.workspaceManager.inspect({
      path: started.workspacePath,
      workspaceKey: started.workspacePath.split(/[\\/]/).at(-1) ?? "workspace",
      createdNow: false,
      strategy: started.workspaceStrategy,
      repoPath: started.repoPath,
      branchName: started.branchName,
      baseBranch: started.baseBranch,
      changedFiles: started.changedFiles
    });
    started.branchName = inspected.branchName ?? started.branchName;
    started.changedFiles = inspected.changedFiles ?? started.changedFiles;
  }

  private async ensureAwaitingReviewLoaded(): Promise<void> {
    if (this.awaitingReviewLoaded) return;
    const snapshot = await this.store.loadSnapshot();
    if (snapshot) {
      applyPersistedSnapshot(this.state, snapshot);
    } else {
      this.state.awaitingReview = await loadAwaitingReview(this.config.workspace.root ?? "");
    }
    this.awaitingReviewLoaded = true;
  }

  private async persistAwaitingReview(): Promise<void> {
    await saveAwaitingReview(this.config.workspace.root ?? "", this.state.awaitingReview);
    await this.persistState();
  }

  private async persistState(): Promise<void> {
    await this.store.saveSnapshot(snapshotFromState(this.state));
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

  private audit(
    kind: AuditEventKind,
    opts: { issueId?: string; issueIdentifier?: string; message: string; metadata?: Record<string, unknown> }
  ): void {
    const MAX_AUDIT_EVENTS = 500;
    this.state.auditLog.push({
      id: ++this.state.auditSeq,
      timestamp: new Date().toISOString(),
      kind,
      ...opts
    });
    if (this.state.auditLog.length > MAX_AUDIT_EVENTS) {
      this.state.auditLog.splice(0, this.state.auditLog.length - MAX_AUDIT_EVENTS);
    }
    void this.persistState().catch(() => undefined);
  }

  private async comment(issueId: string, body: string): Promise<void> {
    if (!this.config.feedback.comments_enabled) return;
    try {
      await this.tracker.createComment?.(issueId, body);
    } catch {
      // Tracker comments are operational feedback; they should not fail the run itself.
    }
  }

  private async postCommentAndReadId(issueId: string, body: string): Promise<string | null> {
    if (!this.config.feedback.comments_enabled) return null;
    try {
      const created = await this.tracker.createComment?.(issueId, body);
      if (created?.id) return created.id;
      const comments = await this.tracker.fetchComments?.(issueId);
      return latestMatchingComment(comments ?? [], body)?.id ?? null;
    } catch {
      return null;
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
    const delayMs = retryDelayMs(attempt, this.config.agent.max_retry_backoff_ms);
    this.state.retryAttempts.set(issue.id, {
      issueId: issue.id,
      attempt: attempt + 1,
      dueAt: new Date(Date.now() + delayMs),
      metadata: {
        issue: issue.identifier,
        status: result.status,
        output: result.output
      }
    });
    this.audit("retry_scheduled", {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      message: `Retry #${attempt + 1} scheduled for ${issue.identifier} in ${Math.round(delayMs / 1000)}s`,
      metadata: { attempt: attempt + 1, status: result.status }
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
    const retry = [...this.state.retryAttempts.values()].find(
      (entry) => entry.issueId === identifier || entry.metadata.issue === identifier
    );
    return retry?.issueId ?? null;
  }

  private stallTimeoutMs(): number {
    return "stall_timeout_ms" in this.config.runtime ? this.config.runtime.stall_timeout_ms : 300_000;
  }
}

const formatPlanComment = (issue: Issue, plan: string, config: NorthstarConfig["approval_gates"]): string =>
  [
    `Northstar plan for ${issue.identifier}:`,
    "",
    plan,
    "",
    `Reply with ${config.approval_trigger} to approve, ${config.revision_trigger} <feedback> to request changes, or ${config.rejection_trigger} to reject.`
  ].join("\n");

const latestMatchingComment = (comments: TrackerComment[], body: string): TrackerComment | null => {
  const matches = comments.filter((comment) => comment.body === body || comment.body.includes(body));
  return matches.at(-1) ?? comments.at(-1) ?? null;
};

const planningModelForConfig = (config: NorthstarConfig): string | undefined => {
  if (config.runtime.kind === "claude_code") return config.runtime.planning_model ?? config.runtime.model;
  return undefined;
};

const apiKeyForConfig = (config: NorthstarConfig): string | undefined => {
  if (config.runtime.kind === "claude_code") return config.runtime.api_key ?? process.env.ANTHROPIC_API_KEY;
  return undefined;
};

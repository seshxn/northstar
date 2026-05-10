import { rm, mkdir, lstat, realpath } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Issue } from "../tracker/issue.js";
import { runHook } from "./hooks.js";
import { cloneGitRepo, createGitWorktree, inspectGitWorkspace, renderBranchName } from "./git.js";

export interface WorkspaceHooks {
  after_create?: string;
  before_run?: string;
  after_run?: string;
  before_remove?: string;
  timeout_ms?: number;
}

export interface WorkspaceManagerConfig {
  root: string;
  hooks?: WorkspaceHooks;
  strategy?: "directory" | "git_worktree" | "clone";
  repo?: string;
  baseBranch?: string;
  branchTemplate?: string;
  reuseExisting?: boolean;
}

export interface WorkspaceInfo {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
  strategy: "directory" | "git_worktree" | "clone";
  repoPath?: string;
  branchName?: string | null;
  baseBranch?: string | null;
  changedFiles?: string[];
}

export class WorkspaceManager {
  private readonly root: string;
  private readonly hooks: WorkspaceHooks;
  private readonly strategy: "directory" | "git_worktree" | "clone";
  private readonly repo?: string;
  private readonly baseBranch: string;
  private readonly branchTemplate: string;
  private readonly reuseExisting: boolean;

  constructor(config: WorkspaceManagerConfig) {
    this.root = resolve(config.root);
    this.hooks = config.hooks ?? {};
    this.strategy = config.strategy ?? "directory";
    this.repo = config.repo ? resolve(config.repo) : undefined;
    this.baseBranch = config.baseBranch ?? "main";
    this.branchTemplate = config.branchTemplate ?? "northstar/{{ issue.identifier | downcase }}";
    this.reuseExisting = config.reuseExisting ?? true;
  }

  async createForIssue(issue: Pick<Issue, "id" | "identifier" | "title">): Promise<WorkspaceInfo> {
    return this.createForIdentifier(issue.identifier, issue.id, issue);
  }

  async createForIdentifier(
    identifier: string,
    issueId: string | null = null,
    issue: Pick<Issue, "identifier" | "title"> = { identifier, title: identifier }
  ): Promise<WorkspaceInfo> {
    await mkdir(this.root, { recursive: true });
    await this.rejectRawPathEscape(identifier);
    const workspaceKey = safeIdentifier(identifier);
    const workspacePath = resolve(this.root, workspaceKey);
    await this.validateContained(workspacePath);
    const createdNow = !(await existsAsDirectory(workspacePath));
    const branchName = this.strategy === "directory" ? null : renderBranchName(this.branchTemplate, issue);
    if (this.strategy === "directory") {
      if (createdNow) await mkdir(workspacePath, { recursive: true });
    } else if (this.strategy === "git_worktree") {
      if (!this.repo) throw new Error("workspace.repo is required for git_worktree strategy");
      await createGitWorktree({
        repo: this.repo,
        path: workspacePath,
        branch: branchName ?? workspaceKey,
        baseBranch: this.baseBranch,
        reuseExisting: this.reuseExisting
      });
    } else {
      if (!this.repo) throw new Error("workspace.repo is required for clone strategy");
      await cloneGitRepo({
        repo: this.repo,
        path: workspacePath,
        branch: branchName ?? workspaceKey,
        baseBranch: this.baseBranch,
        reuseExisting: this.reuseExisting
      });
    }
    await this.validateContained(workspacePath);
    if (createdNow) {
      await runHook(this.hooks.after_create, {
        workspace: workspacePath,
        issueId,
        issueIdentifier: identifier,
        timeoutMs: this.hooks.timeout_ms ?? 60_000
      });
    }
    return {
      path: workspacePath,
      workspaceKey,
      createdNow,
      strategy: this.strategy,
      repoPath: this.repo,
      branchName,
      baseBranch: this.strategy === "directory" ? null : this.baseBranch,
      changedFiles: []
    };
  }

  async inspect(workspace: WorkspaceInfo): Promise<WorkspaceInfo> {
    if (workspace.strategy === "directory") return workspace;
    const inspected = await inspectGitWorkspace(workspace.path);
    return {
      ...workspace,
      branchName: inspected.branchName ?? workspace.branchName,
      changedFiles: inspected.changedFiles
    };
  }

  async runBeforeRun(workspace: string, issue: Pick<Issue, "id" | "identifier">): Promise<void> {
    await runHook(this.hooks.before_run, {
      workspace,
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      timeoutMs: this.hooks.timeout_ms ?? 60_000
    });
  }

  async runAfterRun(workspace: string, issue: Pick<Issue, "id" | "identifier">): Promise<void> {
    try {
      await runHook(this.hooks.after_run, {
        workspace,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        timeoutMs: this.hooks.timeout_ms ?? 60_000
      });
    } catch {
      // after_run hook failures are non-fatal, matching the reference implementation.
    }
  }

  async remove(workspace: string): Promise<void> {
    await this.validateContained(workspace);
    try {
      await runHook(this.hooks.before_remove, {
        workspace,
        issueIdentifier: workspace.split(sep).at(-1) ?? "issue",
        timeoutMs: this.hooks.timeout_ms ?? 60_000
      });
    } catch {
      // before_remove cleanup failures are logged by callers but do not prevent deletion.
    }
    await rm(workspace, { recursive: true, force: true });
  }

  async validateContained(workspace: string): Promise<void> {
    const rootReal = await realpath(this.root);
    await mkdir(dirname(workspace), { recursive: true });
    const workspaceResolved = resolve(workspace);
    const candidateReal = await realpathExistingPrefix(workspaceResolved);
    if (workspaceResolved === this.root || workspaceResolved === rootReal) throw new Error(`workspace equals root: ${workspace}`);
    if (!`${candidateReal}${sep}`.startsWith(`${rootReal}${sep}`)) {
      throw new Error(`workspace outside root or symlink escape: ${workspace}`);
    }
    if (!`${workspaceResolved}${sep}`.startsWith(`${this.root}${sep}`)) {
      throw new Error(`workspace outside root: ${workspace}`);
    }
  }

  private async rejectRawPathEscape(identifier: string): Promise<void> {
    const [first] = identifier.split(/[\\/]/);
    if (!first || first === identifier) return;
    const rawFirstPath = resolve(this.root, first);
    try {
      const stat = await lstat(rawFirstPath);
      if (stat.isSymbolicLink()) {
        const rootReal = await realpath(this.root);
        const linkReal = await realpath(rawFirstPath);
        if (!`${linkReal}${sep}`.startsWith(`${rootReal}${sep}`)) throw new Error(`workspace symlink escape: ${identifier}`);
      }
    } catch (error) {
      if (error instanceof Error && /symlink escape/.test(error.message)) throw error;
    }
  }
}

export const safeIdentifier = (identifier: string | null | undefined): string => (identifier || "issue").replace(/[^a-zA-Z0-9._-]/g, "_");

const existsAsDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
};

const realpathExistingPrefix = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch {
    return realpath(dirname(path));
  }
};

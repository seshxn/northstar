import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Issue } from "../tracker/issue.js";

const execFileAsync = promisify(execFile);

export interface GitRunner {
  (command: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;
}

export const defaultGitRunner: GitRunner = async (command, args, opts = {}) => {
  const result = await execFileAsync(command, args, { cwd: opts.cwd });
  return { stdout: result.stdout, stderr: result.stderr };
};

export const renderBranchName = (template: string, issue: Pick<Issue, "identifier" | "title">): string => {
  const rendered = template
    .replaceAll("{{ issue.identifier | downcase }}", issue.identifier.toLowerCase())
    .replaceAll("{{ issue.identifier }}", issue.identifier)
    .replaceAll("{{ issue.title | slug }}", slugify(issue.title))
    .replaceAll("{{ issue.title }}", issue.title);
  return sanitizeBranchName(rendered);
};

export const createGitWorktree = async (opts: {
  repo: string;
  path: string;
  branch: string;
  baseBranch: string;
  reuseExisting: boolean;
  runner?: GitRunner;
}): Promise<void> => {
  const run = opts.runner ?? defaultGitRunner;
  if (opts.reuseExisting) {
    try {
      await run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: opts.path });
      return;
    } catch {
      /* create below */
    }
  }
  await run("git", ["worktree", "add", "-B", opts.branch, opts.path, opts.baseBranch], { cwd: opts.repo });
};

export const cloneGitRepo = async (opts: {
  repo: string;
  path: string;
  branch: string;
  baseBranch: string;
  reuseExisting: boolean;
  runner?: GitRunner;
}): Promise<void> => {
  const run = opts.runner ?? defaultGitRunner;
  if (opts.reuseExisting) {
    try {
      await run("git", ["rev-parse", "--is-inside-work-tree"], { cwd: opts.path });
      return;
    } catch {
      /* clone below */
    }
  }
  await run("git", ["clone", "--branch", opts.baseBranch, opts.repo, opts.path]);
  await run("git", ["checkout", "-B", opts.branch], { cwd: opts.path });
};

export const inspectGitWorkspace = async (
  path: string,
  runner: GitRunner = defaultGitRunner
): Promise<{ branchName: string | null; changedFiles: string[] }> => {
  try {
    const branch = await runner("git", ["branch", "--show-current"], { cwd: path });
    const status = await runner("git", ["status", "--short"], { cwd: path });
    return {
      branchName: branch.stdout.trim() || null,
      changedFiles: status.stdout
        .split(/\r?\n/)
        .map((line) => line.trim().slice(3).trim())
        .filter(Boolean)
    };
  } catch {
    return { branchName: null, changedFiles: [] };
  }
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "issue";

const sanitizeBranchName = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._/-]/g, "-")
    .replace(/\/+/g, "/")
    .replace(/(^[./-]+|[./-]+$)/g, "") || "northstar/issue";

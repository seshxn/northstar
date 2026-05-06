import { spawn } from "node:child_process";

export interface HookContext {
  workspace: string;
  issueId?: string | null;
  issueIdentifier?: string | null;
  timeoutMs: number;
}

export const runHook = (command: string | undefined, ctx: HookContext): Promise<void> => {
  if (!command) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-lc", command], {
      cwd: ctx.workspace,
      env: {
        ...process.env,
        NORTHSTAR_WORKSPACE: ctx.workspace,
        NORTHSTAR_ISSUE_ID: ctx.issueId ?? "",
        NORTHSTAR_ISSUE_IDENTIFIER: ctx.issueIdentifier ?? "issue"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`workspace hook timed out after ${ctx.timeoutMs}ms`));
    }, ctx.timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`workspace hook failed with exit ${code}: ${output.slice(0, 2048)}`));
    });
  });
};

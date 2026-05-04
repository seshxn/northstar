import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Runtime, Session, StartSessionOpts, RunTurnOpts, TurnResult } from "../types.js";

export class ClaudeCodeRuntime implements Runtime {
  readonly kind = "claude_code";
  constructor(private readonly config: { model?: string }) {}

  async startSession(opts: StartSessionOpts): Promise<Session> {
    return new ClaudeCodeSession(this.config, opts.workspacePath);
  }
}

class ClaudeCodeSession implements Session {
  readonly threadId = randomUUID();
  private child: ReturnType<typeof spawn> | null = null;

  constructor(private readonly config: { model?: string }, private readonly cwd: string) {}

  async runTurn(opts: RunTurnOpts): Promise<TurnResult> {
    const args = ["-p", opts.prompt, "--output-format", "stream-json"];
    if (this.config.model) args.push("--model", this.config.model);
    const child = spawn("claude", args, { cwd: this.cwd || process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    return new Promise((resolve) => {
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; opts.onEvent({ type: "claude_stdout", timestamp: new Date().toISOString(), message: String(chunk) }); });
      child.stderr.on("data", (chunk) => opts.onEvent({ type: "claude_stderr", timestamp: new Date().toISOString(), message: String(chunk) }));
      child.on("close", (code) => resolve({ status: code === 0 ? "completed" : "failed", output }));
      opts.signal.addEventListener("abort", () => {
        this.child?.kill("SIGTERM");
        resolve({ status: "cancelled", output });
      }, { once: true });
    });
  }

  async stop(): Promise<void> {
    this.child?.kill("SIGTERM");
  }
}

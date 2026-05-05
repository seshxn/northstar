import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Runtime, Session, StartSessionOpts, RunTurnOpts, TurnResult } from "../types.js";

interface ClaudeCodeConfig {
  model?: string;
  max_turns?: number;
  allowed_tools?: string[];
  disallowed_tools?: string[];
  approval_policy?: "auto" | "prompt" | "reject";
}

export class ClaudeCodeRuntime implements Runtime {
  readonly kind = "claude_code";
  constructor(private readonly config: ClaudeCodeConfig) {}

  async startSession(opts: StartSessionOpts): Promise<Session> {
    return new ClaudeCodeSession(this.config, opts.workspacePath);
  }
}

class ClaudeCodeSession implements Session {
  readonly threadId = randomUUID();
  private child: ReturnType<typeof spawn> | null = null;

  constructor(private readonly config: ClaudeCodeConfig, private readonly cwd: string) {}

  async runTurn(opts: RunTurnOpts): Promise<TurnResult> {
    const args = ["-p", opts.prompt, "--output-format", "stream-json", "--verbose"];
    if (this.config.model) args.push("--model", this.config.model);
    if (this.config.max_turns != null) args.push("--max-turns", String(this.config.max_turns));
    if (this.config.allowed_tools?.length) args.push("--allowedTools", this.config.allowed_tools.join(","));
    if (this.config.disallowed_tools?.length) args.push("--disallowedTools", this.config.disallowed_tools.join(","));
    if (this.config.approval_policy === "auto") args.push("--dangerously-skip-permissions");
    const child = spawn("claude", args, { cwd: this.cwd || process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    return new Promise((resolve) => {
      let output = "";
      let stderrOutput = "";
      child.stdout.on("data", (chunk) => { output += chunk; opts.onEvent({ type: "claude_stdout", timestamp: new Date().toISOString(), message: String(chunk) }); });
      child.stderr.on("data", (chunk) => { stderrOutput += chunk; opts.onEvent({ type: "claude_stderr", timestamp: new Date().toISOString(), message: String(chunk) }); });
      child.on("error", (err) => resolve({ status: "failed", output: err.message }));
      child.on("close", (code) => {
        const combinedOutput = [output, stderrOutput].filter(Boolean).join("\n");
        resolve({ status: code === 0 ? "completed" : "failed", output: combinedOutput });
      });
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

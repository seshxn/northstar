import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Runtime, Session, StartSessionOpts, RunTurnOpts, TurnResult } from "../types.js";
import { normalizeCodexEvent } from "./events.js";

export class CodexAppServerRuntime implements Runtime {
  readonly kind = "codex_app_server";
  constructor(private readonly config: { command: string; turn_timeout_ms?: number }) {}

  async startSession(_opts: StartSessionOpts): Promise<Session> {
    return new CodexAppServerSession(this.config);
  }
}

class CodexAppServerSession implements Session {
  readonly threadId = randomUUID();
  private process: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly config: { command: string; turn_timeout_ms?: number }) {}

  async runTurn(opts: RunTurnOpts): Promise<TurnResult> {
    const [command, ...args] = this.config.command.split(/\s+/);
    this.process = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const started = Date.now();
    opts.onEvent(normalizeCodexEvent({ type: "session_started", threadId: this.threadId }));
    this.process.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "runTurn",
        params: { prompt: opts.prompt, tools: opts.tools.map((tool) => tool.name) }
      }) + "\n"
    );
    this.process.stdin.end();
    return new Promise((resolve) => {
      let output = "";
      const timeout = setTimeout(() => {
        this.process?.kill("SIGTERM");
        resolve({ status: "timeout", output });
      }, this.config.turn_timeout_ms ?? 3_600_000);
      this.process?.stdout.on("data", (chunk) => {
        output += chunk;
        opts.onEvent(normalizeCodexEvent({ type: "stdout", message: String(chunk) }));
      });
      this.process?.stderr.on("data", (chunk) => opts.onEvent(normalizeCodexEvent({ type: "stderr", message: String(chunk) })));
      this.process?.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ status: code === 0 ? "completed" : "failed", output, tokens: { input: 0, output: 0, total: 0 } });
      });
      opts.signal.addEventListener(
        "abort",
        () => {
          this.process?.kill("SIGTERM");
          clearTimeout(timeout);
          resolve({ status: "cancelled", output, tokens: { input: 0, output: 0, total: 0 } });
        },
        { once: true }
      );
      void started;
    });
  }

  async stop(): Promise<void> {
    this.process?.kill("SIGTERM");
  }
}

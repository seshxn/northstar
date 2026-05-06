import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Runtime, RuntimeRunMode, Session, StartSessionOpts, RunTurnOpts, TurnResult } from "../types.js";

interface ClaudeCodeConfig {
  model?: string;
  planning_model?: string;
  max_turns?: number;
  allowed_tools?: string[];
  disallowed_tools?: string[];
  approval_policy?: "auto" | "prompt" | "reject";
}

const DEFAULT_ALLOWED_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep"];

export const buildArgs = (config: ClaudeCodeConfig, prompt: string, opts: { mode?: RuntimeRunMode } = {}): string[] => {
  const args = ["-p", prompt, "--output-format", "stream-json", "--verbose"];
  const model = modelForTurn(config, opts.mode);
  if (model) args.push("--model", model);
  if (config.max_turns != null) args.push("--max-turns", String(config.max_turns));
  const tools = config.allowed_tools?.length ? config.allowed_tools : DEFAULT_ALLOWED_TOOLS;
  args.push("--allowedTools", tools.join(","));
  if (config.disallowed_tools?.length) args.push("--disallowedTools", config.disallowed_tools.join(","));
  return args;
};

const modelForTurn = (config: ClaudeCodeConfig, mode: RuntimeRunMode | undefined): string | undefined => {
  if ((mode === "planning" || mode === "revision") && config.planning_model) return config.planning_model;
  return config.model;
};

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

  constructor(
    private readonly config: ClaudeCodeConfig,
    private readonly cwd: string
  ) {}

  async runTurn(opts: RunTurnOpts): Promise<TurnResult> {
    const args = buildArgs(this.config, opts.prompt, { mode: opts.mode });
    const child = spawn("claude", args, { cwd: this.cwd || process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    return new Promise((resolve) => {
      let buf = "";
      const textParts: string[] = [];
      let finalResult: TurnResult | null = null;

      child.stdout.on("data", (chunk: Buffer) => {
        buf += String(chunk);
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const summary = parseStreamLine(line, textParts);
          if (summary !== null) {
            opts.onEvent({ type: "claude_stdout", timestamp: new Date().toISOString(), message: summary });
          }
          try {
            const ev = JSON.parse(line) as Record<string, unknown>;
            if (ev.type === "result") {
              const isError = ev.is_error === true || ev.subtype !== "success";
              finalResult = {
                status: isError ? "failed" : "completed",
                output: typeof ev.result === "string" ? ev.result : textParts.join("\n")
              };
            }
          } catch {
            /* non-JSON line already handled above */
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const msg = String(chunk).trim();
        if (msg) opts.onEvent({ type: "claude_stderr", timestamp: new Date().toISOString(), message: msg });
      });

      child.on("error", (err) => resolve({ status: "failed", output: err.message }));
      child.on("close", (code) => {
        if (finalResult) return resolve(finalResult);
        resolve({ status: code === 0 ? "completed" : "failed", output: textParts.join("\n") });
      });
      opts.signal.addEventListener(
        "abort",
        () => {
          this.child?.kill("SIGTERM");
          resolve({ status: "cancelled", output: textParts.join("\n") });
        },
        { once: true }
      );
    });
  }

  async stop(): Promise<void> {
    this.child?.kill("SIGTERM");
  }
}

const parseStreamLine = (line: string, textParts: string[]): string | null => {
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (ev.type === "system" && ev.subtype === "init") return "session initialised";
  if (ev.type === "system" && typeof ev.subtype === "string" && ev.subtype.startsWith("hook_")) return null;

  if (ev.type === "assistant") {
    const content = (ev.message as Record<string, unknown>)?.content;
    if (!Array.isArray(content)) return null;
    const parts: string[] = [];
    for (const block of content as Record<string, unknown>[]) {
      if (block.type === "tool_use" && typeof block.name === "string") {
        const inputStr = JSON.stringify(block.input ?? {});
        parts.push(`→ ${block.name}(${inputStr.slice(0, 80)}${inputStr.length > 80 ? "…" : ""})`);
      }
      if (block.type === "text" && typeof block.text === "string") {
        const snippet = block.text.trim().slice(0, 140);
        if (snippet) {
          textParts.push(block.text);
          parts.push(snippet);
        }
      }
    }
    return parts.length ? parts.join(" | ") : null;
  }

  if (ev.type === "result") {
    return `result: ${ev.subtype}${ev.is_error ? " (error)" : ""}`;
  }

  if (ev.type === "rate_limit_event") {
    const info = ev.rate_limit_info as Record<string, unknown> | undefined;
    return `rate-limit: ${info?.status ?? "unknown"}`;
  }

  return null;
};

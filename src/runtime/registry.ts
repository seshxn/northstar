import type { Runtime } from "./types.js";
import type { RuntimeConfig } from "../workflow/schema.js";
import { CodexAppServerRuntime } from "./codex/app-server.js";
import { ClaudeCodeRuntime } from "./claude-code/sdk.js";
import { BedrockAnthropicRuntime } from "./bedrock/bedrock.js";
import { GeminiRuntime } from "./gemini/sdk.js";

export function runtimeForConfig(config: RuntimeConfig): Runtime {
  switch (config.kind) {
    case "codex_app_server":
      return new CodexAppServerRuntime(config);
    case "claude_code":
      return new ClaudeCodeRuntime(config);
    case "bedrock_anthropic":
      return new BedrockAnthropicRuntime(config);
    case "gemini":
      return new GeminiRuntime(config);
  }
}

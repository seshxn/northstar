import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
import { mkdir } from "node:fs/promises";
import type { Tool } from "../../tools/types.js";
import { jsonResult } from "../../tools/types.js";

export const builtinTools = (names: string[], workspacePath: string): Tool[] => {
  const enabled = new Set(names);
  const tools: Tool[] = [];
  if (enabled.has("bash")) tools.push(bashTool(workspacePath));
  if (enabled.has("read")) tools.push(readTool(workspacePath));
  if (enabled.has("write")) tools.push(writeTool(workspacePath));
  if (enabled.has("edit")) tools.push(editTool(workspacePath));
  return tools;
};

const readTool = (root: string): Tool => ({
  name: "read_file",
  description: "Read a UTF-8 file inside the issue workspace.",
  inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  execute: async (args) => jsonResult(await readFile(containedPath(root, getString(args, "path")), "utf8"))
});

const writeTool = (root: string): Tool => ({
  name: "write_file",
  description: "Write a UTF-8 file inside the issue workspace.",
  inputSchema: { type: "object", required: ["path", "content"], properties: { path: { type: "string" }, content: { type: "string" } } },
  execute: async (args) => {
    const path = containedPath(root, getString(args, "path"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, getString(args, "content"));
    return jsonResult({ path });
  }
});

const editTool = (root: string): Tool => ({
  name: "edit_file",
  description: "Replace text inside a UTF-8 file in the issue workspace.",
  inputSchema: { type: "object", required: ["path", "old", "replacement"] },
  execute: async (args) => {
    const path = containedPath(root, getString(args, "path"));
    const current = await readFile(path, "utf8");
    const oldText = getString(args, "old");
    if (!current.includes(oldText)) throw new Error("edit_file old text not found");
    await writeFile(path, current.replace(oldText, getString(args, "replacement")));
    return jsonResult({ path });
  }
});

const bashTool = (root: string): Tool => ({
  name: "bash",
  description: "Run a shell command inside the issue workspace.",
  inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string" }, timeout_ms: { type: "number" } } },
  execute: (args, ctx) =>
    runBash(root, getString(args, "command"), Number((args as { timeout_ms?: unknown }).timeout_ms ?? 60_000), ctx.signal)
});

const runBash = (root: string, command: string, timeoutMs: number, signal: AbortSignal): Promise<ReturnType<typeof jsonResult>> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn("sh", ["-lc", command], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise(jsonResult({ exitCode: code, output }, code === 0));
    });
  });

const containedPath = (root: string, path: string): string => {
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, path);
  if (candidate === rootPath || !`${candidate}${sep}`.startsWith(`${rootPath}${sep}`)) throw new Error("path must remain inside workspace");
  return candidate;
};

const getString = (args: unknown, key: string): string => {
  if (!args || typeof args !== "object" || typeof (args as Record<string, unknown>)[key] !== "string")
    throw new Error(`${key} must be a string`);
  return (args as Record<string, string>)[key];
};

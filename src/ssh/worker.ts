import { spawn } from "node:child_process";

export function runSsh(host: string, script: string, timeoutMs = 60_000): Promise<{ output: string; status: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [host, "sh", "-lc", script], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ output, status });
    });
  });
}

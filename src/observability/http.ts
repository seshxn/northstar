import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OrchestratorState } from "../orchestrator/state.js";
import { snapshotState } from "./snapshot.js";

let dashboardCache: string | null = null;

export function createHttpServer(opts: {
  getState: () => OrchestratorState;
  refresh: () => Promise<void>;
  stopIssue?: (identifier: string) => Promise<boolean>;
  retryIssue?: (identifier: string) => Promise<boolean>;
}) {
  const app = Fastify({ logger: false });
  app.get("/", async (_request, reply) => reply.type("text/html").send(await loadDashboardHtml()));
  app.get("/api/v1/state", async () => snapshotState(opts.getState()));
  app.get<{ Params: { identifier: string } }>("/api/v1/:identifier", async (request, reply) => {
    const snapshot = snapshotState(opts.getState());
    const identifier = decodeURIComponent(request.params.identifier);
    const running = snapshot.running.find((entry) => entry.issue === identifier || entry.issueId === identifier);
    if (running) return running;
    if (snapshot.completed.includes(identifier)) return { identifier, status: "completed" };
    return reply.code(404).send({ error: "not_found" });
  });
  app.post("/api/v1/refresh", async (_request, reply) => {
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  app.post<{ Params: { identifier: string } }>("/api/v1/:identifier/stop", async (request, reply) => {
    const ok = await opts.stopIssue?.(decodeURIComponent(request.params.identifier));
    return ok ? reply.code(202).send({ ok: true }) : reply.code(404).send({ error: "not_found" });
  });
  app.post<{ Params: { identifier: string } }>("/api/v1/:identifier/retry", async (request, reply) => {
    const ok = await opts.retryIssue?.(decodeURIComponent(request.params.identifier));
    if (!ok) return reply.code(404).send({ error: "not_found" });
    await opts.refresh();
    return reply.code(202).send({ ok: true });
  });
  return app;
}

async function loadDashboardHtml(): Promise<string> {
  if (dashboardCache) return dashboardCache;
  const candidates = [
    new URL("./dashboard.html", import.meta.url),
    join(process.cwd(), "src/observability/dashboard.html")
  ];
  for (const candidate of candidates) {
    try {
      dashboardCache = await readFile(candidate, "utf8");
      return dashboardCache;
    } catch {
      // Try the next path; dist builds do not copy static HTML by default.
    }
  }
  dashboardCache = "<!doctype html><title>Northstar</title><main id=\"app\">Northstar dashboard</main>";
  return dashboardCache;
}
